import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';

const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;
const API_KEY = process.env.BRIGHT_DATA_PASS?.trim();

const app = express();
const client = redis.createClient({ url: REDIS_URL });

// Healthcheck para Render
app.get('/', (req, res) => res.status(200).send('Worker Activo 🟢'));
app.listen(PORT, '0.0.0.0');

async function consultar(cedula) {
    try {
        console.log(`🔎 Procesando cédula: ${cedula}`);
        
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
                // Parámetros críticos para evitar el error de 0 caracteres:
                "dns": "local",
                "session_id": `session_${cedula}_${Math.random()}`,
                "timeout": 120000 
            }),
            timeout: 95000 
        });

        const resText = await response.text();
        
        if (!resText || resText.length === 0) {
            console.log(`⚠️ Advertencia: Bright Data respondió vacío (Status ${response.status})`);
            return "ERROR: Respuesta vacía de la red de proxies.";
        }

        const html = resText.toUpperCase();
        console.log(`📡 Recibidos: ${html.length} caracteres.`);

        // Lógica de detección
        if (html.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
        if (html.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
        if (html.includes("NO ES VÁLIDA")) return "CÉDULA NO VÁLIDA ❌";
        if (html.includes("TERMINOS Y CONDICIONES") || html.includes("ACEPTAR")) return "BLOQUEADO EN TÉRMINOS 📄";

        console.log("🔍 Muestra del contenido:", html.substring(0, 300));
        return "RESULTADO DESCONOCIDO 🤔";

    } catch (e) {
        console.error("❌ Error técnico:", e.message);
        return `ERROR: ${e.message}`;
    }
}

async function iniciar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📥 Worker conectado. Escuchando Redis...");
        
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                const resultado = await consultar(cedula);
                console.log(`🏁 [${cedula}]: ${resultado}`);
            }
        }
    } catch (err) {
        console.error("❌ Error en bucle:", err);
        setTimeout(iniciar, 5000);
    }
}

iniciar();
