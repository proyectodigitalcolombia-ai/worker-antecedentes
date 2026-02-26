import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';
import pkg from 'https-proxy-agent';
const { HttpsProxyAgent } = pkg;

const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;

// Credenciales limpias
const USER = process.env.BRIGHT_DATA_USER?.trim(); 
const PASS = process.env.BRIGHT_DATA_PASS?.trim();

/**
 * CAMBIO CLAVE: Usamos el host 'zproxy.lum-superproxy.io' 
 * que es más estable para zonas nuevas de Web Unlocker.
 */
const proxyUrl = `http://${USER}:${PASS}@zproxy.lum-superproxy.io:22225`;
const agent = new HttpsProxyAgent(proxyUrl);

const app = express();
app.get('/', (req, res) => res.status(200).send('Worker Judicial Unlocker Premium 🟢'));
app.listen(PORT, '0.0.0.0');

const client = redis.createClient({ url: REDIS_URL });

async function consultar(cedula) {
    try {
        console.log(`🚀 Iniciando bypass con Host Alternativo para: ${cedula}`);
        
        const response = await fetch('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            agent,
            headers: {
                'X-BrightData-Country': 'co'
            },
            timeout: 60000 
        });

        // REVISIÓN DE ERRORES INTERNOS DE BRIGHT DATA
        const brdError = response.headers.get('x-brd-error');
        const html = await response.text();
        
        console.log(`📡 Status: ${response.status}`);
        console.log(`📡 Tamaño: ${html.length} caracteres.`);
        if (brdError) console.log(`⚠️ Mensaje del Proxy: ${brdError}`);

        if (html.length > 5000) {
            const txt = html.toUpperCase();
            if (txt.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
            if (txt.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
            if (txt.includes("NO ES VÁLIDA")) return "CÉDULA NO VÁLIDA ❌";
        }
        
        if (response.status === 407) return "ERROR: Autenticación fallida (Revisa User/Pass en Render)";
        if (brdError) return `ERROR PROXY: ${brdError}`;
        
        return `ERROR: Respuesta insuficiente (${html.length} bytes)`;
    } catch (e) {
        console.error("❌ Error en la petición:", e.message);
        return `ERROR_TECNICO: ${e.message}`;
    }
}

async function iniciar() {
    try {
        if (!client.isOpen) {
            await client.connect();
            console.log("📥 Worker conectado a Redis y en espera...");
        }

        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                const resultado = await consultar(cedula);
                console.log(`✅ [${cedula}]: ${resultado}`);
            }
        }
    } catch (err) {
        console.error("❌ Error en bucle principal:", err.message);
        setTimeout(iniciar, 5000);
    }
}

iniciar();
