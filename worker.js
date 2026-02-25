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
                headless: false,
                executablePath: '/usr/bin/google-chrome-stable',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors'],
                env: { DISPLAY: ':99' }
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1366, height: 768 });
            
            try {
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

                console.log("👮 Navegando a puerto 7005...");
                await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle2', 
                    timeout: 60000 
                });

                // ESPERA CRÍTICA: Esperamos a que aparezca cualquier botón en la página
                console.log("⏳ Esperando a que el formulario se renderice...");
                try {
                    await page.waitForSelector('button, .ui-button, input[type="submit"]', { timeout: 20000 });
                } catch (e) {
                    console.log("⚠️ Timeout esperando selectores, intentando búsqueda manual...");
                }

                await new Promise(r => setTimeout(r, 5000)); // Respiro extra para scripts

                const resultado = await page.evaluate(() => {
                    // Buscamos el checkbox por múltiples vías
                    const check = document.querySelector('.ui-chkbox-box') || 
                                  document.querySelector('div[id*="acepto"]') || 
                                  document.querySelector('input[type="checkbox"]');
                    
                    // Buscamos el botón "Aceptar" por texto (insensible a mayúsculas)
                    const botones = Array.from(document.querySelectorAll('button, input[type="submit"], .ui-button'));
                    const btn = botones.find(b => {
                        const txt = (b.textContent || b.value || "").toLowerCase();
                        return txt.includes('aceptar');
                    });

                    if (check && btn) {
                        check.scrollIntoView();
                        check.click();
                        return { found: true, btnId: btn.id };
                    }
                    
                    return { 
                        found: false, 
                        totalDivs: document.querySelectorAll('div').length,
                        totalButtons: botones.length,
                        body: document.body.innerText.substring(0, 50)
                    };
                });

                if (resultado.found) {
                    console.log("⚖️ Checkbox marcado. Clickeando botón...");
                    await new Promise(r => setTimeout(r, 1000));
                    
                    // Clickeamos el botón de forma robusta
                    await page.evaluate(() => {
                        const b = Array.from(document.querySelectorAll('button, input[type="submit"], .ui-button'))
                                      .find(el => (el.textContent || el.value || "").toLowerCase().includes('aceptar'));
                        if (b) b.click();
                    });

                    await new Promise(r => setTimeout(r, 3000));
                    console.log("📝 Verificando si el formulario de cédula cargó...");
                    
                    const final = await page.evaluate(() => !!document.querySelector('input[id*="cedula"], input[id*="documento"]'));
                    if (final) {
                        console.log("🚀 ¡EXITO! Formulario de cédula visible.");
                    } else {
                        await page.keyboard.press('Enter');
                        console.log("⌨️ Reintento con Enter enviado.");
                    }
                } else {
                    console.log("⚠️ No se encontraron elementos tras esperar:", resultado);
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
