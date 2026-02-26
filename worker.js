import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';

const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;
// Tu Token que sale en el código que enviaste
const API_TOKEN = '3cf70efc-6366-481e-a02a-ac13eef2307b'; 
const ZONE_NAME = 'proyectoantecedentes'; // El nombre de tu zona

const app = express();
app.get('/', (req, res) => res.status(200).send('Worker API Activo 🟢'));
app.listen(PORT, '0.0.0.0');

const client = redis.createClient({ url: REDIS_URL });

async function consultar(cedula) {
    try {
        console.log(`🚀 Solicitando a la API de Bright Data para: ${cedula}`);
        
        const response = await fetch('https://api.brightdata.com/request', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                zone: ZONE_NAME,
                url: 'https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml',
                format: 'raw',
                method: 'GET',
                dns: 'remote', // Importante: usar el DNS de Bright Data, no el local
                country: 'co', // Forzar Colombia
                render: true   // Activar navegador real
            })
        });

        const html = await response.text();
        
        if (html.toUpperCase().includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
        if (html.toUpperCase().includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
        
        return "RESPUESTA RECIBIDA (Pero no se hallaron antecedentes)";
    } catch (e) {
        return `ERROR_API: ${e.message}`;
    }
}

// ... resto de la lógica de Redis (iniciarWorker) igual que antes
