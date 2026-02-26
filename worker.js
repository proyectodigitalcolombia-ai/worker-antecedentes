import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';

const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;
// Usamos el Token que acabas de configurar en tu imagen
const API_TOKEN = process.env.BRIGHT_DATA_TOKEN || process.env.BRIGHT_DATA_KEY; 

const app = express();
app.get('/', (req, res) => res.status(200).send('Worker Judicial API Online 🟢'));
app.listen(PORT, '0.0.0.0');

const client = redis.createClient({ url: REDIS_URL });

async function consultar(cedula) {
    try {
        console.log(`🚀 Solicitando consulta vía API para: ${cedula}`);
        
        const response = await fetch('https://api.brightdata.com/request', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                zone: 'proyectoantecedentes', 
                url: 'https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml',
                format: 'raw',
                method: 'GET',
                country: 'co', // Crucial para que la Policía no bloquee
                render: true   // Navegador real para saltar protecciones
            })
        });

        const html = await response.text();
        
        if (!html || html.length < 500) {
            return "ERROR: La API devolvió contenido vacío o bloqueo de IP.";
        }

        const txt = html.toUpperCase();

        if (txt.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
        if (txt.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
        if (txt.includes("NO ES VÁLIDA")) return "CÉDULA INVÁLIDA ❌";

        return "PÁGINA CARGADA (Resultado no identificado en el texto)";
    } catch (e) {
        return `ERROR_SISTEMA: ${e.message}`;
    }
}

async function iniciar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📥 Worker API esperando tareas en Redis...");
        
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                const resultado = await consultar(cedula);
                console.log(`✅ [${cedula}]: ${resultado}`);
            }
        }
    } catch (err) {
        console.error("❌ Error Redis:", err.message);
        setTimeout(iniciar, 5000);
    }
}

iniciar();
