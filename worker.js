import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import redis from 'redis';

// --- SERVIDOR PARA RENDER ---
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.status(200).send('Worker Activo 🟢'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Health Check en puerto ${PORT}`));

// --- CONFIGURACIÓN ---
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
            console.log(`🔎 Iniciando consulta para: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: "new",
                executablePath: '/usr/bin/google-chrome-stable',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--lang=es-419,es;q=0.9', // Idioma Latino
                    // '--proxy-server=IP:PUERTO' // <--- Descomenta esto si usas Proxy
                ]
            });

            const page = await browser.newPage();
            
            // Configuración de Identidad
            await page.setViewport({ width: 1366, height: 768 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
            await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-419,es;q=0.9' });

            // Evitar detección de bot
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
            });

            try {
                console.log("👮 Navegando a la URL directa...");
                await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle2', 
                    timeout: 60000 
                });

                // Espera inicial para que el servidor JSF/PrimeFaces se estabilice
                await new Promise(r => setTimeout(r, 12000));

                console.log("🎯 Interactuando con el Checkbox...");
                // Usamos las coordenadas que confirmamos en los logs anteriores
                await page.mouse.move(508, 547);
                await new Promise(r => setTimeout(r, 500));
                await page.mouse.click(508, 547);

                // Espera AJAX: Vital para que el servidor valide el "Acepto"
                console.log("⏳ Sincronizando términos (AJAX)...");
                await new Promise(r => setTimeout(r, 5000));

                console.log("🚀 Enviando formulario...");
                await page.keyboard.press('Enter'); 

                // Espera de transición
                await new Promise(r => setTimeout(r, 8000));

                const validacion = await page.evaluate(() => {
                    const inp = document.querySelector('input[id*="cedula"]') || 
                                document.querySelector('input[type="text"]');
                    return {
                        exito: !!inp,
                        url: window.location.href,
                        contenido: document.body.innerText.substring(0, 80).replace(/\n/g, ' ')
                    };
                });

                if (validacion.exito) {
                    console.log("📝 ¡EXITO! Formulario de consulta alcanzado.");
                    // Aquí podrías continuar para escribir la cédula y resolver captcha
                } else {
                    console.log(`⚠️ Seguimos fuera. URL: ${validacion.url}`);
                    console.log(`📝 Texto actual: "${validacion.contenido}..."`);
                    
                    // Si fuimos redirigidos a index.xhtml, es bloqueo de IP
                    if (validacion.url.includes('index.xhtml')) {
                        console.log("🚫 BLOQUEO DETECTADO: El servidor nos expulsó al inicio.");
                    }
                }

            } catch (err) {
                console.error(`❌ Error en el proceso: ${err.message}`);
            }

            await browser.close();
            console.log("🏁 Sesión finalizada.");
        }
    } catch (err) {
        console.error("❌ Error Crítico de Redis/Browser:", err);
        setTimeout(procesar, 5000);
    }
}

procesar();
