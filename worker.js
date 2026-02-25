// 1. Importaciones al principio
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const express = require('express');
const axios = require('axios');

// 2. Configuración
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.status(200).send('Worker OK 🟢'));
app.listen(PORT, '0.0.0.0');

const client = redis.createClient({ url: process.env.REDIS_URL });

// 3. Función Principal
async function procesar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📡 Conectado a Redis. Esperando tareas...");

        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            if (!tareaRaw) continue;

            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Consultando cédula: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: "new",
                executablePath: '/usr/bin/google-chrome', // Ruta del Dockerfile
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--proxy-server=http://p.webshare.io:80'
                ]
            });

            const page = await browser.newPage();
            
            // Autenticación Proxy
            await page.authenticate({
                username: 'lzwsgumc-200', 
                password: 'satazom7w0zq'
            });

            try {
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

                console.log("👮 Navegando a la Policía...");
                await page.goto('https://antecedentes.policia.gov.co/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle2', 
                    timeout: 60000 
                });

                // Espera táctica
                await new Promise(r => setTimeout(r, 5000));

                console.log("⚖️ Buscando términos...");
                await page.waitForSelector('#aceptoTerminos', { visible: true, timeout: 30000 });
                
                await page.click('#aceptoTerminos');
                await new Promise(r => setTimeout(r, 1000));
                await page.click('input[type="submit"]');
                
                console.log("✅ ¡Entramos al formulario!");
                // Aquí sigue tu lógica de llenado...

            } catch (err) {
                console.error(`❌ Error en flujo: ${err.message}`);
            }

            await browser.close();
            console.log("🏁 Sesión cerrada.");
        }
    } catch (error) {
        console.error("❌ Error Crítico:", error);
        setTimeout(procesar, 5000); // Reintento si Redis falla
    }
}

// 4. Arrancar el proceso
procesar();
