if (coords) {
                    console.log(`⚖️ Click físico en checkbox: X:${Math.round(coords.x)} Y:${Math.round(coords.y)}`);
                    await page.mouse.click(coords.x, coords.y);
                    
                    // ESPERA CRÍTICA: PrimeFaces suele procesar el check vía AJAX
                    console.log("⏳ Esperando procesamiento de términos...");
                    await new Promise(r => setTimeout(r, 4000)); 
                }

                // 2. Click en el botón ENVIAR
                console.log("🚀 Presionando botón Enviar...");
                await page.evaluate(() => {
                    const btn = Array.from(document.querySelectorAll('button, .ui-button'))
                                     .find(b => b.innerText.includes('Enviar'));
                    if (btn) {
                        btn.focus();
                        btn.click();
                    }
                });

                // Esperamos un poco más la transición
                await new Promise(r => setTimeout(r, 6000));
                
                // 3. Verificación final con log de contenido si falla
                const estadoFinal = await page.evaluate(() => {
                    const input = document.querySelector('input[id*="cedula"]') || document.querySelector('input[type="text"]');
                    return {
                        exito: !!input && document.body.innerText.includes('Documento'),
                        texto: document.body.innerText.substring(0, 100)
                    };
                });

                if (estadoFinal.exito) {
                    console.log("📝 ¡FORMULARIO DE CÉDULA ALCANZADO!");
                } else {
                    console.log("⚠️ No cambió la página. Texto actual:", estadoFinal.texto);
                    console.log("⌨️ Último recurso: Enter");
                    await page.keyboard.press('Enter');
                    await new Promise(r => setTimeout(r, 5000));
                }
