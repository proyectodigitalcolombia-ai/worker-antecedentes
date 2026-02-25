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
                headless: "new",
                executablePath: '/usr/bin/google-chrome-stable',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--ignore-certificate-errors',
                    '--disable-web-security'
                ]
            });

            const page = await browser.newPage();
            
            try {
                // Identidad de Chrome Real
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

                console.log("👮 Navegando a puerto 7005...");
                await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle2', 
                    timeout: 60000 
                });

                // ESPERA TÉCNICA: Damos tiempo a PrimeFaces
                await new Promise(r => setTimeout(r, 15000));

                console.log("💉 Intentando inyección de click forzada...");
                
                const resultado = await page.evaluate(() => {
                    // 1. Buscamos el checkbox por ID de PrimeFaces (suele ser 'aceptoTerminos')
                    // O por su clase visual si el ID cambió
                    const check = document.querySelector('.ui-chkbox-box') || 
                                  document.querySelector('div[id*="acepto"]') ||
                                  document.querySelector('.ui-chkbox-icon');
                    
                    // 2. Buscamos el botón "Aceptar"
                    const btn = document.querySelector('button[id*="continuar"]') || 
                                document.querySelector('.ui-button') ||
                                Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Aceptar'));

                    if (check && btn) {
                        check.click(); // Click al checkbox
                        return { found: true };
                    }
                    
                    // Si no los halló, devolvemos qué botones SI vio
                    const allBtns = Array.from(document.querySelectorAll('button')).map(b => b.innerText);
                    return { found: false, btnsVistos: allBtns };
                });

                if (resultado.found) {
                    console.log("⚖️ Checkbox inyectado. Enviando formulario...");
                    await new Promise(r => setTimeout(r, 1000));
                    
                    // Usamos el teclado como último recurso infalible
                    await page.keyboard.press('Enter'); 
                    
                    // Esperamos el input de la cédula
                    await page.waitForSelector('input', { timeout: 15000 });
                    console.log("🚀 ¡EXITO! Formulario alcanzado.");
                } else {
                    console.log("⚠️ No se hallaron elementos. Botones en página:", resultado.btnsVistos);
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
