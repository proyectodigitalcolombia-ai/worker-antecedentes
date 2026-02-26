import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';
import pkg from 'https-proxy-agent';
const { HttpsProxyAgent } = pkg;

const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;

// Credenciales extraídas de tus variables en Render
const USER = process.env.BRIGHT_DATA_USER; 
const PASS = process.env.BRIGHT_DATA_PASS;

// Puerto 22225: Activa el Web Unlocker con CAPTCHA solver
const proxyUrl = `http://${USER}:${PASS}@brd.superproxy.io:22225`;
const agent = new HttpsProxyAgent(proxyUrl);

const app = express();
app.get('/', (req, res) => res.status(200).send('Worker Judicial Unlocker Premium 🟢'));
app.listen(PORT, '0.0.0.0');

const client = redis.createClient({ url: REDIS_URL });

async function consultar(cedula) {
    try {
        console.log(`🚀 Web Unlocker resolviendo seguridad para cédula: ${cedula}`);
        
        const response = await fetch('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            agent,
            headers: {
                'X-BrightData-Country': 'co' // Salida obligatoria por Colombia
            },
            timeout: 60000 
        });

        const html = await response.text();
        console.log(`📡 Respuesta recibida. Tamaño: ${html.length} caracteres.`);

        if (html.length > 5000) {
            const txt = html.toUpperCase();
            if (txt.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
            if (txt.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
            if (txt.includes("NO ES VÁLIDA")) return "CÉDULA NO VÁLIDA ❌";
        }
        
        if (html.length === 0) return "ERROR: Respuesta vacía (Verificar conexión proxy)";
        
        return `ERROR: No se detectó resultado claro (${html.length} bytes)`;
    } catch (e) {
        return `ERROR_TECNICO: ${e.message}`;
    }
}

async function iniciar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📥 Worker Premium conectado. Esperando tareas...");
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                const resultado = await consultar(cedula);
                console.log(`✅ [${cedula}]: ${resultado}`);
            }
        }
    } catch (err) {
        console.error("❌ Fallo en el bucle principal:", err.message);
        setTimeout(iniciar, 5000);
    }
}

iniciar();
