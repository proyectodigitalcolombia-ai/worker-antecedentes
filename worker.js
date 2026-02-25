import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import redis from 'redis';

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.status(200).send('Worker Activo 🟢'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Worker operativo`));

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
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox', 
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process'
                ]
            });

            const page = await browser.newPage();
            // Identidad de un Chrome en Bogotá, Colombia
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

            try {
                console.log("👮 Cargando portal...");
                await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle2', 
                    timeout: 60000 
                });

                // 1. Espera humana
                await new Promise(r => setTimeout(r, 10000));

                console.log("💉 Forzando aceptación interna...");
                await page.evaluate(() => {
                    // Marcamos visualmente
                    const check = document.querySelector('.ui-chkbox-box');
                    if (check) check.click();
                    
                    // Almacenamos en el sessionStorage que ya aceptamos (algunos portales JSF lo usan)
                    sessionStorage.setItem('aceptoterminos', 'true');
                });

                await new Promise(r => setTimeout(r, 3000));

                // 2. Acción de envío mediante ejecución de script nativo
                console.log("🚀 Disparando validación de servidor...");
                await page.evaluate(() => {
                    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Enviar'));
                    if (btn) {
                        // Forzamos el evento 'oncomplete' de PrimeFaces si existe
                        btn.click();
                    }
                });

                // ESPERA DE GRACE: Si nos manda a index.xhtml, intentaremos re-entrar
                await new Promise(r => setTimeout(r, 8000));

                if (page.url().includes('index.xhtml')) {
                    console.log("⚠️ Redirección detectada. Intentando re-entrada forzada...");
                    await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/consulta.xhtml', { waitUntil: 'networkidle2' }).catch(() => {});
                }

                // 3. Verificación de campos
                const final = await page.evaluate(() => {
                    const i = document.querySelector('input[id*="cedula"]') || document.querySelector('input');
                    return {
                        ok: !!i && document.body.innerText.includes('Documento'),
                        url: window.location.href,
                        txt: document.body.innerText.substring(0, 50)
                    };
                });

                if (final.ok) {
                    console.log("🚀 ¡BRUTAL! Formulario alcanzado.");
                } else {
                    console.log(`❌ Bloqueado en: ${final.url}. Contenido: ${final.txt}`);
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
