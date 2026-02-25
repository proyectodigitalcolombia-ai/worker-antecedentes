const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const express = require('express');
const axios = require('axios');

puppeteer.use(StealthPlugin());

// --- SERVIDOR DE SALUD PARA RENDER ---
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.status(200).send('Worker Activo 🟢'));
app.listen(PORT, '0.0.0.0');

// --- CONFIGURACIÓN REDIS ---
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
            console.log("⏳ Esperando solución del captcha...");
        }
    } catch (e) {
        console.error("❌ Error en Captcha:", e.message);
        return null;
    }
}

async function procesar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📡 Worker iniciado. Esperando tareas...");

        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            if (!tareaRaw) continue;

            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Consultando cédula: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: "new",
                executablePath: '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--proxy-server=http://p.webshare.io:80'
                ]
            });

            const page = await browser.newPage();
            
            // Usamos las credenciales de tu panel (Proxy Colombia)
            await page.authenticate({
                username: 'lzwsgumc-200', 
                password: 'satazom7w0zq'
            });

            try {
                // 1. Verificación Geográfica
                console.log("🌐 Verificando IP y País...");
                await page.goto('http://ip-api.com/json/', { timeout: 30000 });
                const geoData = await page.$eval('body', el => JSON.parse(el.innerText));
                console.log(`🌍 IP: ${geoData.query} | País: ${geoData.country} (${geoData.countryCode})`);

                if (geoData.countryCode !== 'CO') {
                    console.warn("⚠️ ADVERTENCIA: La IP no es de Colombia. Es probable que la Policía bloquee la conexión.");
                }

                // 2. Navegar a la Policía
                console.log("👮 Accediendo al portal de la Policía...");
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
                
                await page.goto('https://antecedentes.policia.gov.co/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'domcontentloaded', 
                    timeout: 60000 
                });

                // 3. Aceptar términos (Con más tiempo de espera)
                console.log("⚖️ Buscando botón de términos...");
                await page.waitForSelector('#aceptoTerminos', { timeout: 45000 });
                await page.click('#aceptoTerminos');
                await page.click('input[type="submit"]');
                console.log("✅ Términos aceptados.");

                // 4. Formulario de Cédula
                await page.waitForSelector('#cedulaInput', { timeout: 20000 });
                await page.type('#cedulaInput', cedula);

                const token = await resolverCaptcha(page);
                if (token) {
                    await page.evaluate((t) => {
                        document.getElementById('g-recaptcha-response').innerHTML = t;
                    }, token);
                    await page.click('#btnConsultar');
                    
                    console.log("🖱️ Consulta enviada. Esperando respuesta final...");
                    await page.waitForSelector('#panelResultado', { timeout: 30000 });
                    const res = await page.$eval('#panelResultado', el => el.innerText);
                    console.log(`📊 RESULTADO: ${res}`);
                }

            } catch (err) {
                console.error(`❌ Fallo en la navegación: ${err.message}`);
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
