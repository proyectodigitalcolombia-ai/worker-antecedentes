const browser = await puppeteer.launch({
                headless: "new",
                executablePath: '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--window-size=1920,1080', // Resolución real
                    '--proxy-server=http://p.webshare.io:80'
                ]
            });

            const page = await browser.newPage();
            
            // Forzamos un viewport real
            await page.setViewport({ width: 1920, height: 1080 });

            await page.authenticate({ username: 'lzwsgumc-200', password: 'satazom7w0zq' });

            try {
                // User-Agent idéntico a un Chrome de escritorio actualizado
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

                console.log("👮 Navegando a la Policía (Modo Camuflaje)...");
                
                // Quitamos el waitUntil estricto y usamos un tiempo de espera manual
                await page.goto('https://antecedentes.policia.gov.co/WebJudicial/antecedentes.xhtml', { 
                    timeout: 60000 
                });

                // Esperamos a que la página "respire" y cargue sus scripts internos
                console.log("⏳ Esperando renderizado interno...");
                await new Promise(r => setTimeout(r, 7000)); 

                // Intentamos detectar si hay un mensaje de error en el texto de la página
                const info = await page.evaluate(() => {
                    const bodyText = document.body.innerText;
                    const terms = document.querySelector('#aceptoTerminos');
                    return {
                        hasTerms: !!terms,
                        title: document.title,
                        textSnippet: bodyText.substring(0, 100)
                    };
                });

                console.log(`📄 Título: "${info.title}" | Texto inicial: "${info.textSnippet}"`);

                if (info.hasTerms) {
                    console.log("⚖️ Selector encontrado. Procediendo...");
                    await page.click('#aceptoTerminos');
                    await new Promise(r => setTimeout(r, 1000));
                    await page.click('input[type="submit"]');
                    
                    await page.waitForSelector('#cedulaInput', { timeout: 20000 });
                    console.log("📝 ¡Éxito! Formulario de cédula visible.");
                } else {
                    throw new Error("El botón de términos no existe en el DOM actual.");
                }

            } catch (err) {
                console.error(`❌ Fallo: ${err.message}`);
                // Si el título es "Access Denied", Webshare nos está dando una IP quemada.
            }

            await browser.close();
