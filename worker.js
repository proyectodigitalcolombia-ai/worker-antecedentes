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
            
            // Siendo cuenta de pago, podemos permitirnos una resolución más alta
            await page.setViewport({ width: 1366, height: 768 });
            await page.authenticate({ username: 'lzwsgumc-200', password: 'satazom7w0zq' });

            try {
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

                console.log("👮 Cargando portal de la Policía...");
                // En cuentas de pago, 'networkidle0' es más seguro (espera a que no haya NADA de tráfico)
                await page.goto('https://antecedentes.policia.gov.co/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle0', 
                    timeout: 80000 
                });

                console.log("⚖️ Buscando términos (Búsqueda Profunda)...");

                // Intentamos encontrar el botón por múltiples métodos
                const botonAcepto = await page.evaluateHandle(() => {
                    // Intento 1: Por ID
                    let el = document.querySelector('#aceptoTerminos');
                    // Intento 2: Por nombre si el ID falló
                    if (!el) el = document.querySelector('input[name*="acepto"]');
                    return el;
                });

                if (botonAcepto.asElement()) {
                    console.log("✅ Botón detectado. Marcando...");
                    await botonAcepto.asElement().click();
                    
                    await new Promise(r => setTimeout(r, 2000)); // Pausa de seguridad

                    await page.evaluate(() => {
                        const btn = document.querySelector('input[type="submit"]');
                        if (btn) btn.click();
                    });

                    console.log("🚀 Entrando al formulario de consulta...");
                    await page.waitForSelector('#cedulaInput', { timeout: 20000 });
                } else {
                    // Diagnóstico Pro: Guardamos el título y un pedazo del HTML
                    const diagnostico = await page.evaluate(() => ({
                        titulo: document.title,
                        html: document.body.innerHTML.substring(0, 300)
                    }));
                    console.error(`❌ El botón no existe. Título: ${diagnostico.titulo}`);
                    console.log(`🔎 Contenido recibido: ${diagnostico.html}`);
                }

            } catch (err) {
                console.error(`❌ Error en el proceso: ${err.message}`);
            }

            await browser.close();
