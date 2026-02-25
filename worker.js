const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');

// 1. Health Check - Prioridad para que Render no aborte
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.status(200).send('Worker Activo 🟢'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Servidor de salud activo en puerto ${PORT}`));

// 2. Configuración de Puppeteer
puppeteer.use(StealthPlugin());
const client = redis.createClient({ url: process.env.REDIS_URL });

async function procesar() {
    try {
        console.log("📡 Conectando a Redis...");
        if (!client.isOpen) await client.connect();
        console.log("✅ Conectado. Esperando tareas...");

        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            if (!tareaRaw) continue;

            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Consultando cédula: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: false, // Usamos la pantalla virtual Xvfb
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
            
            // Autenticación Proxy (Credenciales Colombia)
            await page.authenticate({ username: 'lzwsgumc-200', password: 'satazom7w0zq' });

            try {
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

                console.log("👮 Navegando a la Policía...");
                await page.goto('https://antecedentes.policia.gov.co/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'load', 
                    timeout: 60000 
                });

                // Pausa de 8 segundos que funcionó hoy
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

                // Esperamos el formulario
                await page.waitForSelector('#cedulaInput', { timeout: 20000 });
                console.log("✅ ¡Formulario visible!");

                // Captura del Captcha en Base64 para enviarlo a tu sistema
                const captcha = await page.$('img[id*="captcha"]');
                if (captcha) {
                    const b64 = await captcha.screenshot({ encoding: 'base64' });
                    console.log("📸 Captcha capturado exitosamente.");
                    
                    // Aquí podrías enviar el b64 a una API o guardarlo en Redis
                }

            } catch (err) {
                console.error(`❌ Error en el flujo: ${err.message}`);
            }

            await browser.close();
            console.log("🏁 Sesión cerrada. Esperando siguiente tarea...");
        }
    } catch (err) {
        console.error("❌ Error Crítico:", err);
        setTimeout(procesar, 5000);
    }
}

procesar();
