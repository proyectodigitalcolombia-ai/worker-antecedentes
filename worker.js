import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';
import pkg from 'https-proxy-agent';
const { HttpsProxyAgent } = pkg;

const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;

// Credenciales desde tus variables en Render (image_c2d46b.png)
const USER = process.env.BRIGHT_DATA_USER?.trim(); 
const PASS = process.env.BRIGHT_DATA_PASS?.trim();

// Puerto 22225: Es el puerto nativo para el Web Unlocker con soporte CAPTCHA
const proxyUrl = `http://${USER}:${PASS}@brd.superproxy.io:22225`;
const agent = new HttpsProxyAgent(proxyUrl);

const app = express();
app.get('/', (req, res) => res.status(200).send('Worker Judicial Nativo v2.0 🟢'));
app.listen(PORT, '0.0.0.0');

const client = redis.createClient({ url: REDIS_URL });

async function consultar(cedula) {
    try {
        console.log(`🚀 Iniciando bypass nativo para: ${cedula}`);
        
        // La URL con puerto 7005 requiere que el proxy soporte SSL en puertos no estándar
        const response = await fetch('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            agent,
            headers: {
                'X-BrightData-Country': 'co', // Forzado en Colombia (image_c25450.png)
                'X-BrightData-Render': 'true'   // Obligatorio para activar el Solucionador de CAPTCHA
            },
            timeout: 60000 
        });

        const html = await response.text();
        console.log(`📡 Status: ${response.status} | Tamaño: ${html.length} caracteres.`);

        // Análisis del contenido
        if (html.length > 5000) {
            const txt = html.toUpperCase();
            if (txt.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
            if (txt.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
        }
        
        if (response.status === 403) return "ERROR 403: Acceso denegado. Revisa permisos de puerto 7005.";
        
        return `ERROR: Respuesta insuficiente (${html.length} bytes)`;
    } catch (e) {
        return `ERROR_TECNICO: ${e.message}`;
    }
}

async function iniciar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📥 Worker Nativo en línea esperando tareas...");
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
