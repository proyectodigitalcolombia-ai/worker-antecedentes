const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const axios = require('axios');

// --- 1. CONFIGURACIÓN DEL SERVIDOR DE SALUD (Health Check) ---
// Esto DEBE ir al principio para que Render no aborte el deploy
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.status(200).send('Worker Antedecentes Operativo 🟢');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor de salud activo en puerto ${PORT}`);
});

// --- 2. CONFIGURACIÓN DE PUPPETEER Y REDIS ---
puppeteer.use(StealthPlugin());
const client = redis.createClient({ url: process.env.REDIS_URL });

async function procesar() {
    try {
        console.log("📡 Intentando conectar a Redis...");
        if (!client.isOpen) await client.connect();
        console.log("✅ Conectado a Redis. Esperando tareas...");

        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            if (!tareaRaw) continue;

            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Consultando cédula: ${cedula}`);

            const browser = await puppeteer.launch({
                // Usamos headless: false para que Xvfb simule una pantalla real
                headless: false, 
                executablePath: '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--start-maximized',
                    '--proxy-server=http://p.webshare.io:80'
                ]
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });

            // Autenticación del Proxy ETB Colombia
            await page.authenticate({
                username: 'lzwsgumc-200',
                password: 'satazom7w0zq'
            });

            try {
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

                console.log("👮 Cargando portal de la Policía...");
                await page.goto('https://antecedentes.policia.gov.co/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'load', 
                    timeout: 60000 
                });

                // Pausa necesaria para que los scripts de la Policía se estabilicen
                await new Promise(r => setTimeout(r, 8000));

                console.log("⚖️ Ejecutando aceptación de términos...");
                
                // Intentamos clic forzado mediante inyección de JS
                const exitoTerminos = await page.evaluate(() => {
                    const check = document.querySelector('#aceptoTerminos');
                    const btn = document.querySelector('input[type="submit"]');
                    if (check && btn) {
                        check.click();
                        // Disparamos evento para asegurar que el sistema detecte el cambio
                        check.dispatchEvent(new Event('change', { bubbles: true }));
                        setTimeout(() => btn.click(), 1000);
                        return true;
                    }
                    return false;
                });

                if (exitoTerminos) {
                    console.log("✅ Términos aceptados.");
                    await page.waitForSelector('#cedulaInput', { timeout: 20000 });
                    console.log("🚀 ¡Formulario cargado con éxito!");
                    
                    // Aquí iría tu código de resolver Captcha y enviar Cédula
                } else {
                    const titulo = await page.title();
                    console.error(`❌ No se encontró el botón. Título de página: ${titulo}`);
                }

            } catch (err) {
                console.error(`❌ Error en navegación: ${err.message}`);
            }

            await browser.close();
            console.log("🏁 Sesión finalizada. Esperando nueva tarea...");
        }
    } catch (err) {
        console.error("❌ Error Crítico:", err);
        setTimeout(procesar, 5000);
    }
}

// Iniciar el worker
procesar();
