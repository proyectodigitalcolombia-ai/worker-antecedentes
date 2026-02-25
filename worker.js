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
                // User-Agent de alta confianza
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

                console.log("👮 Intentando carga inicial...");
                await page.goto('https://antecedentes.policia.gov.co/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle2', 
                    timeout: 60000 
                });

                // Verificamos si el selector aparece, si no, RECARGAMOS (Truco clave)
                let selectorFound = false;
                try {
                    await page.waitForSelector('#aceptoTerminos', { timeout: 15000 });
                    selectorFound = true;
                } catch (e) {
                    console.log("⚠️ Página inicial no respondió. Reintentando con recarga...");
                    await page.reload({ waitUntil: 'networkidle2' });
                }

                console.log("⚖️ Buscando términos (Intento 2)...");
                await page.waitForSelector('#aceptoTerminos', { visible: true, timeout: 30000 });
                
                // En lugar de click directo, usamos evaluate para disparar el evento nativo
                await page.evaluate(() => {
                    const check = document.querySelector('#aceptoTerminos');
                    if (check) check.click();
                });

                await new Promise(r => setTimeout(r, 1500));
                
                await page.evaluate(() => {
                    const btn = document.querySelector('input[type="submit"]');
                    if (btn) btn.click();
                });
                
                console.log("🚀 ¡Logramos entrar al área de consulta!");

            } catch (err) {
                const title = await page.title();
                const url = page.url();
                console.error(`❌ Fallo crítico: ${err.message}`);
                console.log(`📍 URL final: ${url} | Título: ${title}`);
                
                // Si el título es "Página de inicio", la Policía te redirigió fuera.
                if (title.includes("Página de inicio")) {
                    console.error("🚫 Redirección detectada: La Policía rechazó el túnel del proxy.");
                }
            }
