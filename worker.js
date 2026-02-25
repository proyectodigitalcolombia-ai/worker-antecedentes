const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const express = require('express');

puppeteer.use(StealthPlugin());
const app = express();

// Servidor mínimo para que Render sepa que el Worker está funcionando
app.get('/health', (req, res) => res.send('Worker Activo ✅'));
app.listen(10000, '0.0.0.0');

const client = redis.createClient({ url: process.env.REDIS_URL });

async function startWorker() {
    try {
        await client.connect();
        console.log("🤖 Conectado a Redis. Esperando tareas...");

        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            const { cedula } = JSON.parse(tarea.element);
            console.log(`🔎 Procesando: ${cedula}`);
            
            const browser = await puppeteer.launch({
                headless: "new",
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();
            
            // Aquí irá la lógica de entrar a la policía
            await page.goto('https://srvandroid.policia.gov.co/...', { waitUntil: 'networkidle2' });
            console.log(`✅ Tarea terminada para ${cedula}`);
            
            await browser.close();
        }
    } catch (err) {
        console.error("Error en Worker:", err);
        setTimeout(startWorker, 5000);
    }
}

startWorker();
