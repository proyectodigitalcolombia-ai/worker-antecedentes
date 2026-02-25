// ... (resto del código igual hasta el bloque de navegación)

            try {
                // 1. Verificación de IP (Para saber si el proxy está vivo)
                console.log("🌐 Verificando túnel...");
                await page.goto('https://api.ipify.org', { waitUntil: 'networkidle2', timeout: 20000 });
                const ip = await page.$eval('body', el => el.innerText);
                console.log(`✅ IP Actual: ${ip}`);

                // 2. Navegación a la URL con puerto 7005
                console.log("👮 Navegando a URL Técnica (Puerto 7005)...");
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
                
                // Intentamos entrar directamente
                await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'load', 
                    timeout: 90000 // Aumentamos a 90 segundos porque el puerto 7005 es lento
                });

                // 3. Verificación de carga
                const titulo = await page.title();
                console.log(`📄 Título de la página: ${titulo}`);

                // 4. Aceptar términos (si aparecen)
                const terminos = await page.$('#aceptoTerminos');
                if (terminos) {
                    console.log("⚖️ Aceptando términos...");
                    await page.click('#aceptoTerminos');
                    await page.click('input[type="submit"]');
                    await page.waitForNavigation({ waitUntil: 'networkidle2' });
                }

                // 5. Llenar Cédula
                console.log("📝 Ingresando cédula...");
                await page.waitForSelector('#cedulaInput', { timeout: 20000 });
                await page.type('#cedulaInput', cedula);
                
                // ... (proceso de captcha y consulta)

            } catch (err) {
                console.error(`❌ Falló la conexión al puerto 7005: ${err.message}`);
                if (err.message.includes('ERR_CONNECTION_REFUSED')) {
                    console.log("💡 El servidor de la Policía rechazó la conexión. Probablemente el puerto 7005 está bloqueado en el Proxy.");
                }
            }
// ...
