const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');

// --- 1. HEALTH CHECK PARA RENDER ---
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.status(200).send('Worker Puerto 7005 Activo 🟢'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Servidor de salud en puerto ${PORT}`));

// --- 2. CONFIGURACIÓN ---
puppeteer.use(StealthPlugin());
const client = redis.createClient({ url: process.env.REDIS_URL });

async function procesar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("✅ Conectado a Redis. Esperando tareas...");

        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            if (!tareaRaw) continue;

            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Iniciando consulta para la cédula: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: false,
                executablePath: '/usr/bin/google-chrome-stable',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    // Si el error SSL persiste, el proxy de Webshare podría estar bloqueando el puerto 7005
                    '--proxy-server=http://p.webshare.io:80', 
                    '--ignore-certificate-errors',
                    '--ignore-ssl-errors',
                    '--ssl-version-min=tls1.2',
                    '--allow-running-insecure-content',
                    '--disable-web-security',
                    '--window-size=1920,1080'
                ],
                env: { DISPLAY: ':99' }
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });
            
            // Autenticación Proxy
            await page.authenticate({ username: 'lzwsgumc-200', password: 'satazom7w0zq' });

            try {
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

                console.log("👮 Navegando a: https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml");
                
                // Usamos un timeout más largo y esperamos a que la red esté ociosa
                await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle2', 
                    timeout: 90000 
                });

                await new Promise(r => setTimeout(r, 10000));

                // Lógica de interacción
                const exito = await page.evaluate(() => {
                    const check = document.querySelector('#aceptoTerminos') || document.querySelector('input[type="checkbox"]');
                    const btn = document.querySelector('input[type="submit"]');
                    if (check && btn) {
                        check.click();
                        setTimeout(() => btn.click(), 1000);
                        return true;
                    }
                    return false;
                });

                if (exito) {
                    console.log("✅ Formulario de términos superado.");
                    await page.waitForSelector('#cedulaInput', { timeout: 20000 });
                    console.log("📝 ¡Formulario de datos visible!");
                }

            } catch (err) {
                console.error(`❌ Error en navegación: ${err.message}`);
                // Captura de pantalla del error para debugging en Render
                await page.screenshot({ path: 'debug_error.png' });
            }

            await browser.close();
            console.log("🏁 Sesión cerrada.");
        }
    } catch (err) {
        console.error("❌ Error Crítico en el Worker:", err);
        setTimeout(procesar, 5000);
    }
}

procesar();
