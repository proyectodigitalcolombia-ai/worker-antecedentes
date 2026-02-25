const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const express = require('express');
const axios = require('axios');

puppeteer.use(StealthPlugin());

// Servidor para que Render mantenga el servicio activo
const app = express();
app.get('/', (req, res) => res.status(200).send('Worker Antecedentes Operativo 👮‍♂️'));
app.listen(process.env.PORT || 10000);

const client = redis.createClient({ url: process.env.REDIS_URL });

async function resolverCaptcha(page) {
    try {
        console.log("🧩 Detectando Captcha...");
        const sitekey = await page.$eval('.g-recaptcha', el => el.getAttribute('data-sitekey'));
        
        console.log("📨 Enviando a 2Captcha...");
        const resp = await axios.get(`http://2captcha.com/in.php?key=${process.env.API_KEY_2CAPTCHA}&method=userrecaptcha&googlekey=${sitekey}&pageurl=${page.url()}&json=1`);
        
        if (resp.data.status !== 1) throw new Error("Error en 2Captcha");
        const requestId = resp.data.request;

        while (true) {
            await new Promise(r => setTimeout(r, 5000));
            const check = await axios.get(`http://2captcha.com/res.php?key=${process.env.API_KEY_2CAPTCHA}&action=get&id=${requestId}&json=1`);
            if (check.data.status === 1) return check.data.request;
            console.log("⏳ Esperando solución...");
        }
    } catch (e) {
        console.error("❌ Falló el captcha:", e.message);
        return null;
    }
}

async function procesar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("🚀 Worker conectado a Redis y listo.");

        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Consultando: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: "new",
                executablePath: '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-http2', // Vital para evitar ERR_TUNNEL en puerto 80
                    `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`
                ]
            });

            const page = await browser.newPage();
            
            // Autenticación con credenciales de tu imagen
            await page.authenticate({
                username: process.env.PROXY_USER,
                password: process.env.PROXY_PASS
            });

            try {
                // Paso 1: Test de túnel
                console.log("🌐 Abriendo túnel de red...");
                await page.goto('https://api.ipify.org', { waitUntil: 'networkidle2', timeout: 30000 });
                const ip = await page.$eval('body', el => el.innerText);
                console.log(`✅ Túnel OK! IP Proxy: ${ip}`);

                // Paso 2: Navegación a la Policía
                console.log("👮 Navegando a Policía Nacional...");
                await page.goto('https://srvandroid.policia.gov.co/Antecedentes/', { 
                    waitUntil: 'networkidle2', 
                    timeout: 60000 
                });

                // Lógica de llenado
                await page.waitForSelector('#Cedula', { timeout: 10000 });
                await page.type('#Cedula', cedula);
                console.log("📝 Cédula escrita.");

                const token = await resolverCaptcha(page);
                if (token) {
                    await page.evaluate((t) => {
                        document.getElementById('g-recaptcha-response').innerHTML = t;
                    }, token);
                    await page.click('#Consultar');
                    console.log("🖱️ Click en Consultar...");
                    
                    // Esperar resultado
                    await page.waitForSelector('#Resultado', { timeout: 20000 });
                    const res = await page.$eval('#Resultado', el => el.innerText);
                    console.log(`📊 RESULTADO: ${res}`);
                }

            } catch (err) {
                console.error(`❌ Error en el proceso: ${err.message}`);
            }

            await browser.close();
            console.log(`🏁 Finalizado proceso de ${cedula}`);
        }
    } catch (err) {
        console.error("❌ Error fatal en el bucle:", err);
        setTimeout(procesar, 5000);
    }
}

procesar();
