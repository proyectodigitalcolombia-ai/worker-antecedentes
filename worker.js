const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');

// 1. Health Check (Prioridad #1 para Render)
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.status(200).send('Worker Activo 🟢'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Health Check en puerto ${PORT}`));

puppeteer.use(StealthPlugin());
const client = redis.createClient({ url: process.env.REDIS_URL });

async function procesar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📡 Conectado a Redis. Esperando tareas...");

        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            if (!tareaRaw) continue;

            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Consultando cédula: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: false, // Usamos la pantalla virtual de Xvfb
                executablePath: '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--proxy-server=http://p.webshare.io:80',
                    '--ignore-certificate-errors',
                    '--ignore-ssl-errors',
                    '--disable-web-security'
                ],
                env: { DISPLAY: ':99' }
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1366, height: 768 });
            await page.authenticate({ username: 'lzwsgumc-200', password: 'satazom7w0zq' });

            try {
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

                console.log("👮 Cargando portal...");
                await page.goto('https://antecedentes.policia.gov.co/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'load', 
                    timeout: 60000 
                });

                // Esta pausa de 8 segundos fue la que nos dio el éxito hoy
                await new Promise(r => setTimeout(r, 8000));

                console.log("⚖️ Aceptando términos...");
                await page.evaluate(() => {
                    const check = document.querySelector('#aceptoTerminos');
                    const btn = document.querySelector('input[type="submit"]');
                    if (check && btn) {
                        check.click();
                        setTimeout(() => btn.click(), 1000);
                    }
                });

                // Esperamos el formulario que vimos hoy
                await page.waitForSelector('#cedulaInput', { timeout: 20000 });
                console.log("✅ ¡Formulario visible!");

                // Aquí es donde estábamos: listos para capturar la imagen
                const captcha = await page.$('img[id*="captcha"]');
                if (captcha) {
                    const b64 = await captcha.screenshot({ encoding: 'base64' });
                    console.log("📸 Captcha obtenido en Base64 (Listo para procesar)");
                    // Aquí enviaremos el b64 a tu API o Redis
                }

            } catch (err) {
                console.error(`❌ Error: ${err.message}`);
            }

            await browser.close();
            console.log("🏁 Sesión finalizada.");
        }
    } catch (err) {
        setTimeout(procesar, 5000);
    }
}

procesar();
