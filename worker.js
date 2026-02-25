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
        console.log("📡 Worker en línea...");

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
                    '--disable-blink-features=AutomationControlled', // Esencial para ocultar el bot
                    '--proxy-server=http://p.webshare.io:80'
                ]
            });

            const page = await browser.newPage();
            
            // Forzamos que el navegador no parezca automatizado
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
            });

            await page.authenticate({ username: 'lzwsgumc-200', password: 'satazom7w0zq' });

            try {
                // 1. User-Agent real de Windows
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

                console.log("👮 Navegando a la Policía...");
                // Usamos networkidle2 para esperar a que los scripts de seguridad terminen
                await page.goto('https://antecedentes.policia.gov.co/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle2', 
                    timeout: 70000 
                });

                // Diagnóstico: ¿Qué cargó realmente?
                const pageTitle = await page.title();
                console.log(`📄 Título de la página: "${pageTitle}"`);

                console.log("⚖️ Buscando términos...");
                // Esperamos un poco más y verificamos visibilidad
                const selector = '#aceptoTerminos';
                await page.waitForSelector(selector, { visible: true, timeout: 45000 });
                
                await page.click(selector);
                console.log("✅ Clic en términos. Esperando botón de envío...");
                
                await new Promise(r => setTimeout(r, 2000)); // Pausa táctica
                await page.click('input[type="submit"]');
                
                console.log("🚀 ¡Entramos al formulario de cédula!");

            } catch (err) {
                // Si falla, pedimos el HTML para ver si hay un bloqueo de Cloudflare o 403
                const content = await page.content();
                console.error(`❌ Error: ${err.message}`);
                if (content.includes("bloqueado") || content.includes("denied") || content.includes("Access")) {
                    console.error("🚫 BLOQUEO DETECTADO: La Policía rechazó la conexión a pesar de ser IP CO.");
                }
            }

            await browser.close();
        }
    } catch (err) {
        setTimeout(procesar, 5000);
    }
}

procesar();
