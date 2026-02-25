const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const express = require('express');
const axios = require('axios');

puppeteer.use(StealthPlugin());

// Servidor de salud para que Render no mate el proceso
const app = express();
app.get('/', (req, res) => res.status(200).send('Worker Antecedentes Activo 👮‍♂️'));
app.listen(process.env.PORT || 10000);

const client = redis.createClient({ url: process.env.REDIS_URL });

async function resolverCaptcha(page) {
    try {
        console.log("🧩 Detectando SiteKey del Captcha...");
        const sitekey = await page.$eval('.g-recaptcha', el => el.getAttribute('data-sitekey'));
        const pageUrl = page.url();

        console.log("📨 Enviando a 2Captcha...");
        const resp = await axios.get(`http://2captcha.com/in.php?key=${process.env.API_KEY_2CAPTCHA}&method=userrecaptcha&googlekey=${sitekey}&pageurl=${pageUrl}&json=1`);
        
        if (resp.data.status !== 1) throw new Error("Error al enviar a 2Captcha");
        const requestId = resp.data.request;

        while (true) {
            await new Promise(r => setTimeout(r, 5000));
            const check = await axios.get(`http://2captcha.com/res.php?key=${process.env.API_KEY_2CAPTCHA}&action=get&id=${requestId}&json=1`);
            if (check.data.status === 1) {
                console.log("✅ Captcha resuelto por 2Captcha");
                return check.data.request;
            }
            console.log("⏳ 2Captcha está trabajando...");
        }
    } catch (e) {
        console.error("❌ Falló la resolución del captcha:", e.message);
        return null;
    }
}

async function procesar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("🚀 Worker conectado a Redis. Esperando tareas...");

        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Iniciando trámite para cédula: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: "new",
                executablePath: '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-http2', // Evita conflictos con puerto 80
                    `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`
                ]
            });

            const page = await browser.newPage();
            
            // Autenticación de Webshare
            await page.authenticate({
                username: process.env.PROXY_USER,
                password: process.env.PROXY_PASS
            });

            try {
                // Timeout de 60s porque la página de la policía es lenta
                await page.goto('https://srvandroid.policia.gov.co/Antecedentes/', { 
                    waitUntil: 'networkidle2', 
                    timeout: 60000 
                });

                console.log("✅ Página cargada. Buscando botón de inicio...");
                
                // Si existe el botón "Aceptar" o "Continuar"
                const botonContinuar = await page.$('#Continuar');
                if (botonContinuar) await page.click('#Continuar');

                await page.waitForSelector('#Cedula', { timeout: 10000 });
                await page.type('#Cedula', cedula);

                const token = await resolverCaptcha(page);
                if (token) {
                    await page.evaluate((t) => {
                        document.getElementById('g-recaptcha-response').innerHTML = t;
                    }, token);

                    await page.click('#Consultar');
                    console.log("🖱️ Click en Consultar...");

                    // Esperar el resultado
                    await page.waitForSelector('#Resultado', { timeout: 20000 });
                    const resultado = await page.$eval('#Resultado', el => el.innerText);
                    console.log(`📊 RESULTADO FINAL: ${resultado}`);
                }

            } catch (err) {
                console.error(`❌ Error durante la navegación: ${err.message}`);
            }

            await browser.close();
            console.log(`🏁 Proceso terminado para ${cedula}`);
        }
    } catch (err) {
        console.error("❌ Error en el bucle principal:", err);
        setTimeout(procesar, 5000);
    }
}

procesar();
