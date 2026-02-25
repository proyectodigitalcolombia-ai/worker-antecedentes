const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const express = require('express');
const axios = require('axios');

puppeteer.use(StealthPlugin());

// --- ⚡ MEJORA: SERVIDOR DE SALUD INMEDIATO ---
const app = express();
const PORT = process.env.PORT || 10000;

// Esto responde a Render en milisegundos para que te ponga en VERDE rápido
app.get('/', (req, res) => res.status(200).send('Worker Activo 🟢'));
app.get('/healthz', (req, res) => res.sendStatus(200));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor web listo en puerto ${PORT}. Render debería marcarme como LIVE ahora.`);
});

// --- LÓGICA DE CONSULTA ---
const client = redis.createClient({ url: process.env.REDIS_URL });

async function procesar() {
    try {
        console.log("📡 Conectando a Redis...");
        await client.connect();
        
        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            const { cedula } = JSON.parse(tareaRaw.element);
            
            console.log(`🔎 Iniciando: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: "new",
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-http2', // Evita el error de túnel
                    `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`
                ]
            });

            const page = await browser.newPage();
            await page.authenticate({
                username: process.env.PROXY_USER,
                password: process.env.PROXY_PASS
            });

            try {
                // Test rápido de IP
                await page.goto('https://api.ipify.org', { waitUntil: 'networkidle2', timeout: 15000 });
                const ip = await page.$eval('body', el => el.innerText);
                console.log(`🌐 Túnel OK! IP: ${ip}`);

                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
                
                // Navegación a la Policía
                await page.goto('https://srvandroid.policia.gov.co/Antecedentes/', { 
                    waitUntil: 'domcontentloaded', 
                    timeout: 60000 
                });

                console.log("👮 Página de Policía alcanzada con éxito.");
                // ... (Aquí sigue tu lógica de llenar cédula y captcha)

            } catch (err) {
                console.error(`❌ Error de red: ${err.message}`);
            }

            await browser.close();
        }
    } catch (err) {
        console.error("❌ Error:", err);
        setTimeout(procesar, 5000);
    }
}

// Arranca el proceso de fondo
procesar();
