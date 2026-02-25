console.log("✅ Página cargada. Esperando renderizado...");
                    await new Promise(r => setTimeout(r, 10000)); // Esperamos a que cargue el JS interno

                    const exito = await page.evaluate(() => {
                        // Buscamos cualquier checkbox y cualquier botón de submit
                        const check = document.querySelector('input[type="checkbox"]');
                        const btn = document.querySelector('input[type="submit"], button[type="submit"]');
                        
                        if (check && btn) {
                            check.click();
                            // Pequeño delay para que el sitio registre el click del checkbox
                            setTimeout(() => btn.click(), 1000);
                            return true;
                        }
                        return { foundCheck: !!check, foundBtn: !!btn };
                    });

                    if (exito === true) {
                        console.log("⚖️ Términos aceptados.");
                        // Esperamos específicamente el input de la cédula
                        await page.waitForSelector('input', { timeout: 15000 });
                        console.log("📝 Formulario de consulta visible.");
                        
                        // Captura final para que veas el formulario en tus logs (si tienes activado el guardado)
                        await page.screenshot({ path: 'formulario_listo.png' });
                    } else {
                        console.log("⚠️ No se encontraron los elementos:", exito);
                    }
