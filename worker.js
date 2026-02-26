import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';
import pkg from 'https-proxy-agent';
const { HttpsProxyAgent } = pkg;

const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;

// Configuración de Proxy (Usando tus variables de Render)
const USER = `${process.env.BRIGHT_DATA_USER}-country-co`;
const PASS = process.env.BRIGHT_DATA_PASS;
const proxyUrl = `http://${USER}:${PASS}@brd.superproxy.io:33335`;
const agent = new HttpsProxyAgent(proxyUrl);

const app = express();
app.get('/', (req, res) => res.status(200).send('Worker Judicial Activo 🟢'));
app.listen(PORT, '0.0.0.0');

const client = redis.createClient({ url: REDIS_URL });

// --- AQUÍ VA EL CÓDIGO NUEVO QUE ANALIZAMOS ---
async function consultar(cedula) {
    try {
        console.log(`🔎 Iniciando túnel de desbloqueo para: ${cedula}`);
        
        const response = await fetch('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            agent,
            headers: {
                'X-BrightData-Render': 'true',
                'X-BrightData-Super-Proxy-Session': `session_${cedula}_${Math.random()}`,
                'X-BrightData-DNS': 'remote',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
            },
            timeout: 40000 
        });

        const html = await response.text();
        
        console.log(`📡 Tamaño de respuesta: ${html.length} caracteres`);

        if (html.length < 500) {
            console.log(`⚠️ Contenido parcial: ${html.substring(0, 100)}`);
            return "ERROR: La policía detectó el bot (Página vacía)";
        }

        const txt = html.toUpperCase();
        if (txt.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
        if (txt.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
        
        return "PÁGINA CARGADA (Resultado no identificado)";
    } catch (e) {
        return `ERROR_SISTEMA: ${e.message}`;
    }
}
// --- FIN DEL BLOQUE NUEVO ---

async function iniciar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📥 Worker conectado. Esperando tareas...");
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                const resultado = await consultar(cedula);
                console.log(`✅ [${cedula}]: ${resultado}`);
            }
        }
    } catch (err) {
        console.error("❌ Error Redis:", err.message);
        setTimeout(iniciar, 5000);
    }
}

iniciar();
