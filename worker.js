const browser = await puppeteer.launch({
                headless: false, // ¡IMPORTANTE! Xvfb se encarga de que no necesites monitor
                executablePath: '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--start-maximized',
                    '--proxy-server=http://p.webshare.io:80'
                ]
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });
            
            // Ocultar huellas de automatización a nivel profundo
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
                window.chrome = { runtime: {} };
            });

            await page.authenticate({ username: 'lzwsgumc-200', password: 'satazom7w0zq' });

            try {
                console.log("👮 Navegando con pantalla virtual...");
                await page.goto('https://antecedentes.policia.gov.co/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle2', 
                    timeout: 60000 
                });

                // Esperamos a que los scripts de la policía se ejecuten
                await new Promise(r => setTimeout(r, 8000));

                // Intentamos clic por texto si el ID falla
                console.log("⚖️ Buscando botón de aceptación...");
                await page.evaluate(() => {
                    const elements = document.querySelectorAll('label, span, input');
                    for (let el of elements) {
                        if (el.innerText && el.innerText.includes('ACEPTO')) {
                            el.click();
                        }
                    }
                    const check = document.querySelector('#aceptoTerminos');
                    if (check) check.click();
                });

                await new Promise(r => setTimeout(r, 2000));
                await page.click('input[type="submit"]');
                
                console.log("🚀 ¡Logramos entrar!");

            } catch (err) {
                const title = await page.title();
                console.error(`❌ Error: ${err.message}. Título: ${title}`);
            }
