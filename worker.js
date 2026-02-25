const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const express = require('express');
const axios = require('axios'); // Para comunicarnos con 2Captcha

puppeteer.use(StealthPlugin());

// --- SERVIDOR DE SALUD PARA RENDER ---
const app = express();
app.get('/', (req, res) => res.status(200).send('Worker Operativo 🕵️‍♂️'));
app.listen(process.env.PORT || 10000);

// --- CONEXIÓN REDIS ---
const client = redis.createClient({ url: process.env.REDIS_URL });

// --- FUNCIÓN PARA RESOLVER CAPTCHA ---
async function resolverCaptcha(page) {
    console.log("🧩 Detectando Captcha...");
    const sitekey = await page.$eval('.g-recaptcha', el => el.getAttribute('data-sitekey'));
    const pageUrl = page.url();

    // Enviar a 2Captcha
    const resp = await axios.get(`http://2captcha.com/in.php?key=${process.env.API_KEY_2CAPTCHA}&method=userrecaptcha&googlekey=${sitekey}&pageurl=${pageUrl}&json=1`);
    const requestId = resp.data.request;

    // Esperar respuesta (polling)
    while (true) {
        await new Promise(r => setTimeout(r, 5000));
        const check = await axios.get(`http://2captcha.com/res.php?key=${process.env.API_KEY_2CAPTCHA}&action=get&id=${requestId}&json=1`);
        if (check.data.status === 1) {
            console.log("✅ Captcha Resuelto!");
            return check.data.request;
        }
        console.log("⏳ Esperando solución de captcha...");
    }
}

async function iniciarWorker() {
    try {
        await client.connect();
        console.log("🚀 Worker iniciado y esperando tareas...");

        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Procesando Cédula: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: "new",
                executablePath: '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`
                ]
            });

            const page = await browser.newPage();
            await page.authenticate({
                username: process.env.PROXY_USER,
                password: process.env.PROXY_PASS
            });

            try {
                // 1. Entrar a la página
                await page.goto('https://srvandroid.policia.gov.co/Antecedentes/', { waitUntil: 'networkidle2' });

                // 2. Aceptar términos (si aparece el botón)
                await page.click('#Continuar'); 
                await page.waitForTimeout(1000);

                // 3. Llenar Cédula
                await page.type('#Cedula', cedula);

                // 4. Resolver Captcha
                const token = await resolverCaptcha(page);
                await page.evaluate((token) => {
                    document.getElementById('g-recaptcha-response').innerHTML = token;
                }, token);

                // 5. Click en Buscar
                await page.click('#Consultar');
                await page.waitForSelector('#Resultado');

                const resultado = await page.$eval('#Resultado', el => el.innerText);
                console.log(`📊 Resultado para ${cedula}: ${resultado}`);

            } catch (err) {
                console.error(`❌ Error en el proceso: ${err.message}`);
            }

            await browser.close();
        }
    } catch (error) {
        console.error("❌ Error Crítico:", error);
        setTimeout(iniciarWorker, 5000);
    }
}

iniciarWorker();
