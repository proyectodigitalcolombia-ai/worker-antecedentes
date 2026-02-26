import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';

const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;

// En modo API, asegúrate que BRIGHT_DATA_PASS sea tu API KEY (el código largo)
const API_KEY = process.env.BRIGHT_DATA_PASS?.trim(); 

const app = express();
const client = redis.createClient({ url: REDIS_URL });

app.get('/', (req, res) => res.status(200).send('Worker Judicial API Mode 🟢'));
app.listen(PORT, '0.0.0.0');

async function consultar(cedula) {
    try {
        console.log(`🚀 Solicitando a Bright Data API para cédula: ${cedula}`);
        
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
            timeout: 80000 // Aumentamos tiempo porque la API procesa el CAPTCHA
        });

        const html = await response.text();
        console.log(`📡 Status API: ${response.status} | Tamaño: ${html.length}`);

        if (html.length > 5000) {
            const txt = html.toUpperCase();
            if (txt.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
            if (txt.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
            if (txt.includes("NO ES VÁLIDA")) return "CÉDULA NO VÁLIDA ❌";
        }
        
        if (response.status === 403 || response.status === 401) {
            return "ERROR: Credenciales de API rechazadas (Verifica tu API KEY)";
        }

        return `ERROR: Respuesta insuficiente (${html.length} bytes)`;
    } catch (e) {
        console.error("❌ Error API:", e.message);
        return `ERROR_TECNICO: ${e.message}`;
    }
}

async function iniciar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📥 Worker API conectado a Redis. Esperando tareas...");
        
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                const res = await consultar(cedula);
                console.log(`✅ [${cedula}]: ${res}`);
            }
        }
    } catch (err) {
        console.error("❌ Fallo en bucle:", err.message);
        setTimeout(iniciar, 5000);
    }
}

iniciar();
