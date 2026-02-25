const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const express = require('express');
const axios = require('axios');

puppeteer.use(StealthPlugin());

// --- SERVIDOR PARA RENDER (Mantiene el servicio "Live") ---
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.status(200).send('Worker Operativo 🟢'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Servidor en puerto ${PORT}`));

// --- CONFIGURACIÓN REDIS ---
const client = redis.createClient({ url: process.env.REDIS_URL });

async function resolverCaptcha(page) {
    try {
        console.log("🧩 Detectando Captcha...");
        const sitekey = await page.$eval('.g-recaptcha', el => el.getAttribute('data-sitekey'));
        
        console.log("📨 Enviando a 2Captcha...");
        const resp = await axios.get(`http://2captcha.com/in.php?key=${process.env.API_KEY_2CAPTCHA}&method=userrecaptcha&googlekey=${sitekey}&pageurl=${page.url()}&json=1`);
        const requestId = resp.data.request;

        while (true) {
            await new Promise(r => setTimeout(r, 5000));
            const check = await axios.get(`http://2captcha.com/res.php?key=${process.env.API_KEY_2CAPTCHA}&action=get&id=${requestId}&json=1`);
            if (check.data.status === 1) return check.data.request;
            console.log("⏳ Esperando solución del captcha...");
        }
    } catch (e) {
        console.error("❌ Error en captcha:", e.message);
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
                    '--disable-http2',
                    '--proxy-server=http://p.webshare.io:80'
                ]
            });

            const page = await browser.newPage();
            
            // Autenticación con el usuario rotativo
            await page.authenticate({
                username: 'lzwsgumc-rotate',
                password: 'satazom7w0zq'
            });

            try {
                // 1. Verificación de IP
                console.log("🌐 Verificando IP del Proxy...");
                await page.goto('http://ipv4.webshare.io/', { waitUntil: 'networkidle2', timeout: 30000 });
                const ipActual = await page.$eval('body', el => el.innerText);
                console.log(`✅ IP Proxy Activa: ${ipActual.trim()}`);

                // 2. Navegación a la Policía (URL Estándar)
                console.log("👮 Navegando a Policía Nacional...");
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
                
                // Usamos la URL sin puerto 7005 para evitar errores de túnel
                await page.goto('https://antecedentes.policia.gov.co/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle2', 
                    timeout: 60000 
                });

                // 3. Aceptar términos y condiciones
                console.log("⚖️ Buscando términos y condiciones...");
                await page.waitForSelector('#aceptoTerminos', { timeout: 15000 });
                await page.click('#aceptoTerminos');
                await page.click('input[type="submit"]');
                console.log("✅ Términos aceptados.");

                // 4. Llenar el formulario
                console.log("📝 Ingresando datos de la cédula...");
                await page.waitForSelector('#cedulaInput', { timeout: 15000 });
                await page.type('#cedulaInput', cedula);

                const token = await resolverCaptcha(page);
                if (token) {
                    await page.evaluate((t) => {
                        document.getElementById('g-recaptcha-response').innerHTML = t;
                    }, token);
                    
                    await page.click('#btnConsultar');
                    console.log("🖱️ Consulta enviada. Esperando respuesta...");
                    
                    await page.waitForSelector('#panelResultado', { timeout: 30000 });
                    const resultado = await page.$eval('#panelResultado', el => el.innerText);
                    console.log(`📊 RESULTADO FINAL: ${resultado}`);
                }

            } catch (err) {
                console.error(`❌ Error en el proceso: ${err.message}`);
            }

            await browser.close();
            console.log(`🏁 Sesión cerrada para: ${cedula}`);
        }
    } catch (err) {
        console.error("❌ Error crítico:", err);
        setTimeout(procesar, 5000);
    }
}

procesar();
