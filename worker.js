// 2. Navegación a la Policía
                console.log("👮 Navegando a Policía Nacional...");
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
                
                // Intentamos cargar la página con un tiempo de espera más largo
                await page.goto('https://antecedentes.policia.gov.co/WebJudicial/antecedentes.xhtml', { 
                    waitUntil: 'networkidle0', // Espera a que no haya tráfico de red
                    timeout: 60000 
                });

                // 3. Aceptar términos y condiciones
                console.log("⚖️ Buscando términos y condiciones...");
                try {
                    await page.waitForSelector('#aceptoTerminos', { timeout: 30000 }); // Subimos a 30 seg
                    await page.click('#aceptoTerminos');
                    await page.click('input[type="submit"]');
                    console.log("✅ Términos aceptados.");
                } catch (e) {
                    console.log("⚠️ No se encontró el botón de términos. ¿Página caída o bloqueo?");
                    // Opcional: tomar captura para debug (si tienes configurado almacenamiento)
                    throw new Error("Página de inicio no cargó correctamente");
                }
