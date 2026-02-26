import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';
import pkg from 'https-proxy-agent';
const { HttpsProxyAgent } = pkg;

const USER = process.env.BRIGHT_DATA_USER?.trim(); 
const PASS = process.env.BRIGHT_DATA_PASS?.trim();

// Usamos el host global para Web Unlocker
const proxyUrl = `http://${USER}:${PASS}@brd.superproxy.io:22225`;
const agent = new HttpsProxyAgent(proxyUrl);

const app = express();
app.get('/', (req, res) => res.status(200).send('Worker Judicial Nativo v2.2 🟢'));
app.listen(process.env.PORT || 10000, '0.0.0.0');

const client = redis.createClient({ url: REDIS_URL });

async function consultar(cedula) {
    try {
        console.log(`🚀 Intentando acceso puerto 7005 para: ${cedula}`);
        
        const response = await fetch('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            agent,
            headers: {
                'X-BrightData-Country': 'co',
                'X-BrightData-Render': 'true',
                // Header adicional para debug de Bright Data
                'X-Brd-Debug': '1' 
            },
            timeout: 60000 
        });

        const html = await response.text();
        const brdError = response.headers.get('x-brd-error');
        
        console.log(`📡 Status: ${response.status} | Tamaño: ${html.length}`);
        
        if (brdError) {
            console.log(`⚠️ Error detectado por Proxy: ${brdError}`);
            // Si el error dice "forbidden_port", confirma que habilitaste el 7005 en el panel
        }

        if (html.length > 5000) {
            const txt = html.toUpperCase();
            if (txt.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
            if (txt.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
        }
        
        if (response.status === 403) {
            return `ERROR 403: ${brdError || 'Acceso denegado (Revisa puertos en Bright Data)'}`;
        }

        return `ERROR: Respuesta insuficiente (${html.length} bytes)`;
    } catch (e) {
        return `ERROR_TECNICO: ${e.message}`;
    }
}

async function iniciar() {
    if (!client.isOpen) await client.connect();
    while (true) {
        const tarea = await client.brPop('cola_consultas', 0);
        const { cedula } = JSON.parse(tarea.element);
        const res = await consultar(cedula);
        console.log(`✅ [${cedula}]: ${res}`);
    }
}
iniciar();
