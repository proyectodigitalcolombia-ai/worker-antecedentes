import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import redis from 'redis';

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.status(200).send('Worker Activo 🟢'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Servidor de salud activo`));

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
                headless: "new",
                executablePath: '/usr/bin/google-chrome-stable',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors'],
                env: { DISPLAY: ':99' }
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 800 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

            try {
                console.log("👮 Navegando a puerto 7005...");
                await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle2', 
                    timeout: 60000 
                });

                await new Promise(r => setTimeout(r, 12000));

                console.log("🛠️ Inyectando estado de aceptación...");
                await page.evaluate(() => {
                    // 1. Forzamos el checkbox a nivel visual y de datos
                    const chkBox = document.querySelector('.ui-chkbox-box');
                    if (chkBox) {
                        chkBox.classList.add('ui-state-active');
                        const icon = chkBox.querySelector('.ui-chkbox-icon');
                        if (icon) icon.classList.replace('ui-icon-blank', 'ui-icon-check');
                    }
                    
                    // 2. Buscamos el input oculto que realmente manda el dato al servidor
                    const hiddenInput = document.querySelector('input[type="checkbox"][id*="acepto"]');
                    if (hiddenInput) {
                        hiddenInput.checked = true;
                        hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });

                // Click físico por si acaso (usando tus coordenadas exitosas)
                await page.mouse.click(508, 547);
                await new Promise(r => setTimeout(r, 3000));

                console.log("🚀 Disparando botón Enviar...");
                await page.evaluate(() => {
                    const btn = Array.from(document.querySelectorAll('button, .ui-button'))
                                     .find(b => b.innerText.includes('Enviar'));
                    if (btn) {
                        btn.removeAttribute('disabled');
                        btn.click();
                    }
                });

                await new Promise(r => setTimeout(r, 8000));
                
                const final = await page.evaluate(() => {
                    const inp = document.querySelector('input[id*="cedula"]') || document.querySelector('input[type="text"]');
                    return {
                        exito: !!inp,
                        html: document.body.innerText.substring(0, 50)
                    };
                });

                if (final.exito) {
                    console.log("📝 ¡FORMULARIO DE CÉDULA ALCANZADO!");
                } else {
                    console.log("⚠️ Intento final con Enter...");
                    await page.keyboard.press('Enter');
                    await new Promise(r => setTimeout(r, 5000));
                }

            } catch (err) {
                console.error(`❌ Error: ${err.message}`);
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
