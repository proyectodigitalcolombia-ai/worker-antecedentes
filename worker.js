const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const express = require('express');
const axios = require('axios');

puppeteer.use(StealthPlugin());

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
        console.log("🚀 Worker conectado a Redis y listo para rotar IPs.");

        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Consultando cédula: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: "new",
                executablePath: '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-http2', // VITAL: La policía bloquea túneles HTTP2
                    '--ignore-certificate-errors',
                    `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`
                ]
            });

            const page = await browser.newPage();
            
            // Autenticación con el usuario rotativo
            await page.authenticate({
                username: process.env.PROXY_USER,
                password: process.env.PROXY_PASS
            });

            try {
                // Paso 1: Test de túnel (Si esto falla, el proxy está caído)
                console.log("🌐 Verificando túnel de red...");
                await page.goto('https://api.ipify.org', { waitUntil: 'networkidle2', timeout: 30000 });
                const ip = await page.$eval('body', el => el.innerText);
                console.log(`✅ Túnel OK! IP asignada: ${ip}`);

                // Paso 2: Navegación a la Policía con User-Agent real
                console.log("👮 Navegando a Policía Nacional...");
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
                
                // Usamos una espera más larga y manejamos el error de túnel específico
                await page.goto('https://srvandroid.policia.gov.co/Antecedentes/', { 
                    waitUntil: 'networkidle2', 
                    timeout: 90000 
                });

                console.log("📝 Página cargada. Llenando formulario...");
                await page.waitForSelector('#Cedula', { timeout: 15000 });
                await page.type('#Cedula', cedula);

                const token = await resolverCaptcha(page);
                if (token) {
                    await page.evaluate((t) => {
                        document.getElementById('g-recaptcha-response').innerHTML = t;
                    }, token);
                    
                    await page.click('#Consultar');
                    console.log("🖱️ Consultando...");
                    
                    await page.waitForSelector('#Resultado', { timeout: 30000 });
                    const res = await page.$eval('#Resultado', el => el.innerText);
                    console.log(`📊 RESULTADO FINAL: ${res}`);
                }

            } catch (err) {
                console.error(`❌ Error en el proceso: ${err.message}`);
                // Si falla el túnel aquí, la IP está bloqueada por la Policía
                console.log("💡 Sugerencia: La IP fue rechazada por el destino. Reintentando con otra IP...");
            }

            await browser.close();
            console.log(`🏁 Sesión terminada para ${cedula}`);
        }
    } catch (err) {
        console.error("❌ Error fatal:", err);
        setTimeout(procesar, 5000);
    }
}

procesar();
