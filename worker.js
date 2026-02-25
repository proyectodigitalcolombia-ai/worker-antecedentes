const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const express = require('express');

puppeteer.use(StealthPlugin());

// Servidor para que Render sepa que el Worker está vivo
const app = express();
app.get('/health', (req, res) => res.send('Worker Operativo 🤖'));
app.listen(process.env.PORT || 1000, '0.0.0.0');

const client = redis.createClient({ url: process.env.REDIS_URL });

async function procesarConsulta() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("🤖 Worker conectado a Redis. Esperando tareas...");

        while (true) {
            // Sacamos una tarea de la cola (espera infinita hasta que llegue algo)
            const tareaRaw = await client.brPop('cola_consultas', 0);
            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Iniciando búsqueda para cédula: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: "new",
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`,
                    '--disable-blink-features=AutomationControlled'
                ]
            });

            const page = await browser.newPage();

            // Autenticación de Webshare
            await page.authenticate({
                username: process.env.PROXY_USER,
                password: process.env.PROXY_PASS
            });

            // --- AQUÍ IRÁ EL CÓDIGO DE NAVEGACIÓN DE LA POLICÍA ---
            console.log(`✅ Navegando a la web de la policía para: ${cedula}`);
            await page.goto('https://srvCalculo.policia.gov.co/antecedentes', { waitUntil: 'networkidle2' });
            
            // Simulación de espera por ahora
            await new Promise(r => setTimeout(r, 5000));

            await browser.close();
            console.log(`🏁 Proceso terminado para ${cedula}`);
        }
    } catch (err) {
        console.error("❌ Error en el Worker:", err);
        setTimeout(procesarConsulta, 5000); // Reintentar si falla
    }
}

procesarConsulta();
