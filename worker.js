import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';

const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;
const API_KEY = process.env.BRIGHT_DATA_PASS?.trim();

const app = express();
const client = redis.createClient({ url: REDIS_URL });

app.get('/', (req, res) => res.status(200).send('Worker Judicial - Procesando 🟢'));
app.listen(PORT, '0.0.0.0', () => console.log(`🌍 Servidor activo en puerto ${PORT}`));

async function consultar(cedula) {
    try {
        console.log(`🚀 Consultando Policía para: ${cedula}`);
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
            timeout: 80000
        });

        if (response.status !== 200) {
            const errBody = await response.text();
            return `ERROR API ${response.status}: ${errBody.substring(0, 50)}`;
        }

        const resText = await response.text();
        const html = resText.toUpperCase();
        console.log(`📡 Datos recibidos: ${html.length} caracteres.`);

        if (html.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
        if (html.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
        if (html.includes("NO ES VÁLIDA")) return "CÉDULA NO VÁLIDA ❌";
        
        return "RESULTADO DESCONOCIDO 🤔";
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
                console.log(`✅ Resultado [${cedula}]: ${res}`);
            }
        }
    } catch (err) {
        console.error("❌ Error en el bucle:", err);
        setTimeout(iniciar, 5000);
    }
}

iniciar();
