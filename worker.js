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
            await page.setViewport({ width: 1280, height: 900 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

            try {
                console.log("👮 Navegando a puerto 7005...");
                await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle2', 
                    timeout: 60000 
                });

                await new Promise(r => setTimeout(r, 15000));

                // 1. Localización ultra-precisa del checkbox
                const coords = await page.evaluate(() => {
                    // Buscamos el div contenedor de PrimeFaces que tiene el check
                    const box = document.querySelector('.ui-chkbox-box');
                    if (box) {
                        const rect = box.getBoundingClientRect();
                        return { x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) };
                    }
                    // Fallback al texto si la clase falla
                    const label = Array.from(document.querySelectorAll('label, span')).find(e => e.innerText.includes('Acepto'));
                    if (label) {
                        const rect = label.getBoundingClientRect();
                        return { x: rect.left - 15, y: rect.top + (rect.height / 2) };
                    }
                    return null;
                });

                if (coords) {
                    console.log(`⚖️ Interactuando con Checkbox en: X:${Math.round(coords.x)} Y:${Math.round(coords.y)}`);
                    await page.mouse.move(coords.x, coords.y);
                    await new Promise(r => setTimeout(r, 500));
                    await page.mouse.click(coords.x, coords.y);
                    
                    console.log("⏳ Esperando respuesta de términos (AJAX)...");
                    await new Promise(r => setTimeout(r, 5000)); 
                }

                // 2. Envío del formulario con doble método
                console.log("🚀 Ejecutando envío del formulario...");
                await page.evaluate(() => {
                    const btn = document.querySelector('button[id*="continuar"]') || 
                                document.querySelector('.ui-button') ||
                                Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Enviar'));
                    if (btn) {
                        btn.scrollIntoView();
                        btn.click();
                    }
                });

                await new Promise(r => setTimeout(r, 8000));
                
                // 3. Validación de cambio de página
                const resultado = await page.evaluate(() => {
                    const cedulaInput = document.querySelector('input[id*="documento"]') || document.querySelector('input[type="text"]');
                    return {
                        exito: !!cedulaInput && document.body.innerText.includes('Documento'),
                        textoBody: document.body.innerText.substring(0, 100)
                    };
                });

                if (resultado.exito) {
                    console.log("📝 ¡FORMULARIO DE CÉDULA ALCANZADO!");
                } else {
                    console.log(`⚠️ No hubo transición. Contenido: "${resultado.textoBody.replace(/\n/g, ' ')}..."`);
                    console.log("⌨️ Reintento forzado con Enter...");
                    await page.keyboard.press('Enter');
                    await new Promise(r => setTimeout(r, 5000));
                }

            } catch (err) {
                console.error(`❌ Error en el proceso: ${err.message}`);
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
