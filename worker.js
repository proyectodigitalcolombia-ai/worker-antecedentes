import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import redis from 'redis';

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.status(200).send('Worker Activo 🟢'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Worker en línea`));

puppeteer.use(StealthPlugin());
const client = redis.createClient({ url: process.env.REDIS_URL });

async function procesar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("✅ Conectado a Redis.");

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
            await page.setViewport({ width: 1280, height: 900 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

            try {
                console.log("👮 Navegando a puerto 7005...");
                await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'load', 
                    timeout: 60000 
                });

                // 1. Espera de estabilización
                await new Promise(r => setTimeout(r, 15000));

                console.log("🛠️ Inyectando aceptación mediante script de PrimeFaces...");
                await page.evaluate(() => {
                    // Marcamos el checkbox internamente
                    const chk = document.querySelector('.ui-chkbox-box');
                    if (chk) chk.click();
                    
                    // Buscamos el botón y forzamos su ejecución
                    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Enviar'));
                    if (btn) {
                        btn.removeAttribute('disabled');
                        // Disparamos el evento de PrimeFaces directamente
                        if (typeof PrimeFaces !== 'undefined') {
                            const formId = btn.closest('form').id;
                            PrimeFaces.ab({s: btn.id, f: formId, u: '@all'});
                        } else {
                            btn.click();
                        }
                    }
                });

                // Espera larga para la transición de red
                console.log("⏳ Esperando respuesta del servidor de la Policía...");
                await new Promise(r => setTimeout(r, 10000));
                
                // 2. Verificación agresiva
                const resultado = await page.evaluate(() => {
                    const found = !!document.querySelector('input[id*="cedula"]') || 
                                  !!document.querySelector('input[id*="documento"]') ||
                                  document.body.innerText.includes('Cédula');
                    return {
                        exito: found,
                        url: window.location.href,
                        preview: document.body.innerText.substring(0, 100).replace(/\n/g, ' ')
                    };
                });

                if (resultado.exito) {
                    console.log("🚀 ¡ÉXITO! Formulario de consulta alcanzado.");
                } else {
                    console.log(`⚠️ Fallo en transición. URL actual: ${resultado.url}`);
                    console.log(`📝 Contenido: "${resultado.preview}..."`);
                    console.log("⌨️ Reintento final: Enter");
                    await page.keyboard.press('Enter');
                    await new Promise(r => setTimeout(r, 5000));
                }

            } catch (err) {
                console.error(`❌ Error en flujo: ${err.message}`);
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
