import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';

const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;
// Este DEBE ser el API Token largo de Bright Data
const API_KEY = process.env.BRIGHT_DATA_PASS?.trim(); 

const app = express();
const client = redis.createClient({ url: REDIS_URL });

app.get('/', (req, res) => res.status(200).send('Worker Judicial API Puerto 7005 Activo 🟢'));
app.listen(PORT, '0.0.0.0');

async function consultar(cedula) {
    try {
        console.log(`🚀 Consultando Policía (Puerto 7005) para: ${cedula}`);
        
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
                // Forzamos a Bright Data a esperar a que el JavaScript cargue
                render: true 
            }),
            timeout: 90000
        });

        const resText = await response.text();
        
        if (response.status === 200) {
            console.log(`📡 ÉXITO: Recibidos ${resText.length} caracteres.`);
            
            const html = resText.toUpperCase();
            if (html.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
            if (html.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
            if (html.includes("NO ES VÁLIDA")) return "CÉDULA NO VÁLIDA ❌";
            
            return "ERROR: La página cargó pero no se encontró el resultado esperado.";
        } else {
            console.log(`⚠️ Error de API (${response.status}): ${resText}`);
            return `ERROR API: ${response.status}`;
        }
    } catch (e) {
        console.error("❌ Error en la llamada:", e.message);
        return `ERROR_TECNICO: ${e.message}`;
    }
}

async function iniciar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📥 Worker listo. Esperando tareas para el puerto 7005...");
        
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
