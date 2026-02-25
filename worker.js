import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import redis from 'redis';

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
                headless: "new",
                executablePath: '/usr/bin/google-chrome-stable',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors'],
                env: { DISPLAY: ':99' }
            });

            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

            try {
                console.log("👮 Navegando a puerto 7005...");
                await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle2', 
                    timeout: 60000 
                });

                // Espera para carga de PrimeFaces
                await new Promise(r => setTimeout(r, 12000));

                const resultado = await page.evaluate(() => {
                    // 1. Buscamos el checkbox (usando selectores más amplios por si es PrimeFaces)
                    const check = document.querySelector('.ui-chkbox-box') || 
                                  document.querySelector('div[id*="acepto"]') ||
                                  document.querySelector('input[type="checkbox"]');
                    
                    // 2. Buscamos el botón "Enviar" (que es el que vimos en el log)
                    const botones = Array.from(document.querySelectorAll('button, input[type="submit"], .ui-button'));
                    const btn = botones.find(b => {
                        const t = b.innerText || b.value || "";
                        return t.toLowerCase().includes('enviar') || t.toLowerCase().includes('aceptar');
                    });

                    if (check && btn) {
                        check.click();
                        return { found: true, btnText: btn.innerText.trim() };
                    }
                    return { found: false, btns: botones.map(b => b.innerText.trim()) };
                });

                if (resultado.found) {
                    console.log(`⚖️ Checkbox marcado. Clickeando botón: [${resultado.btnText}]`);
                    await new Promise(r => setTimeout(r, 1000));
                    
                    // Intentamos click y luego Enter como refuerzo
                    await page.keyboard.press('Enter'); 
                    
                    console.log("⏳ Esperando formulario de cédula...");
                    await page.waitForSelector('input', { timeout: 15000 });
                    console.log("🚀 ¡EXITO! Formulario de consulta ALCANZADO.");
                } else {
                    console.log("⚠️ No se logró la combinación. Botones vistos:", resultado.btns);
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
