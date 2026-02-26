import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';
import pkg from 'https-proxy-agent';
const { HttpsProxyAgent } = pkg;

// 1. DEFINICIÓN DE VARIABLES (Asegúrate que REDIS_URL esté en Render)
const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL; 
const USER = process.env.BRIGHT_DATA_USER?.trim(); 
const PASS = process.env.BRIGHT_DATA_PASS?.trim();

// 2. CONFIGURACIÓN DEL PROXY (Puerto 22225 para Web Unlocker)
const proxyUrl = `http://${USER}:${PASS}@brd.superproxy.io:22225`;
const agent = new HttpsProxyAgent(proxyUrl);

// 3. VALIDACIÓN PREVENTIVA
if (!REDIS_URL) {
    console.error("❌ ERROR CRÍTICO: La variable REDIS_URL no está definida en Render.");
    process.exit(1); 
}

const app = express();
const client = redis.createClient({ url: REDIS_URL });

app.get('/', (req, res) => res.status(200).send('Worker Judicial Nativo v2.3 🟢'));
app.listen(PORT, '0.0.0.0');

async function consultar(cedula) {
    try {
        console.log(`🚀 Intentando acceso puerto 7005 para: ${cedula}`);
        
        const response = await fetch('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            agent,
            headers: {
                'X-BrightData-Country': 'co',
                'X-BrightData-Render': 'true',
                'X-Brd-Debug': '1' 
            },
            timeout: 60000 
        });

        const html = await response.text();
        const brdError = response.headers.get('x-brd-error');
        
        console.log(`📡 Status: ${response.status} | Tamaño: ${html.length}`);
        
        if (brdError) console.log(`⚠️ Info Proxy: ${brdError}`);

        if (html.length > 5000) {
            const txt = html.toUpperCase();
            if (txt.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
            if (txt.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
        }
        
        return `ERROR: Status ${response.status} (${html.length} bytes)`;
    } catch (e) {
        return `ERROR_TECNICO: ${e.message}`;
    }
}

async function iniciar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📥 Worker en línea y conectado a Redis.");
        
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                const res = await consultar(cedula);
                console.log(`✅ [${cedula}]: ${res}`);
            }
        }
    } catch (err) {
        console.error("❌ Fallo en Redis:", err.message);
        setTimeout(iniciar, 5000);
    }
}

iniciar();
