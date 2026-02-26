import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';

const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;
// Este debe ser el API TOKEN (el largo que creas en ajustes de cuenta)
const API_KEY = process.env.BRIGHT_DATA_PASS?.trim(); 

const app = express();
const client = redis.createClient({ url: REDIS_URL });

app.get('/', (req, res) => res.status(200).send('Worker Judicial - API Desbloqueo v3.5 🟢'));
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
                zone: 'web_unlocker1', // Asegúrate que este nombre coincida con tu zona
                url: 'https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml',
                format: 'raw',
                country: 'co'
            }),
            timeout: 95000 // Le damos tiempo extra para el puerto 7005
        });

        const resText = await response.text();
        console.log(`📡 Status API: ${response.status}`);

        if (response.status === 200) {
            const html = resText.toUpperCase();
            if (html.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
            if (html.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
            if (html.includes("NO ES VÁLIDA")) return "CÉDULA NO VÁLIDA ❌";
            return "ERROR: Respuesta inesperada (HTML recibido)";
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
        console.log("📥 Worker conectado. Esperando tareas vía API de Desbloqueo...");
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
