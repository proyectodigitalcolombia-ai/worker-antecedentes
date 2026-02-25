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
            console.log(`🔎 Iniciando consulta para: 1050974347`);

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

                // Esperamos un tiempo prudente para que cargue el JS de PrimeFaces
                await new Promise(r => setTimeout(r, 12000));

                const resultado = await page.evaluate(() => {
                    // Buscamos el checkbox por su clase de icono (el check verde/azul de PrimeFaces)
                    const checkIcon = document.querySelector('.ui-chkbox-icon') || 
                                     document.querySelector('.ui-chkbox-box') ||
                                     document.querySelector('div[id*="acepto"]');
                    
                    // Buscamos el botón 'Enviar' que ya confirmamos que existe
                    const botones = Array.from(document.querySelectorAll('button, .ui-button'));
                    const btnEnviar = botones.find(b => b.innerText.includes('Enviar'));

                    if (btnEnviar) {
                        // Si encontramos el check, lo clickeamos
                        if (checkIcon) checkIcon.click();
                        
                        // Clickeamos el botón Enviar pase lo que pase
                        btnEnviar.click();
                        return { exito: true, teniaCheck: !!checkIcon };
                    }
                    return { exito: false, btns: botones.map(b => b.innerText.trim()) };
                });

                if (resultado.exito) {
                    console.log(`⚖️ Click enviado (Check detectado: ${resultado.teniaCheck}).`);
                    await new Promise(r => setTimeout(r, 2000));
                    
                    // Refuerzo por teclado
                    await page.keyboard.press('Enter');
                    
                    console.log("⏳ Verificando transición...");
                    // Esperamos el input donde se escribe la cédula
                    await page.waitForSelector('input[type="text"]', { timeout: 10000 });
                    console.log("🚀 ¡EXITO! Formulario de consulta ALCANZADO.");
                } else {
                    console.log("⚠️ No se encontró el botón Enviar. Botones actuales:", resultado.btns);
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
