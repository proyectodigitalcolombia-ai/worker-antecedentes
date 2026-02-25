const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');

// --- SERVER DE SALUD ---
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.status(200).send('Worker Operativo 🟢'));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Health Check en puerto ${PORT}`));

// --- CONFIGURACIÓN ---
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
            console.log(`🔎 Consultando cédula: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: false,
                executablePath: '/usr/bin/google-chrome-stable',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    // Si el puerto 7005 falla con proxy, comenta la línea de abajo para probar
                    '--proxy-server=http://p.webshare.io:80', 
                    '--ignore-certificate-errors',
                    '--ignore-ssl-errors',
                    '--disable-web-security',
                    '--window-size=1920,1080'
                ],
                env: { DISPLAY: ':99' }
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });
            await page.authenticate({ username: 'lzwsgumc-200', password: 'satazom7w0zq' });

            try {
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

                console.log("👮 Navegando al portal (Puerto 7005)...");
                // URL actualizada con el puerto correcto
                await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle2', 
                    timeout: 60000 
                });

                await new Promise(r => setTimeout(r, 8000));

                console.log("⚖️ Intentando aceptar términos...");
                const exito = await page.evaluate(() => {
                    const check = document.querySelector('input[type="checkbox"], #aceptoTerminos');
                    const btn = document.querySelector('input[type="submit"], #continuar');
                    if (check && btn) {
                        check.click();
                        setTimeout(() => btn.click(), 500);
                        return true;
                    }
                    return false;
                });

                if (exito) {
                    console.log("✅ Términos aceptados. Buscando formulario...");
                    await page.waitForSelector('input', { timeout: 15000 });
                    console.log("📝 ¡Formulario alcanzado!");
                    
                    const captcha = await page.$('img');
                    if (captcha) {
                        const b64 = await captcha.screenshot({ encoding: 'base64' });
                        console.log("📸 Captcha capturado.");
                    }
                }

            } catch (err) {
                console.error(`❌ Error en navegación: ${err.message}`);
                // Si el error es SSL, tomamos una captura para ver qué dice la página
                await page.screenshot({ path: 'error_debug.png' });
            }

            await browser.close();
        }
    } catch (err) {
        console.error("❌ Error Crítico:", err);
        setTimeout(procesar, 5000);
    }
}

procesar();
