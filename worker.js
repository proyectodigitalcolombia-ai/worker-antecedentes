const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const express = require('express');
const axios = require('axios');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.status(200).send('Worker Antecedentes Operativo 👮‍♂️'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Puerto ${PORT} abierto.`));

const client = redis.createClient({ url: process.env.REDIS_URL });

async function resolverCaptcha(page) {
    try {
        console.log("🧩 Detectando Captcha...");
        const sitekey = await page.$eval('.g-recaptcha', el => el.getAttribute('data-sitekey'));
        const resp = await axios.get(`http://2captcha.com/in.php?key=${process.env.API_KEY_2CAPTCHA}&method=userrecaptcha&googlekey=${sitekey}&pageurl=${page.url()}&json=1`);
        const requestId = resp.data.request;
        while (true) {
            await new Promise(r => setTimeout(r, 5000));
            const check = await axios.get(`http://2captcha.com/res.php?key=${process.env.API_KEY_2CAPTCHA}&action=get&id=${requestId}&json=1`);
            if (check.data.status === 1) return check.data.request;
            console.log("⏳ Esperando solución...");
        }
    } catch (e) {
        return null;
    }
}

async function procesar() {
    try {
        await client.connect();
        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Consultando: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: "new",
                executablePath: '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox', '--disable-setuid-sandbox', '--disable-http2',
                    `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`
                ]
            });

            const page = await browser.newPage();
            await page.authenticate({ username: process.env.PROXY_USER, password: process.env.PROXY_PASS });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

            try {
                // Ir a la URL que sí carga (Portal Ciudadano)
                console.log("👮 Navegando a Policía Nacional...");
                await page.goto('https://antecedentes.policia.gov.co/WebJudicial/antecedentes.xhtml', { waitUntil: 'networkidle2', timeout: 60000 });

                // Aceptar Términos y Condiciones
                console.log("⚖️ Aceptando términos...");
                await page.waitForSelector('#aceptoTerminos', { timeout: 10000 });
                await page.click('#aceptoTerminos');
                await page.click('input[type="submit"]'); // Botón Continuar

                // Llenar Formulario
                console.log("📝 Llenando datos...");
                await page.waitForSelector('#cedulaInput', { timeout: 10000 });
                await page.type('#cedulaInput', cedula);
                
                const token = await resolverCaptcha(page);
                if (token) {
                    await page.evaluate((t) => { document.getElementById('g-recaptcha-response').innerHTML = t; }, token);
                    await page.click('#btnConsultar');
                    
                    await page.waitForSelector('#panelResultado', { timeout: 20000 });
                    const res = await page.$eval('#panelResultado', el => el.innerText);
                    console.log(`📊 RESULTADO: ${res}`);
                }
            } catch (err) {
                console.error(`❌ Error: ${err.message}`);
            }
            await browser.close();
        }
    } catch (err) {
        setTimeout(procesar, 5000);
    }
}
procesar();
