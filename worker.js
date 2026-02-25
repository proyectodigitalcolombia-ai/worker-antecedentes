const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const express = require('express');

puppeteer.use(StealthPlugin());

// --- SERVIDOR DE SALUD PARA RENDER ---
const app = express();
app.get('/', (req, res) => res.status(200).send('Worker Antecedentes Vivo 🤖'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server de salud en puerto ${PORT}`));

// --- CONEXIÓN REDIS ---
const client = redis.createClient({ url: process.env.REDIS_URL });
client.on('error', (err) => console.log('❌ Error Redis:', err));

async function iniciarWorker() {
    try {
        await client.connect();
        console.log("✅ Worker conectado a Redis. Esperando tareas...");

        while (true) {
            // Espera una tarea de la lista 'cola_consultas'
            const tareaRaw = await client.brPop('cola_consultas', 0);
            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Procesando cédula: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: "new",
                executablePath: '/usr/bin/google-chrome', // Ruta fija en esta imagen Docker
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`
                ]
            });

            const page = await browser.newPage();
            
            // Autenticación del Proxy
            await page.authenticate({
                username: process.env.PROXY_USER,
                password: process.env.PROXY_PASS
            });

            // Prueba de navegación
            await page.goto('https://www.google.com', { waitUntil: 'networkidle2' });
            console.log(`🌍 Navegación exitosa para ${cedula}`);

            await browser.close();
        }
    } catch (error) {
        console.error("❌ Error crítico:", error);
        setTimeout(iniciarWorker, 5000);
    }
}

iniciarWorker();
