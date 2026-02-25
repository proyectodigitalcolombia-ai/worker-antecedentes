if (coords && coords.x > 0) {
                    console.log(`⚖️ Moviendo ratón y clickeando: X:${Math.round(coords.x)} Y:${Math.round(coords.y)}`);
                    
                    // Simulamos movimiento humano
                    await page.mouse.move(coords.x, coords.y);
                    await new Promise(r => setTimeout(r, 500));
                    await page.mouse.click(coords.x, coords.y);
                    
                    console.log("⏳ Sincronizando con el servidor (AJAX)...");
                    await new Promise(r => setTimeout(r, 5000)); 
                }

                console.log("🚀 Ejecutando envío del formulario...");
                await page.evaluate(() => {
                    const btn = Array.from(document.querySelectorAll('button, .ui-button'))
                                     .find(b => b.innerText.includes('Enviar'));
                    if (btn) {
                        btn.scrollIntoView();
                        btn.click();
                    }
                });

                await new Promise(r => setTimeout(r, 7000));
                
                // VALIDACIÓN DETALLADA
                const validacion = await page.evaluate(() => {
                    const input = document.querySelector('input[id*="cedula"]') || document.querySelector('input[type="text"]');
                    const mensajesError = document.querySelector('.ui-messages-error-detail')?.innerText || "Ninguno";
                    return {
                        exito: !!input && document.body.innerText.includes('Documento'),
                        errorWeb: mensajesError,
                        url: window.location.href
                    };
                });

                if (validacion.exito) {
                    console.log("📝 ¡FORMULARIO DE CÉDULA ALCANZADO!");
                } else {
                    console.log(`⚠️ Error reportado por la web: ${validacion.errorWeb}`);
                    console.log("⌨️ Intento desesperado: Tecla Enter");
                    await page.keyboard.press('Enter');
                    await new Promise(r => setTimeout(r, 5000));
                }
