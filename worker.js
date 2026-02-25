const browser = await puppeteer.launch({
                headless: "new",
                executablePath: '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--proxy-server=http://p.webshare.io:80'
                ]
            });

            const page = await browser.newPage();
            await page.authenticate({ username: 'lzwsgumc-200', password: 'satazom7w0zq' });

            // OPTIMIZACIÓN: Solo bloqueamos imágenes. Dejamos que cargue CSS y JS.
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (req.resourceType() === 'image') {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            try {
                console.log("👮 Cargando portal de la Policía...");
                // Quitamos el domcontentloaded y usamos networkidle2 para asegurar que cargue el formulario
                await page.goto('https://antecedentes.policia.gov.co/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle2', 
                    timeout: 60000 
                });

                console.log("⚖️ Buscando términos...");
                // Intentamos encontrar el botón incluso si el ID cambia ligeramente o tarda
                await page.waitForSelector('#aceptoTerminos', { visible: true, timeout: 35000 });
                
                await page.click('#aceptoTerminos');
                
                // Pequeña pausa para que el botón de Continuar se habilite
                await new Promise(r => setTimeout(r, 1000));
                
                await page.click('input[type="submit"]');
                console.log("✅ ¡Logramos entrar al formulario!");

            } catch (err) {
                // Si falla, tomamos el título para saber si hubo un error 403 o similar
                const title = await page.title();
                console.error(`❌ Fallo: ${err.message}. Título de página: ${title}`);
            }
