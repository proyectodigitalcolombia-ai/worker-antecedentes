const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');

// --- 1. CONFIGURACIÓN DEL SERVIDOR DE SALUD (Health Check) ---
// Se coloca al inicio para que Render detecte el servicio "Verde" de inmediato
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.status(200).send('Worker Antedecentes Operativo 🟢');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor de salud escuchando en el puerto ${PORT}`);
});

// --- 2. CONFIGURACIÓN DE PLUGINS Y REDIS ---
puppeteer.use(StealthPlugin());
const client = redis.createClient({ url: process.env.REDIS_URL });

async function procesar() {
    try {
        console.log("📡 Conectando a Redis...");
        if (!client.isOpen) await client.connect();
        console.log("✅ Conectado. Esperando tareas en la cola...");

        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            if (!tareaRaw) continue;

            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Iniciando consulta para la cédula: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: false, // Requerido para Xvfb (simula pantalla real)
                executablePath: '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--start-maximized',
                    '--proxy-server=http://p.webshare.io:80',
                    // Solución al ERR_SSL_PROTOCOL_ERROR
                    '--ignore-certificate-errors',
                    '--ignore-ssl-errors',
                    '--disable-web-security'
                ]
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });

            // Autenticación del Proxy (IP Colombia)
            await page.authenticate({
                username: 'lzwsgumc-200',
                password: 'satazom7w0zq'
            });

            try {
                // User-Agent real de Windows para evitar bloqueos
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

                console.log("👮 Navegando al portal de la Policía...");
                
                // Usamos una navegación más flexible para evitar errores de red
                await page.goto('https://antecedentes.policia.gov.co/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'load', 
                    timeout: 60000 
                });

                // Pausa táctica de 8 segundos para que el portal cargue sus scripts de seguridad
                console.log("⏳ Esperando renderizado de la página...");
                await new Promise(r => setTimeout(r, 8000));

                console.log("⚖️ Intentando aceptar términos y condiciones...");
                
                // Inyección de JavaScript para forzar el clic y el evento de activación
                const operacionExitosa = await page.evaluate(() => {
                    const check = document.querySelector('#aceptoTerminos');
                    const btn = document.querySelector('input[type="submit"]');
                    
                    if (check && btn) {
                        check.click();
                        // Disparamos evento nativo por si la página tiene validadores de estado
                        check.dispatchEvent(new Event('change', { bubbles: true }));
                        
                        // Pequeño delay antes de dar clic al botón de enviar
                        setTimeout(() => btn.click(), 1500);
                        return true;
                    }
                    return false;
                });

                if (operacionExitosa) {
                    console.log("✅ Términos aceptados. Esperando carga del formulario...");
                    
                    // Esperamos a que aparezca el input de la cédula
                    await page.waitForSelector('#cedulaInput', { timeout: 20000 });
                    console.log("📝 ¡Formulario listo para ingresar datos!");
                    
                    // --- AQUÍ CONTINÚA TU LÓGICA DE CAPTCHA Y ENVÍO ---
                    
                } else {
                    const title = await page.title();
                    console.error(`❌ El botón no fue encontrado. Título de la página actual: "${title}"`);
                }

            } catch (err) {
                console.error(`❌ Error durante la navegación: ${err.message}`);
                // Captura del título para diagnóstico en caso de error SSL persistente
                const errorTitle = await page.title();
                console.log(`📍 Título en el momento del fallo: ${errorTitle}`);
            }

            console.log("🏁 Cerrando navegador...");
            await browser.close();
        }
    } catch (error) {
        console.error("❌ Error Crítico en el Worker:", error);
        // Si Redis se desconecta, reintentamos en 5 segundos
        setTimeout(procesar, 5000);
    }
}

// Iniciar el flujo
procesar();
