const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const express = require('express');
const axios = require('axios');

puppeteer.use(StealthPlugin());

// --- SERVIDOR DE SALUD (Para que Render se ponga en VERDE) ---
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.status(200).send('Worker Antecedentes Operativo 🟢'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Servidor escuchando en puerto ${PORT}`));

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
        console.log("📡 Esperando tareas en Redis...");

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
                    '--disable-http2',
                    `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`
                ]
            });

            const page = await browser.newPage();
            await page.authenticate({
                username: process.env.PROXY_USER,
                password: process.env.PROXY_PASS
            });

            try {
                // 1. Verificar IP
                console.log("🌐 Verificando IP del Proxy...");
                await page.goto('https://api.ipify.org', { waitUntil: 'networkidle2', timeout: 20000 });
                const ip = await page.$eval('body', el => el.innerText);
                console.log(`✅ Usando IP: ${ip}`);

                // 2. Navegar al Portal de Escritorio (NO MÓVIL)
                console.log("👮 Navegando al Portal Judicial Oficial...");
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
                
                // Esta URL es la de escritorio que sí abre
                await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle2', 
                    timeout: 60000 
                });

                // 3. Aceptar términos y condiciones (Obligatorio en esta URL)
                console.log("⚖️ Aceptando términos y condiciones...");
                await page.waitForSelector('#aceptoTerminos', { timeout: 15000 });
                await page.click('#aceptoTerminos');
                
                // El botón continuar suele ser un input de tipo submit
                await page.click('input[type="submit"]');

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
                    console.log("🖱️ Consulta enviada.");
                    
                    await page.waitForSelector('#panelResultado', { timeout: 30000 });
                    const resultado = await page.$eval('#panelResultado', el => el.innerText);
                    console.log(`📊 RESULTADO FINAL: ${resultado}`);
                }

            } catch (err) {
                console.error(`❌ Error en la ruta: ${err.message}`);
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
