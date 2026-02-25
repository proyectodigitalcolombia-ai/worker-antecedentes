import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import redis from 'redis';

// --- CONFIGURACIÓN ---
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.status(200).send('Worker Activo 🟢'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Health Check en puerto ${PORT}`));

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
                headless: false,
                executablePath: '/usr/bin/google-chrome-stable',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--ignore-certificate-errors',
                    '--ignore-ssl-errors',
                    '--disable-web-security'
                ],
                env: { DISPLAY: ':99' }
            });

            const page = await browser.newPage();
            
            try {
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

                console.log("👮 Navegando a puerto 7005...");
                await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle2', 
                    timeout: 60000 
                });

                console.log("✅ Página cargada. Esperando renderizado...");
                await new Promise(r => setTimeout(r, 10000));

                const resultado = await page.evaluate(() => {
                    const check = document.querySelector('input[type="checkbox"]');
                    const btn = document.querySelector('input[type="submit"]');
                    if (check && btn) {
                        check.click();
                        return { exito: true };
                    }
                    return { exito: false, check: !!check, btn: !!btn };
                });

                if (resultado.exito) {
                    console.log("⚖️ Marcando términos...");
                    // Hacemos el click del botón fuera del evaluate para mayor control
                    await page.click('input[type="submit"]');
                    
                    await page.waitForSelector('#cedulaInput', { timeout: 15000 });
                    console.log("📝 ¡Formulario alcanzado!");
                } else {
                    console.log("⚠️ Elementos no encontrados:", resultado);
                }

            } catch (err) {
                console.error(`❌ Error en el flujo: ${err.message}`);
            }

            await browser.close();
            console.log("🏁 Sesión finalizada.");
        }
    } catch (err) {
        console.error("❌ Error Crítico:", err);
        setTimeout(procesar, 5000);
    }
}

procesar();
