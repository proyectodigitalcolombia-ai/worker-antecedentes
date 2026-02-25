import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import redis from 'redis';

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.status(200).send('Worker Activo 🟢'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Health Check en puerto ${PORT}`));

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
                headless: false,
                executablePath: '/usr/bin/google-chrome-stable',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors'],
                env: { DISPLAY: ':99' }
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1366, height: 768 });
            
            try {
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

                console.log("👮 Navegando a puerto 7005...");
                await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle2', 
                    timeout: 60000 
                });

                await new Promise(r => setTimeout(r, 12000));

                const resultado = await page.evaluate(() => {
                    // 1. Buscamos cualquier cosa que parezca un checkbox de PrimeFaces
                    const possibleChecks = document.querySelectorAll('.ui-chkbox-box, .ui-chkbox, div[class*="chkbox"]');
                    const check = possibleChecks[0];
                    
                    // 2. Buscamos cualquier botón que diga "Aceptar"
                    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], .ui-button'));
                    const btn = buttons.find(b => b.textContent.includes('Aceptar') || (b.value && b.value.includes('Aceptar')));

                    if (check && btn) {
                        check.click();
                        return { found: true, msg: "Elementos encontrados y clicados" };
                    }
                    
                    return { 
                        found: false, 
                        totalDivs: document.querySelectorAll('div').length,
                        iframes: document.querySelectorAll('iframe').length,
                        textSnippet: document.body.innerText.substring(0, 100)
                    };
                });

                if (resultado.found) {
                    console.log("⚖️ Checkbox y Botón accionados.");
                    await new Promise(r => setTimeout(r, 2000));
                    
                    // Refuerzo: Presionamos Enter por si el click del botón no disparó el form
                    await page.keyboard.press('Enter');
                    
                    console.log("⏳ Esperando formulario final...");
                    await page.waitForSelector('input', { timeout: 15000 });
                    console.log("📝 ¡Formulario de consulta ALCANZADO!");
                } else {
                    console.log("⚠️ Estructura no reconocida:", resultado);
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
