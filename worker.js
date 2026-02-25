import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import redis from 'redis';

// --- 1. SERVIDOR DE SALUD ---
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.status(200).send('Worker Activo 🟢'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Servidor de salud en puerto ${PORT}`));

// --- 2. CONFIGURACIÓN ---
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
                await new Promise(r => setTimeout(r, 12000));

                // Verificación de contenido para logs
                const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 150));
                console.log(`📄 Texto detectado: "${bodyText.replace(/\n/g, ' ')}..."`);

                const resultado = await page.evaluate(() => {
                    // El checkbox de la policía suele ser un DIV con esta clase (PrimeFaces)
                    const checkPF = document.querySelector('.ui-chkbox-box');
                    const checkStd = document.querySelector('input[type="checkbox"]');
                    const targetCheck = checkPF || checkStd;

                    // El botón suele ser un botón con clase ui-button o un input submit
                    const btnPF = document.querySelector('.ui-button');
                    const btnStd = document.querySelector('input[type="submit"], button[type="submit"]');
                    const targetBtn = btnPF || btnStd;

                    if (targetCheck && targetBtn) {
                        targetCheck.click();
                        return { found: true, method: checkPF ? 'PrimeFaces' : 'Standard' };
                    }
                    return { found: false, hasCheck: !!targetCheck, hasBtn: !!targetBtn };
                });

                if (resultado.found) {
                    console.log(`⚖️ Términos localizados (${resultado.method}). Aceptando...`);
                    await new Promise(r => setTimeout(r, 1500));
                    
                    // Presionamos Enter como respaldo al click
                    await page.keyboard.press('Enter'); 
                    
                    console.log("⏳ Esperando formulario de datos...");
                    // Esperamos a que aparezca cualquier input (el de la cédula)
                    await page.waitForSelector('input', { timeout: 20000 });
                    console.log("📝 ¡Formulario de consulta ALCANZADO!");
                    
                    // Aquí podrías tomar una captura del captcha
                } else {
                    console.log("⚠️ No se encontró el botón o check. Estado:", resultado);
                }

            } catch (err) {
                console.error(`❌ Error en el flujo: ${err.message}`);
            }

            await browser.close();
            console.log("🏁 Sesión finalizada. Esperando nueva tarea...");
        }
    } catch (err) {
        console.error("❌ Error Crítico:", err);
        setTimeout(procesar, 5000);
    }
}

procesar();
