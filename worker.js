const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const express = require('express');

puppeteer.use(StealthPlugin());

const app = express();
app.listen(process.env.PORT || 10000, '0.0.0.0');

const client = redis.createClient({ url: process.env.REDIS_URL });

async function procesar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📡 Worker Pro Iniciado. Esperando tareas...");

        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            if (!tareaRaw) continue;
            const { cedula } = JSON.parse(tareaRaw.element);
            
            console.log(`🔎 Procesando Cédula: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: "new", // Usamos el motor más moderno
                executablePath: '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--window-size=1920,1080',
                    '--proxy-server=http://p.webshare.io:80'
                ]
            });

            const page = await browser.newPage();
            
            // 1. Configuración de Pantalla y User-Agent Real
            await page.setViewport({ width: 1920, height: 1080 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

            // 2. Autenticación Proxy
            await page.authenticate({ username: 'lzwsgumc-200', password: 'satazom7w0zq' });

            try {
                // 3. Navegación con tiempo de gracia
                console.log("👮 Accediendo al portal...");
                await page.goto('https://antecedentes.policia.gov.co/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'load', 
                    timeout: 70000 
                });

                // 4. Pausa táctica: La Policía carga scripts de detección al inicio
                await new Promise(r => setTimeout(r, 6000));

                // 5. Intento de Clic Forzado via Coordenadas/JS
                const clickResultado = await page.evaluate(() => {
                    const el = document.querySelector('#aceptoTerminos');
                    const btn = document.querySelector('input[type="submit"]');
                    if (el && btn) {
                        el.click();
                        // Disparamos el evento de cambio manualmente por si acaso
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        setTimeout(() => btn.click(), 1000);
                        return "OK";
                    }
                    return document.title || "Página Vacía";
                });

                if (clickResultado === "OK") {
                    console.log("✅ Selector activado via JS nativo.");
                } else {
                    console.error(`❌ No se halló el botón. La página dice: "${clickResultado}"`);
                    // Tomamos una captura de texto para depurar
                    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 200));
                    console.log(`📄 Texto detectado: ${bodyText}`);
                }

                // 6. Esperar el siguiente paso
                await page.waitForSelector('#cedulaInput', { timeout: 25000 });
                console.log("🚀 ¡Logramos entrar al formulario!");

            } catch (err) {
                console.error(`❌ Error de navegación: ${err.message}`);
            }

            await browser.close();
            console.log("🏁 Sesión finalizada.");
        }
    } catch (err) {
        setTimeout(procesar, 5000);
    }
}

procesar();
