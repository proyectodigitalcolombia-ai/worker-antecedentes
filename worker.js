const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const express = require('express');
const axios = require('axios');

puppeteer.use(StealthPlugin());

// --- SERVIDOR PARA RENDER (Port Binding) ---
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.status(200).send('Worker Antecedentes Operativo 👮‍♂️'));
app.listen(PORT, () => console.log(`🚀 Servidor de salud en puerto ${PORT}`));

// --- CONFIGURACIÓN REDIS ---
const client = redis.createClient({ url: process.env.REDIS_URL });

async function resolverCaptcha(page) {
    try {
        console.log("🧩 Detectando Captcha...");
        const sitekey = await page.$eval('.g-recaptcha', el => el.getAttribute('data-sitekey'));
        
        console.log("📨 Enviando a 2Captcha...");
        const resp = await axios.get(`http://2captcha.com/in.php?key=${process.env.API_KEY_2CAPTCHA}&method=userrecaptcha&googlekey=${sitekey}&pageurl=${page.url()}&json=1`);
        
        if (resp.data.status !== 1) throw new Error("Error en 2Captcha");
        const requestId = resp.data.request;

        while (true) {
            await new Promise(r => setTimeout(r, 5000));
            const check = await axios.get(`http://2captcha.com/res.php?key=${process.env.API_KEY_2CAPTCHA}&action=get&id=${requestId}&json=1`);
            if (check.data.status === 1) return check.data.request;
            console.log("⏳ Esperando solución...");
        }
    } catch (e) {
        console.error("❌ Falló el captcha:", e.message);
        return null;
    }
}

async function procesar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📡 Conectado a Redis. Esperando tareas...");

        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Iniciando trámite para cédula: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: "new",
                executablePath: '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-http2', // CRÍTICO: Evita el ERR_TUNNEL en sitios gubernamentales
                    '--ignore-certificate-errors',
                    `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`
                ]
            });

            const page = await browser.newPage();
            
            // Autenticación con el usuario rotativo que configuraste
            await page.authenticate({
                username: process.env.PROXY_USER,
                password: process.env.PROXY_PASS
            });

            try {
                // 1. Verificación de IP (Para confirmar que el proxy funciona)
                console.log("🌐 Abriendo túnel de red...");
                await page.goto('https://api.ipify.org', { waitUntil: 'networkidle2', timeout: 20000 });
                const ip = await page.$eval('body', el => el.innerText);
                console.log(`✅ Túnel OK! IP Proxy: ${ip}`);

                // 2. Navegación a la Policía
                console.log("👮 Navegando a Policía Nacional...");
                // User Agent de Chrome real para evitar bloqueos
                await
