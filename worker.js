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
        console.log("✅ Conectado a Redis.");

        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            if (!tareaRaw) continue;

            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Iniciando consulta para: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: "new",
                executablePath: '/usr/bin/google-chrome-stable',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors']
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 800 });
            
            try {
                console.log("👮 Navegando a puerto 7005...");
                await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle2', 
                    timeout: 60000 
                });

                // 1. Simular lectura (Humano)
                console.log("📜 Simulando lectura de términos...");
                await page.mouse.wheel({ deltaY: 500 });
                await new Promise(r => setTimeout(r, 8000));

                // 2. Click en el checkbox usando su clase de PrimeFaces
                console.log("⚖️ Marcando checkbox...");
                await page.evaluate(() => {
                    const chk = document.querySelector('.ui-chkbox-box') || document.querySelector('div[id*="acepto"]');
                    if (chk) chk.click();
                });

                // ESPERA CRÍTICA: Esperamos a que el ViewState de PrimeFaces se actualice
                await new Promise(r => setTimeout(r, 5000));

                // 3. Click en ENVIAR
                console.log("🚀 Enviando formulario...");
                const clickExitoso = await page.evaluate(() => {
                    const btn = Array.from(document.querySelectorAll('button, .ui-button'))
                                     .find(b => b.innerText.includes('Enviar') || b.innerText.includes('Aceptar'));
                    if (btn) {
                        btn.click();
                        return true;
                    }
                    return false;
                });

                if (clickExitoso) {
                    await new Promise(r => setTimeout(r, 10000)); // La transición al formulario es lenta
                    
                    const resultado = await page.evaluate(() => {
                        const input = document.querySelector('input[id*="cedula"]') || document.querySelector('input[type="text"]');
                        return {
                            paso: !!input,
                            txt: document.body.innerText.substring(0, 50).replace(/\n/g, ' ')
                        };
                    });

                    if (resultado.paso) {
                        console.log("🚀 ¡EXITO! Formulario de cédula cargado.");
                    } else {
                        console.log(`⚠️ No hubo cambio. Pantalla dice: "${resultado.txt}"`);
                        console.log("⌨️ Reintento con Enter...");
                        await page.keyboard.press('Enter');
                        await new Promise(r => setTimeout(r, 5000));
                    }
                }

            } catch (err) {
                console.error(`❌ Error: ${err.message}`);
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
