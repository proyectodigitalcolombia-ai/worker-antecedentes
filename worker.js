const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');

// --- 1. HEALTH CHECK (Prioridad para que Render mantenga el servicio activo) ---
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.status(200).send('Worker Antedecentes Operativo 🟢');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor de salud escuchando en el puerto ${PORT}`);
});

// --- 2. CONFIGURACIÓN DE PUPPETEER ---
puppeteer.use(StealthPlugin());
const client = redis.createClient({ url: process.env.REDIS_URL });

async function procesar() {
    try {
        console.log("📡 Conectando a Redis...");
        if (!client.isOpen) await client.connect();
        console.log("✅ Conectado a Redis. Esperando tareas...");

        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            if (!tareaRaw) continue;

            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Consultando cédula: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: false, // DEBE ser false para que Xvfb funcione
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--proxy-server=http://p.webshare.io:80',
                    '--ignore-certificate-errors',
                    '--ignore-ssl-errors',
                    '--disable-web-security',
                    '--window-size=1920,1080'
                ],
                env: {
                    ...process.env,
                    DISPLAY: ':99' // Se vincula con el servidor X virtual
                }
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });

            // Autenticación del Proxy (IP Colombia)
            await page.authenticate({
                username: 'lzwsgumc-200',
                password: 'satazom7w0zq'
            });

            try {
                // User-Agent real de Windows
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

                console.log("👮 Navegando al portal de la Policía...");
                await page.goto('https://antecedentes.policia.gov.co/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'load', 
                    timeout: 60000 
                });

                // Pausa táctica de 8 segundos (clave del éxito de hoy)
                await new Promise(r => setTimeout(r, 8000));

                console.log("⚖️ Aceptando términos...");
                const exitoTerminos = await page.evaluate(() => {
                    const check = document.querySelector('#aceptoTerminos');
                    const btn = document.querySelector('input[type="submit"]');
                    if (check && btn) {
                        check.click();
                        setTimeout(() => btn.click(), 1000);
                        return true;
                    }
                    return false;
                });

                if (exitoTerminos) {
                    await page.waitForSelector('#cedulaInput', { timeout: 20000 });
                    console.log("✅ ¡Formulario visible!");

                    // Captura del Captcha
                    const captcha = await page.$('img[id*="captcha"]');
                    if (captcha) {
                        const b64 = await captcha.screenshot({ encoding: 'base64' });
                        console.log("📸 Captcha capturado exitosamente.");
                        // Aquí procesas el captcha o lo devuelves
                    }
                } else {
                    console.error("❌ El botón de términos no respondió.");
                }

            } catch (err) {
                console.error(`❌ Error en navegación: ${err.message}`);
            }

            await browser.close();
            console.log("🏁 Sesión cerrada. Esperando nueva tarea...");
        }
    } catch (err) {
        console.error("❌ Error Crítico:", err);
        // Reintento automático en caso de caída de Redis
        setTimeout(procesar, 5000);
    }
}

procesar();
