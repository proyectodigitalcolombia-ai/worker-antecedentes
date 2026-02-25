import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import redis from 'redis';

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.status(200).send('Worker Activo 🟢'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Servidor de salud en puerto ${PORT}`));

puppeteer.use(StealthPlugin());
const client = redis.createClient({ url: process.env.REDIS_URL });

async function procesar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("✅ Conectado a Redis. Esperando tareas...");

        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            if (!tareaRaw) continue;

            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Iniciando consulta para: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: "new", // Usamos el nuevo modo headless que es más indetectable
                executablePath: '/usr/bin/google-chrome-stable',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--lang=es-ES,es',
                    '--ignore-certificate-errors'
                ]
            });

            const page = await browser.newPage();
            
            // 1. Configuramos una identidad de Chrome REAL de Windows
            await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-ES,es;q=0.9' });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

            try {
                console.log("👮 Navegando a puerto 7005...");
                // Usamos una navegación más "paciente"
                await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'load', 
                    timeout: 90000 
                });

                console.log("⏳ Esperando que PrimeFaces genere el formulario...");
                // Esperamos específicamente a que el número de DIVs crezca (señal de carga de JS)
                await page.waitForFunction(() => document.querySelectorAll('div').length > 50, { timeout: 30000 }).catch(() => {});

                const resultado = await page.evaluate(() => {
                    // Buscamos el checkbox por la clase específica de PrimeFaces
                    const check = document.querySelector('.ui-chkbox-box') || document.querySelector('div[id*="acepto"]');
                    const btn = Array.from(document.querySelectorAll('.ui-button, button')).find(b => b.innerText.includes('Aceptar'));

                    if (check && btn) {
                        check.click();
                        return { found: true };
                    }
                    return { 
                        found: false, 
                        divs: document.querySelectorAll('div').length,
                        html: document.body.innerHTML.includes('reCAPTCHA') ? 'BLOQUEO_CAPTCHA' : 'PAGINA_INCOMPLETA'
                    };
                });

                if (resultado.found) {
                    console.log("⚖️ Términos aceptados.");
                    await new Promise(r => setTimeout(r, 1000));
                    await page.keyboard.press('Enter');
                    
                    await page.waitForSelector('input[id*="cedula"]', { timeout: 15000 });
                    console.log("🚀 ¡Formulario de consulta ALCANZADO!");
                } else {
                    console.log("⚠️ Estado de la página:", resultado);
                    // Si falla, necesitamos saber si hay un captcha escondido
                }

            } catch (err) {
                console.error(`❌ Error en el flujo: ${err.message}`);
            }

            await browser.close();
            console.log("🏁 Sesión finalizada.");
        }
    } catch (err) {
        console.error("❌ Error Crítico:", err);
        setTimeout(procesar, 5000);
    }
}

procesar();
