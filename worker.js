const browser = await puppeteer.launch({
                headless: "new",
                executablePath: '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-http2', 
                    // Forzamos el esquema http explícitamente
                    `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`
                ]
            });

            const page = await browser.newPage();
            
            // Autenticación explícita antes de navegar
            await page.authenticate({
                username: process.env.PROXY_USER,
                password: process.env.PROXY_PASS
            });

            try {
                // TEST DE CONEXIÓN (Esto nos dirá si el túnel abrió)
                console.log("🌐 Intentando abrir túnel en puerto 2288...");
                await page.goto('https://api.ipify.org', { waitUntil: 'networkidle2', timeout: 20000 });
                const ipDetectada = await page.$eval('body', el => el.innerText);
                console.log(`✅ ¡Túnel abierto con éxito! IP: ${ipDetectada}`);

                console.log("👮 Navegando a la Policía...");
                await page.goto('https://srvandroid.policia.gov.co/Antecedentes/', { 
                    waitUntil: 'networkidle2', 
                    timeout: 60000 
                });
                // ... resto del código
