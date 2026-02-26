import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

// --- CONFIGURACIÓN (Variables de Entorno en Render) ---
const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;
// Tu clave API confirmada en el panel
const BRIGHT_DATA_KEY = '3cf70efc-6366-481e-a02a-ac13eef2307b';
const BRIGHT_DATA_ZONE = 'proyectoantecedentes';

// 1. Servidor Express (Requerido para el Health Check de Render)
const app = express();
app.get('/', (req, res) => res.status(200).send('Worker Judicial Activo 🟢'));
app.listen(PORT, '0.0.0.0', () => console.log(`📡 Servidor escuchando en puerto ${PORT}`));

// 2. Cliente Redis
const client = redis.createClient({ url: REDIS_URL });

async function iniciarWorker() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📥 Conectado a Redis. Esperando tareas...");

        while (true) {
            // Extraer la siguiente cédula de la lista 'cola_consultas'
            const tareaRaw = await client.brPop('cola_consultas', 0);
            if (!tareaRaw) continue;

            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Procesando Cédula: ${cedula}`);

            const resultado = await consultarPolicia(cedula);
            console.log(`✅ Resultado Final [${cedula}]: ${resultado}`);
        }
    } catch (err) {
        console.error("❌ Error en el flujo principal:", err.message);
        setTimeout(iniciarWorker, 5000); // Reintento automático
    }
}

async function consultarPolicia(cedula) {
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
                country: 'co', // 🇨🇴 Forzamos IP de Colombia
                format: 'json',
                render: true,  // Ejecuta el Javascript de la página
                actions: [
                    { "wait": "body" },
                    // Intentamos marcar el checkbox de aceptación si aparece
                    { "click": ".ui-chkbox-box", "required": false }, 
                    { "wait": 1000 },
                    // Escribimos la cédula en el campo de texto
                    { "type": "#formConsulta:cedula", "value": cedula },
                    // Click en el botón de consulta
                    { "click": "#formConsulta:btnConsultar" },
                    // Esperamos a que aparezca el mensaje de éxito o error
                    { "wait": ".ui-messages-info-detail, .ui-messages-error-detail", "timeout": 12000 }
                ]
            })
        });

        const data = await response
