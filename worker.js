import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import redis from 'redis';

// --- SERVIDOR DE SALUD ---
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.status(200).send('Worker Activo 🟢'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Health Check en puerto ${PORT}`));

// --- CONFIGURACIÓN ---
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

                // 1. Espera para que PrimeFaces cargue sus scripts
                await new Promise(r => setTimeout(r, 15000));

                console.log("🎯 Buscando coordenadas del checkbox...");
                const coords = await page.evaluate(() => {
                    const el = Array.from(document.querySelectorAll('td, label, span'))
                                    .find(e => e.innerText.includes('Acepto') || e.innerText.includes('términos'));
                    if (el) {
                        const rect = el.getBoundingClientRect();
                        return { x: rect.left - 20, y: rect.top + (rect.height / 2) };
                    }
                    return null;
                });

                if (coords) {
                    console.log(`⚖️ Click físico en: X:${Math.round(coords.x)} Y:${Math.round(coords.y)}`);
                    await page.mouse.click(coords.x, coords.y);
                    
                    // 2. PAUSA AJAX: Esperamos a que el servidor registre el check
                    console.log("⏳ Sincronizando términos con el servidor...");
                    await new Promise(r => setTimeout(r, 4000)); 
                }

                // 3. Envío del formulario
                console.log("🚀 Presionando botón Enviar...");
                await page.evaluate(() => {
                    const btn = Array.from(document.querySelectorAll('button, .ui-button'))
                                     .find(b => b.innerText.includes('Enviar'));
                    if (btn) {
                        btn.focus();
                        btn.click();
                    }
                });

                await new Promise(r => setTimeout(r, 6000));
                
                // 4. Validación final
                const estado = await page.evaluate(() => {
                    const input = document.querySelector('input[id*="cedula"]') || document.querySelector('input[type="text"]');
                    return {
                        exito: !!input && document.body.innerText.includes('Documento'),
                        texto: document.body.innerText.substring(0, 80)
                    };
                });

                if (estado.exito) {
                    console.log("📝 ¡FORMULARIO DE CÉDULA ALCANZADO!");
                } else {
                    console.log(`⚠️ No avanzó. Texto en pantalla: "${estado.texto}..."`);
                    console.log("⌨️ Intento final con tecla Enter...");
                    await page.keyboard.press('Enter');
                    await new Promise(r => setTimeout(r, 4000));
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
