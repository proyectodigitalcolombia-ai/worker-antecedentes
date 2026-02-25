try {
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

                console.log("👮 Navegando a puerto 7005...");
                await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle2', 
                    timeout: 60000 
                });

                console.log("✅ Página cargada. Esperando renderizado...");
                await new Promise(r => setTimeout(r, 12000));

                // 1. Intentamos obtener el texto de la página si falla
                const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 200));
                console.log(`📄 Contenido inicial: "${bodyText.replace(/\n/g, ' ')}..."`);

                // 2. Buscamos el formulario (soporta iframes y selectores genéricos)
                const resultado = await page.evaluate(() => {
                    // Función para buscar en un documento o iframe
                    const buscarEnDoc = (doc) => {
                        const check = doc.querySelector('input[type="checkbox"]');
                        const btn = doc.querySelector('input[type="submit"], button[type="submit"]');
                        return { check, btn };
                    };

                    // Buscar en el documento principal
                    let found = buscarEnDoc(document);
                    
                    // Si no está, buscar en todos los iframes
                    if (!found.check) {
                        const iframes = Array.from(document.querySelectorAll('iframe'));
                        for (let frame of iframes) {
                            try {
                                const frameFound = buscarEnDoc(frame.contentDocument || frame.contentWindow.document);
                                if (frameFound.check) {
                                    found = frameFound;
                                    break;
                                }
                            } catch (e) { /* Error de cross-origin */ }
                        }
                    }

                    if (found.check && found.btn) {
                        found.check.click();
                        // Esperamos un momento y clickeamos el botón
                        setTimeout(() => found.btn.click(), 500);
                        return { exito: true };
                    }

                    return { 
                        exito: false, 
                        totalInputs: document.querySelectorAll('input').length,
                        totalIframes: document.querySelectorAll('iframe').length 
                    };
                });

                if (resultado.exito) {
                    console.log("⚖️ Términos aceptados.");
                    await page.waitForSelector('input[id*="cedula"], input', { timeout: 15000 });
                    console.log("📝 ¡Formulario de consulta alcanzado!");
                } else {
                    console.log("⚠️ No se encontró el formulario. Detalles:", resultado);
                    // Si no encontramos nada, tomamos una foto del error para saber qué está viendo el bot
                    const b64 = await page.screenshot({ encoding: 'base64' });
                    console.log("📸 Captura de pantalla realizada (Base64 disponible en logs si fuera necesario).");
                }

            } catch (err) {
                console.error(`❌ Error en el flujo: ${err.message}`);
            }
