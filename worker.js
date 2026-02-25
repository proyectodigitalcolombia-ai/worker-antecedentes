const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const express = require('express');

puppeteer.use(StealthPlugin());

// --- SERVIDOR DE SALUD ---
const app = express();
app.get('/', (req, res) => res.status(200).send('Worker Operando con Puppeteer 🕵️‍♂️'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0');

// --- CONFIGURACIÓN REDIS ---
const client = redis.createClient({ url: process.env.REDIS_URL });

async function procesarConsultas() {
    try {
        await client.connect();
        console.log("🚀 Worker escuchando la cola de la Policía...");

        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Consultando antecedentes para: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: "new",
                executablePath: '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`
                ]
            });

            const page = await browser.newPage();
            
            // 1. Autenticar Proxy
            await page.authenticate({
                username: process.env.PROXY_USER,
                password: process.env.PROXY_PASS
            });

            try {
                // 2. Ir a la página de la Policía
                await page.goto('https://srvandroid.policia.gov.co/Antecedentes/', { waitUntil: 'networkidle2' });
                
                // 3. Lógica para aceptar términos y meter la cédula
                // (Aquí es donde usaremos tu llave de 2Captcha si hay captcha)
                console.log(`✅ Página cargada para ${cedula}. Procesando formulario...`);
                
                // Aquí podrías añadir un pantallazo para debug:
                // await page.screenshot({ path: 'resultado.png' });

            } catch (navError) {
                console.error(`❌ Error en navegación: ${navError.message}`);
            }

            await browser.close();
            console.log(`🏁 Finalizado proceso de ${cedula}`);
        }
    } catch (error) {
        console.error("❌ Error en el bucle del Worker:", error);
        setTimeout(procesarConsultas, 5000);
    }
}

procesarConsultas();
