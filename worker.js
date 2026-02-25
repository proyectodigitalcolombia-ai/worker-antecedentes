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
            console.log(`🔎 Iniciando consulta directa para: ${cedula}`);

            const browser = await puppeteer.launch({
                headless: "new",
                executablePath: '/usr/bin/google-chrome-stable',
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox',
                    '--disable-blink-features=AutomationControlled', // Esconde que es un bot
                    '--lang=es-ES,es;q=0.9' // Simula idioma local
                ]
            });

            const page = await browser.newPage();
            
            // Forzamos que el navegador no se identifique como bot
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
            });

            try {
                console.log("👮 Navegando a la URL directa...");
                // Usamos la URL que sugeriste
                await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle2', 
                    timeout: 60000 
                });

                await new Promise(r => setTimeout(r, 10000));

                // Intentamos la acción de aceptación "suave"
                console.log("⚖️ Intentando marcar checkbox...");
                const checkFound = await page.evaluate(() => {
                    const chk = document.querySelector('.ui-chkbox-box');
                    if (chk) {
                        chk.click();
                        return true;
                    }
                    return false;
                });

                if (checkFound) {
                    await new Promise(r => setTimeout(r, 3000));
                    console.log("🚀 Pulsando enviar...");
                    await page.keyboard.press('Enter'); // El Enter suele ser más seguro que el click por código
                }

                await new Promise(r => setTimeout(r, 8000));

                const final = await page.evaluate(() => {
                    return {
                        url: window.location.href,
                        body: document.body.innerText.substring(0, 100).replace(/\n/g, ' '),
                        input: !!document.querySelector('input')
                    };
                });

                if (final.url.includes('antecedentes.xhtml') && final.input) {
                    console.log("🚀 ¡ÉXITO! Estamos dentro del formulario.");
                } else {
                    console.log(`⚠️ Seguimos fuera. URL: ${final.url}`);
                    console.log(`📝 Contenido: ${final.body}`);
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
