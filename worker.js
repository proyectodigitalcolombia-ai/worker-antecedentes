const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const express = require('express');

puppeteer.use(StealthPlugin());

// --- 1. SERVIDOR DE SALUD (Para que Render no marque "Failed") ---
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => res.status(200).send('Worker Activo 🤖'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Health check escuchando en puerto ${PORT}`);
});

// --- 2. CONEXIÓN A REDIS ---
const client = redis.createClient({ url: process.env.REDIS_URL });

client.on('error', (err) => console.log('❌ Error en Redis:', err));

async function procesarConsultas() {
    try {
        await client.connect();
        console.log("✅ Conectado a Redis. Esperando tareas en 'cola_consultas'...");

        while (true) {
            // BRPOP espera hasta que llegue una tarea
            const tareaRaw = await client.brPop('cola_consultas', 0);
            const { cedula } = JSON.parse(tareaRaw.element);
            
            console.log(`🔎 Iniciando consulta para: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: "new",
                executablePath: '/usr/bin/google-chrome', // Ruta de la imagen Docker
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`
                ]
            });

            const page = await browser.newPage();

            // Autenticación del Proxy residencial
            await page.authenticate({
                username: process.env.PROXY_USER,
                password: process.env.PROXY_PASS
            });

            try {
                // AQUÍ VA LA LÓGICA DE NAVEGACIÓN (Prueba con Google primero)
                await page.goto('https://www.google.com', { waitUntil: 'networkidle2' });
                console.log(`✅ Navegación exitosa para la cédula ${cedula}`);
            } catch (navError) {
                console.error(`❌ Error navegando para ${cedula}:`, navError.message);
            }

            await browser.close();
            console.log(`🏁 Tarea finalizada.`);
        }
    } catch (error) {
        console.error("❌ Error crítico en el Worker:", error);
        // Reintento automático en 5 segundos
        setTimeout(procesarConsultas, 5000);
    }
}

procesarConsultas();
