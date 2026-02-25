const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.status(200).send('Worker Directo Activo 🟢'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Servidor de salud en puerto ${PORT}`));

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
            console.log(`🔎 Iniciando consulta directa para: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: false,
                executablePath: '/usr/bin/google-chrome-stable',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    // PROXY ELIMINADO: Conectamos directo para habilitar el puerto 7005
                    '--ignore-certificate-errors',
                    '--ignore-ssl-errors',
                    '--disable-web-security',
                    '--window-size=1920,1080'
                ],
                env: { DISPLAY: ':99' }
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });

            try {
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

                console.log("👮 Navegando directo a puerto 7005...");
                
                // Navegación con tiempo de espera extendido
                const response = await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle2', 
                    timeout: 60000 
                });

                if (response && response.status() === 200) {
                    console.log("✅ Página cargada. Esperando renderizado...");
                    await new Promise(r => setTimeout(r, 10000));

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
                        console.log("⚖️ Términos aceptados.");
                        await page.waitForSelector('#cedulaInput', { timeout: 15000 });
                        console.log("📝 Formulario visible.");
                    }
                } else {
                    console.log(`⚠️ La página respondió con status: ${response ? response.status() : 'null'}`);
                }

            } catch (err) {
                console.error(`❌ Error en navegación: ${err.message}`);
            }

            // Cerramos el navegador solo después de terminar o fallar
            await browser.close();
            console.log("🏁 Sesión finalizada.");
        }
    } catch (err) {
        console.error("❌ Error Crítico:", err);
        setTimeout(procesar, 5000);
    }
}

procesar();
