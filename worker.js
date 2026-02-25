const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const express = require('express');
const axios = require('axios');

puppeteer.use(StealthPlugin());

const app = express();
app.get('/', (req, res) => res.status(200).send('Worker OK 🟢'));
app.listen(process.env.PORT || 10000);

const client = redis.createClient({ url: process.env.REDIS_URL });

async function procesar() {
    try {
        if (!client.isOpen) await client.connect();

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
                    '--proxy-server=http://p.webshare.io:80' // Según tu imagen
                ]
            });

            const page = await browser.newPage();
            
            // Credenciales exactas de tu captura image_b63c45.png
            await page.authenticate({
                username: 'lzwsgumc-200', // Usuario específico para esa IP
                password: 'satazom7w0zq'  // Contraseña confirmada
            });

            try {
                // 1. Verificación de IP (Debe salir Colombia)
                console.log("🌐 Conectando vía Colombia...");
                await page.goto('http://ipv4.webshare.io/', { timeout: 30000 });
                const ipInfo = await page.$eval('body', el => el.innerText);
                console.log(`✅ IP Actual: ${ipInfo.trim()}`);

                // 2. Navegación a la Policía
                console.log("👮 Accediendo al portal de la Policía...");
                await page.goto('https://antecedentes.policia.gov.co/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'domcontentloaded', 
                    timeout: 60000 
                });

                // 3. Esperar el botón de términos
                await page.waitForSelector('#aceptoTerminos', { timeout: 30000 });
                console.log("⚖️ ¡Botón encontrado! Aceptando términos...");
                await page.click('#aceptoTerminos');
                await page.click('input[type="submit"]');

                // 4. Llenar Cédula
                await page.waitForSelector('#cedulaInput', { timeout: 20000 });
                await page.type('#cedulaInput', cedula);
                console.log("📝 Cédula ingresada. Resolviendo captcha...");

                // ... resto de tu lógica de captcha y resultado

            } catch (err) {
                console.error(`❌ Error: ${err.message}`);
            }

            await browser.close();
        }
    } catch (e) {
        setTimeout(procesar, 5000);
    }
}

procesar();
