import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

// 1. Configuración (Usa tus variables de Render)
const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;
const BRIGHT_DATA_KEY = '3cf70efc-6366-481e-a02a-ac13eef2307b'; // Tu clave de la imagen
const BRIGHT_DATA_ZONE = 'proyectoantecedentes';

// 2. Servidor para Render (Health Check)
const app = express();
app.get('/', (req, res) => res.status(200).send('Worker Judicial Corriendo 🟢'));
app.listen(PORT, '0.0.0.0', () => console.log(`📡 Servidor en puerto ${PORT}`));

// 3. Cliente Redis
const client = redis.createClient({ url: REDIS_URL });

async function iniciarWorker() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📥 Esperando tareas en Redis...");

        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            if (!tareaRaw) continue;

            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Procesando Cédula: ${cedula}`);

            const resultado = await consultarPolicia(cedula);
            console.log(`✅ Resultado Final: ${resultado}`);
            
            // Aquí puedes añadir la función para guardar en MongoDB si ya la tienes lista
        }
    } catch (err) {
        console.error("❌ Error en el bucle:", err.message);
        setTimeout(iniciarWorker, 5000);
    }
}

async function consultarPolicia(cedula) {
    try {
        // Endpoint robusto para Web Unlocker
        const urlApi = 'https://api.brightdata.com/request';
        
        const response = await fetch(urlApi, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${BRIGHT_DATA_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                zone: BRIGHT_DATA_ZONE,
                url: 'https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml',
                country: 'co', // 🇨🇴 Imprescindible para la Policía
                format: 'json',
                render: true,  // Ejecuta Javascript
                actions: [
                    { "wait": "body" },
                    // Intentar click en el checkbox de aceptar (si aparece)
                    { "click": ".ui-chkbox-box", "required": false },
