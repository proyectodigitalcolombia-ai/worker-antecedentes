import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';

const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;
// Usamos BRIGHT_DATA_PASS que configuraste con el Token largo (3cf7...)
const API_KEY = process.env.BRIGHT_DATA_PASS?.trim(); 

const app = express();
const client = redis.createClient({ url: REDIS_URL });

// Dashboard mínimo para Render
app.get('/', (req, res) => res.status(200).send('Worker Judicial - API Mode v3.5 🟢'));
app.listen(PORT, '0.0.0.0');

async function consultar(cedula) {
    try {
        console.log(`🚀 Solicitando Desbloqueo API para: ${cedula}`);
        
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
                render: true // Indispensable para que cargue el contenido tras el puerto 7005
            }),
            timeout: 95000 
        });

        const resText = await response.text();
        console.log(`📡 Status API: ${response.status}`);

        if (response.status === 200) {
            const html = resText.toUpperCase();
            if (html.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
            if (html.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
            if (html.includes("NO ES VÁLIDA")) return "CÉDULA NO VÁLIDA ❌";
            return "ERROR: Página cargada pero estructura no reconocida";
        } else {
            console.log(`⚠️ Detalle del error: ${resText}`);
            return `ERROR API ${response.status}: ${resText.substring(0, 50)}`;
        }
    } catch (e) {
        return `ERROR_TECNICO: ${e.message}`;
    }
}

async function iniciar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📥 Worker conectado a Redis. Escuchando cola de tareas...");
        
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                const res = await consultar(cedula);
                console.log(`✅ [${cedula}]: ${res}`);
                // Aquí podrías guardar el resultado en otra lista o enviarlo por webhook
            }
        }
    } catch (err) {
        console.error("❌ Fallo en bucle:", err.message);
        setTimeout(iniciar, 5000);
    }
}

iniciar();
