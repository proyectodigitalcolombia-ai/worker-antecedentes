import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';

const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;
const API_KEY = process.env.BRIGHT_DATA_PASS?.trim();

const app = express();
const client = redis.createClient({ url: REDIS_URL });

// Healthcheck para Render
app.get('/', (req, res) => res.status(200).send('Worker Judicial - Procesando 🟢'));
app.listen(PORT, '0.0.0.0');

async function consultar(cedula) {
    try {
        console.log(`🚀 Iniciando proceso para cédula: ${cedula}`);
        
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
                render: true,
                // Instrucciones para que el navegador de Bright Data interactúe
                actions: [
                    { "action": "wait", "selector": "body" },
                    { "action": "click", "selector": "input[type='checkbox']", "optional": true },
                    { "action": "click", "selector": "button, input[type='submit']", "optional": true },
                    { "action": "wait", "timeout": 3000 }
                ]
            }),
            timeout: 90000
        });

        const resText = await response.text();
        const html = resText.toUpperCase();
        
        console.log(`📡 Respuesta recibida. Longitud: ${html.length} caracteres.`);

        // Análisis de resultados
        if (html.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
        if (html.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
        if (html.includes("NO ES VÁLIDA")) return "CÉDULA NO VÁLIDA ❌";
        
        // Si no encuentra nada, imprimimos un pedazo para investigar en el log
        console.log("🔍 Snippet final:", html.substring(0, 300));
        return "RESULTADO DESCONOCIDO 🤔 (Posible pantalla de captcha o términos)";

    } catch (e) {
        return `ERROR_TECNICO: ${e.message}`;
    }
}

async function iniciar() {
    try {
        if (!client.isOpen) await client.connect();
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
        console.error("❌ Fallo en el bucle:", err.message);
        setTimeout(iniciar, 5000);
    }
}

iniciar();
