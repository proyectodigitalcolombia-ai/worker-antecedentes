import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';

// Validamos que las variables existan para que no se caiga al iniciar
const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;
const API_KEY = process.env.BRIGHT_DATA_PASS?.trim();

if (!REDIS_URL || !API_KEY) {
    console.error("❌ ERROR: Faltan variables de entorno (REDIS_URL o BRIGHT_DATA_PASS)");
    process.exit(1); 
}

const app = express();
const client = redis.createClient({ url: REDIS_URL });

// Servidor para Render
app.get('/', (req, res) => res.status(200).send('Worker Judicial Activo 🟢'));
app.listen(PORT, '0.0.0.0', () => console.log(`🌍 Healthcheck en puerto ${PORT}`));

async function consultar(cedula) {
    try {
        console.log(`🚀 Consultando: ${cedula}`);
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
                country: 'co',
                render: true 
            }),
            timeout: 90000
        });

        const resText = await response.text();
        if (response.status === 200) {
            const html = resText.toUpperCase();
            if (html.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
            if (html.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
            return "RESULTADO DESCONOCIDO 🤔";
        }
        return `ERROR API ${response.status}`;
    } catch (e) {
        return `ERROR: ${e.message}`;
    }
}

async function iniciar() {
    try {
        client.on('error', (err) => console.log('Redis Error:', err));
        await client.connect();
        console.log("📥 Conectado a Redis. Esperando tareas...");
        
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                const res = await consultar(cedula);
                console.log(`✅ [${cedula}]: ${res}`);
            }
        }
    } catch (err) {
        console.error("❌ Error en el bucle principal:", err);
        setTimeout(iniciar, 5000); // Reintentar si falla
    }
}

iniciar();
