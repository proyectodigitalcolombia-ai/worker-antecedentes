import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import redis from 'redis';

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.status(200).send('Worker Activo 🟢'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Servidor de salud en puerto ${PORT}`));

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
                    '--ignore-ssl-errors'
                ],
                env: { DISPLAY: ':99' }
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 800 });
            
            try {
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

                console.log("👮 Navegando a puerto 7005...");
                await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle2', 
                    timeout: 60000 
                });

                await new Promise(r => setTimeout(r, 12000));

                const resultado = await page.evaluate(() => {
                    // Buscamos el checkbox por ID parcial o clase de PrimeFaces
                    const check = document.querySelector('[id*="acepto"]') || 
                                  document.querySelector('.ui-chkbox-box') ||
                                  document.querySelector('input[type="checkbox"]');
                    
                    // Buscamos el botón que diga "Aceptar" o "Enviar"
                    const botones = Array.from(document.querySelectorAll('button, input[type="submit"]'));
                    const btn = botones.find(b => 
                        b.innerText.includes('Aceptar') || 
                        b.value?.includes('Aceptar') || 
                        b.id?.includes('continuar')
                    );

                    if (check && btn) {
                        check.scrollIntoView();
                        check.click(); // Click vía JS
                        return { found: true, btnId: btn.id, checkId: check.id };
                    }
                    return { found: false, totalButtons: botones.length };
                });

                if (resultado.found) {
                    console.log("⚖️ Elementos encontrados. Intentando click físico...");
                    await new Promise(r => setTimeout(r, 1000));
                    
                    // Como respaldo, presionamos la tecla Tab y Espacio para marcar el check si el click falló
                    await page.keyboard.press('Tab');
                    await page.keyboard.press('Space');
                    await new Promise(r => setTimeout(r, 500));
                    await page.keyboard.press('Enter'); 

                    console.log("⏳ Esperando transición al formulario...");
                    // Esperamos que aparezca el campo de texto de la cédula
                    await page.waitForSelector('input[type="text"]', { timeout: 15000 });
                    console.log("📝 ¡Formulario de consulta ALCANZADO!");
                } else {
                    console.log("⚠️ No se hallaron los botones. Revisando estructura...");
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
