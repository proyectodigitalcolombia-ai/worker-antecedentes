// Reemplaza la parte de la configuración del agente por esta:
const USER = process.env.BRIGHT_DATA_USER.trim();
const PASS = process.env.BRIGHT_DATA_PASS.trim();

// Usamos el puerto 22225 pero simplificamos la construcción de la URL
const proxyUrl = `http://${USER}:${PASS}@brd.superproxy.io:22225`;
const agent = new HttpsProxyAgent(proxyUrl);

async function consultar(cedula) {
    try {
        console.log(`🚀 Intento Premium con Web Unlocker para: ${cedula}`);
        
        const response = await fetch('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            agent,
            headers: {
                // Quitamos headers extras para que el Web Unlocker use sus valores por defecto
                'X-BrightData-Country': 'co'
            },
            timeout: 60000 
        });

        // LOG CRÍTICO: Vamos a ver qué status nos da el proxy exactamente
        console.log(`📡 Status Code: ${response.status}`);
        
        const html = await response.text();
        console.log(`📡 Tamaño: ${html.length} caracteres.`);

        if (response.status === 407) {
            return "ERROR: Autenticación fallida. Verifica que el Password en Render sea: jamev8ujf8of";
        }

        if (html.length > 5000) {
            const txt = html.toUpperCase();
            if (txt.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
            if (txt.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
        }
        
        return `PÁGINA VACÍA (Status ${response.status})`;
    } catch (e) {
        return `ERROR: ${e.message}`;
    }
}
