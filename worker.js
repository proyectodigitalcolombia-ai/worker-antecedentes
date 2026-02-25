const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const Tesseract = require('tesseract.js'); // Para resolver el captcha

// --- 1. SERVIDOR DE SALUD (Health Check) ---
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.status(200).send('Worker Pro Operativo 🟢'));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Health Check en puerto ${PORT}`));

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
            console.log(`🔎 Iniciando proceso para: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: false, // Requerido para Xvfb
                executablePath: '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--proxy-server=http://p.webshare.io:80',
                    '--ignore-certificate-errors',
                    '--ignore-ssl-errors',
                    '--window-size=1920,1080'
                ],
                env: {
                    DISPLAY: ':99' // Vincula Puppeteer con la pantalla virtual de Render
                }
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });
            await page.authenticate({ username: 'lzwsgumc-200', password: 'satazom7w0zq' });

            try {
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

                console.log("👮 Navegando a la Policía...");
                await page.goto('https://antecedentes.policia.gov.co/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'load', 
                    timeout: 60000 
                });

                await new Promise(r => setTimeout(r, 8000));

                // --- PASO 1: ACEPTAR TÉRMINOS ---
                console.log("⚖️ Aceptando términos...");
                const clickTerms = await page.evaluate(() => {
                    const chk = document.querySelector('#aceptoTerminos');
                    const btn = document.querySelector('input[type="submit"]');
                    if (chk && btn) {
                        chk.click();
                        setTimeout(() => btn.click(), 1000);
                        return true;
                    }
                    return false;
                });

                if (clickTerms) {
                    // --- PASO 2: RESOLVER CAPTCHA ---
                    console.log("🧩 Esperando formulario de consulta...");
                    await page.waitForSelector('#cedulaInput', { timeout: 20000 });
                    
                    // Capturamos el elemento del captcha (ajustar selector según el portal)
                    const captchaElement = await page.$('img[id*="captcha"]'); 
                    if (captchaElement) {
                        await captchaElement.screenshot({ path: 'captcha.png' });
                        console.log("📸 Captcha guardado. Procesando OCR...");
                        
                        const { data: { text } } = await Tesseract.recognize('captcha.png', 'eng');
                        const codigoLimpio = text.trim().toUpperCase();
                        console.log(`📝 Texto detectado: ${codigoLimpio}`);

                        // Llenar campos
                        await page.type('#cedulaInput', cedula);
                        await page.type('input[id*="captchaInput"]', codigoLimpio); // Ajustar selector
                        
                        console.log("🚀 Enviando consulta...");
                        // await page.click('#btnConsultar'); // Descomentar cuando tengas el ID real
                    }
                } else {
                    console.error("❌ No se encontró el botón de términos.");
                }

            } catch (err) {
                console.error(`❌ Error en flujo: ${err.message}`);
            }

            await browser.close();
            console.log("🏁 Ciclo completado.");
        }
    } catch (err) {
        console.error("❌ Error Crítico:", err);
        setTimeout(procesar, 5000);
    }
}

procesar();
