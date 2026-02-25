const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const express = require('express');
const axios = require('axios');

puppeteer.use(StealthPlugin());

const app = express();
app.listen(process.env.PORT || 10000);

const client = redis.createClient({ url: process.env.REDIS_URL });

async function procesar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📡 Worker a la espera...");

        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            if (!tareaRaw) continue;
            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Procesando cédula: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: "new",
                executablePath: '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--single-process',
                    '--no-zygote',
                    '--proxy-server=http://p.webshare.io:80'
                ]
            });

            const page = await browser.newPage();
            
            // Credenciales fijas de tu IP colombiana
            await page.authenticate({
                username: 'lzwsgumc-200',
                password: 'satazom7w0zq'
            });

            try {
                // Bloqueo agresivo de recursos para que Render no colapse (Ahorra 70% RAM)
                await page.setRequestInterception(true);
                page.on('request', (req) => {
                    if (['image', 'font', 'stylesheet', 'media'].includes(req.resourceType())) {
                        req.abort();
                    } else {
                        req.continue();
                    }
                });

                console.log("👮 Navegando a Policía Nacional...");
                await page.goto('https://antecedentes.policia.gov.co/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'domcontentloaded', 
                    timeout: 60000 
                });

                console.log("⚖️ Buscando selector...");
                await page.waitForSelector('#aceptoTerminos', { timeout: 40000 });
                
                await page.click('#aceptoTerminos');
                await page.evaluate(() => {
                    const btn = document.querySelector('input[type="submit"]');
                    if (btn) btn.click();
                });
                
                console.log("✅ Términos aceptados. Esperando formulario...");
                await page.waitForSelector('#cedulaInput', { timeout: 20000 });
                
                // Aquí seguiría tu lógica de 2Captcha...
                console.log("📝 Formulario listo para captcha.");

            } catch (err) {
                console.error(`❌ Error en navegación: ${err.message}`);
            }

            await browser.close();
            console.log("🏁 Sesión cerrada.");
        }
    } catch (err) {
        setTimeout(procesar, 5000);
    }
}

procesar();
