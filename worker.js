const browser = await puppeteer.launch({
                headless: "new",
                executablePath: '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled', // Quita la marca de "bot"
                    '--proxy-server=http://p.webshare.io:80'
                ]
            });

            const page = await browser.newPage();
            
            // Ocultar Puppeteer más a fondo
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
            });

            await page.authenticate({ username: 'lzwsgumc-200', password: 'satazom7w0zq' });

            try {
                console.log("👮 Cargando portal de la Policía...");
                // Usamos un User-Agent de Windows real y reciente
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

                // Navegamos con una espera más relajada
                await page.goto('https://antecedentes.policia.gov.co/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle2', 
                    timeout: 70000 
                });

                // Esperamos un segundo extra para que los scripts de la página se calmen
                await new Promise(r => setTimeout(r, 2000));

                console.log("⚖️ Buscando términos...");
                // Intentamos buscar por ID o por texto si el ID falla
                await page.waitForSelector('#aceptoTerminos', { visible: true, timeout: 40000 });
                
                console.log("✅ Selector encontrado. Haciendo clic...");
                await page.click('#aceptoTerminos');
                
                await new Promise(r => setTimeout(r, 5000)); // Pausa humana
                
                await page.click('input[type="submit"]');
                console.log("🚀 Entramos al formulario de cédula.");

            } catch (err) {
                // Capturamos lo que ve el bot para saber qué pasó
                const title = await page.title();
                const content = await page.content();
                console.error(`❌ Error: ${err.message}. Título: ${title}`);
                if (content.includes("Cloudflare") || content.includes("sucuri")) {
                    console.error("🚫 Bloqueo de Firewall detectado (Bot Check)");
                }
            }
