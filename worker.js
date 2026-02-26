import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';

const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;
// IMPORTANTE: BRIGHT_DATA_PASS debe ser tu API KEY larga (ej: 3cf7...)
const API_KEY = process.env.BRIGHT_DATA_PASS?.trim(); 

const app = express();
const client = redis.createClient({ url: REDIS_URL });

app.get('/', (req, res) => res.status(200).send('Worker Judicial API Mode v3.0 🟢'));
app.listen(PORT, '0.0.0.0');

async function consultar(cedula) {
    try {
        console.log(`🚀 Solicitando vía API (Modo Directo) para: ${cedula}`);
        
        // NO USAMOS AGENT AQUÍ. Es una petición HTTP normal a la API de Bright Data.
        const response = await fetch('https://api.brightdata.com/request', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                zone: 'web_unlocker1',
                url: 'https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml',
                format: 'raw',
                country: 'co'
            }),
            timeout: 90000
        });

        const html = await response.text();
        console.log(`📡 Status API: ${response.status} | Tamaño: ${html.length} caracteres.`);

        if (html.length > 5000) {
            const txt = html.toUpperCase();
            if (txt.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
            if (txt.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
        }
        
        if (response.status === 403 || response.status === 401) {
            return "ERROR: Autenticación de API fallida. Revisa el API KEY en Render.";
        }

        return `ERROR: Respuesta insuficiente de la API (${html.length} bytes)`;
    } catch (e) {
        return `ERROR_API_CRÍTICO: ${e.message}`;
    }
}

async function iniciar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📥 Worker API conectado a Redis. Sin usar proxies.");
        
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                const res = await consultar(cedula);
                console.log(`✅ [${cedula}]: ${res}`);
            }
        }
    } catch (err) {
        setTimeout(iniciar, 5000);
    }
}

iniciar();
