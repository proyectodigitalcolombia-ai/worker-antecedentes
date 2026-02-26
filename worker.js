import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';
import pkg from 'https-proxy-agent';
const { HttpsProxyAgent } = pkg;

// Configuración del puerto y Redis
const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;

// Credenciales validadas en tus imágenes
const USER = process.env.BRIGHT_DATA_USER?.trim(); 
const PASS = process.env.BRIGHT_DATA_PASS?.trim();

// Host de alto rendimiento con puerto para Web Unlocker
const proxyUrl = `http://${USER}:${PASS}@zproxy.lum-superproxy.io:22225`;
const agent = new HttpsProxyAgent(proxyUrl);

const app = express();
app.get('/', (req, res) => res.status(200).send('Worker Judicial Unlocker Activo 🟢'));
app.listen(PORT, '0.0.0.0');

const client = redis.createClient({ url: REDIS_URL });

async function consultar(cedula) {
    try {
        console.log(`🚀 Consultando antecedentes para: ${cedula}`);
        
        const response = await fetch('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            agent,
            headers: {
                'X-BrightData-Country': 'co',
                'X-BrightData-Render': 'true' // Asegura el renderizado completo
            },
            timeout: 60000 
        });

        const html = await response.text();
        console.log(`📡 Status: ${response.status} | Tamaño: ${html.length} caracteres.`);

        if (html.length > 5000) {
            const txt = html.toUpperCase();
            if (txt.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
            if (txt.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
        }
        
        return `ERROR: Respuesta insuficiente (${html.length} bytes)`;
    } catch (e) {
        return `ERROR_TECNICO: ${e.message}`;
    }
}

async function iniciar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📥 Esperando tareas en Redis...");
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                const resultado = await consultar(cedula);
                console.log(`✅ [${cedula}]: ${resultado}`);
            }
        }
    } catch (err) {
        setTimeout(iniciar, 5000);
    }
}

iniciar();
