const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const express = require('express');
const axios = require('axios');

puppeteer.use(StealthPlugin());

const app = express();
app.listen(process.env.PORT || 10000, '0.0.0.0');

const client = redis.createClient({ url: process.env.REDIS_URL });

async function procesar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📡 Worker Pro listo. Esperando tareas...");

        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            if (!tareaRaw) continue;
            const { cedula } = JSON.parse(tareaRaw.element);
            
            const browser = await puppeteer.launch({
                headless: "new",
                executablePath: '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--proxy-server=http://p.webshare.io:80'
                ]
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 800 });
            await page.authenticate({ username: 'lzwsgumc-200', password: 'satazom7w0zq' });

            try {
                console.log(`🔎 Consultando: ${cedula}`);
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

                // 1. Navegación con espera de red tranquila
                await page.goto('https://antecedentes.policia.gov.co/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle2', 
                    timeout: 60000 
                });

                // 2. TRUCO PRO: Scroll para activar eventos de visibilidad
                console.log("⚖️ Analizando página...");
                await page.evaluate(() => window.scrollBy(0, 500));
                await new Promise(r => setTimeout(r, 3000));

                // 3. Intento de clic forzado por JavaScript (salta el error de 'Waiting failed')
                const clicsExitosos = await page.evaluate(() => {
                    const check = document.querySelector('#aceptoTerminos');
                    const btn = document.querySelector('input[type="submit"]');
                    if (check && btn) {
                        check.click();
                        // Pequeño delay interno para que se habilite el botón
                        setTimeout(() => btn.click(), 500);
                        return true;
                    }
                    return false;
                });

                if (clicsExitosos) {
                    console.log("✅ Selector operado mediante inyección directa.");
                } else {
                    // Si falla el JS, intentamos el método tradicional una vez más
                    console.log("⚠️ JS directo falló, intentando selector tradicional...");
                    await page.waitForSelector('#aceptoTerminos', { visible: true, timeout: 15000 });
                    await page.click('#aceptoTerminos');
                    await page.click('input[type="submit"]');
                }

                // 4. Verificación de entrada al formulario
                await page.waitForSelector('#cedulaInput', { timeout: 20000 });
                console.log("🚀 ¡Logramos entrar al formulario de consulta!");

            } catch (err) {
                const title = await page.title();
                console.error(`❌ Error en el proceso: ${err.message}. Título: ${title}`);
                // Si el título es "403 Forbidden", la IP de ETB ha sido bloqueada temporalmente.
            }

            await browser.close();
            console.log("🏁 Sesión cerrada.");
        }
    } catch (err) {
        setTimeout(procesar, 5000);
    }
}

procesar();
