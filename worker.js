const browser = await puppeteer.launch({
                headless: "new",
                executablePath: '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--proxy-server=http://p.webshare.io:80'
                ]
            });

            const page = await browser.newPage();
            await page.authenticate({ username: 'lzwsgumc-200', password: 'satazom7w0zq' });

            try {
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

                console.log("👮 Cargando portal de la Policía...");
                // Cambiamos a 'load' para forzar que espere a que TODO baje
                await page.goto('https://antecedentes.policia.gov.co/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'load', 
                    timeout: 60000 
                });

                console.log("⚖️ Buscando términos y condiciones...");
                
                // TRUCO: Esperar un poco y forzar el clic vía JavaScript puro si el selector falla
                await new Promise(r => setTimeout(r, 3000)); 

                const checkExist = await page.evaluate(() => {
                    const el = document.querySelector('#aceptoTerminos');
                    if (el) {
                        el.click();
                        return true;
                    }
                    return false;
                });

                if (checkExist) {
                    console.log("✅ Checkbox encontrado y marcado vía Inyección.");
                    await page.evaluate(() => {
                        const btn = document.querySelector('input[type="submit"]');
                        if (btn) btn.click();
                    });
                } else {
                    // Si no lo encuentra, vamos a ver qué hay en la página
                    const textoPagina = await page.evaluate(() => document.body.innerText.substring(0, 200));
                    const titulo = await page.title();
                    throw new Error(`Selector no hallado. Título: ${titulo}. Inicio del texto: ${textoPagina}`);
                }

                console.log("🚀 Esperando carga del formulario de cédula...");
                await page.waitForSelector('#cedulaInput', { timeout: 20000 });
                console.log("📝 ¡Estamos dentro del formulario!");

            } catch (err) {
                console.error(`❌ Fallo: ${err.message}`);
                // Si ves "Access Denied" o "403" en el texto de arriba, la IP está marcada.
            }

            await browser.close();
