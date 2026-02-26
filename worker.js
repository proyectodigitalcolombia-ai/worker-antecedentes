import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

// --- CONFIGURACIÓN DE AMBIENTE ---
const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;
const BRIGHT_DATA_KEY = process.env.BRIGHT_DATA_KEY; // Agrégala en Dashboard de Render
const BRIGHT_DATA_ZONE = 'proyectoantecedentes';

// --- SERVIDOR PARA HEALTH CHECK (RENDER) ---
const app = express();
app.get('/', (req, res) => res.status(200).send('Worker OK 🟢'));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Health Check en puerto ${PORT}`));

// --- CLIENTE REDIS ---
const client = redis.createClient({ url: REDIS_URL });

async function procesarTarea() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("Waiting for tasks in Redis...");

        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            if (!tareaRaw) continue;

            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Consultando cédula: ${cedula}`);

            const resultado = await llamarBrightData(cedula);
            
            // Aquí enviarías el resultado de vuelta a tu API o DB
            console.log(`📊 Resultado Final:`, resultado);
        }
    } catch (err) {
        console.error("❌ Error en Worker:", err);
        setTimeout(procesarTarea, 5000);
    }
}

async function llamarBrightData(cedula) {
    try {
        const response = await fetch('https://api.brightdata.com/request', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${BRIGHT_DATA_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                zone: BRIGHT_DATA_ZONE,
                url: 'https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml',
                country: 'co', // Forzamos IP de Colombia 🇨🇴
                format: 'json',
                render: true,
                actions: [
                    { "wait": "body" },
                    { "click": ".ui-chkbox-box" }, // Acepta términos
                    { "wait": 1000 },
                    { "type": "#formConsulta:cedula", "value": cedula },
                    { "click": "#formConsulta:btnConsultar" },
                    { "wait": 5000 } // Esperamos a que cargue la respuesta
                ]
            })
        });

        const data = await response.json();
        
        if (data.status === 'ok' || data.content) {
            const dom = new JSDOM(data.content);
            const text = dom.window.document.body.innerText;

            if (text.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES";
            if (text.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES";
            return "ERROR_O_NO_ENCONTRADO";
        }
        return "ERROR_BRIGHT_DATA";
    } catch (e) {
        return `ERROR_CONEXION: ${e.message}`;
    }
}

procesarTarea();
