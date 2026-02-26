import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

// 1. Configuración
const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;
const BRIGHT_DATA_KEY = '3cf70efc-6366-481e-a02a-ac13eef2307b';
const BRIGHT_DATA_ZONE = 'proyectoantecedentes';

// 2. Servidor Express para Health Check
const app = express();
app.get('/', (req, res) => res.status(200).send('Worker Judicial Activo 🟢'));
app.listen(PORT, '0.0.0.0', () => console.log(`📡 Servidor en puerto ${PORT}`));

// 3. Cliente Redis
const client = redis.createClient({ url: REDIS_URL });

async function iniciarWorker() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📥 Conectado a Redis. Esperando tareas...");

        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            if (!tareaRaw) continue;

            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Procesando Cédula: ${cedula}`);

            const resultado = await consultarPolicia(cedula);
            console.log(`✅ Resultado Final para ${cedula}: ${resultado}`);
        }
    } catch (err) {
        console.error("❌ Error en el bucle principal:", err.message);
        setTimeout(iniciarWorker, 5000);
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
                country: 'co',
                format: 'json',
                render: true,
                actions: [
                    { "wait": "body" },
                    { "click": ".ui-chkbox-box", "required": false },
                    { "wait": 1000 },
                    { "type": "#formConsulta:cedula", "value": cedula },
                    { "click": "#formConsulta:btnConsultar" },
                    { "wait": ".ui-messages-info-detail, .ui-messages-error-detail", "timeout": 10000 }
                ]
            })
        });

        const data = await response.json();

        if (data.status !== 'ok' && !data.content) {
            return `ERROR_BRIGHT_DATA: ${JSON.stringify(data)}`;
        }

        const dom = new JSDOM(data.content);
        const textoPagina = dom.window.document.body.innerText.toUpperCase();

        if (textoPagina.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
        if (textoPagina.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
        if (textoPagina.includes("NO ES VÁLIDA")) return "CÉDULA NO VÁLIDA ❌";

        return "ERROR: No se pudo determinar el estado";

    } catch (e) {
        return `ERROR_SISTEMA: ${e.message}`;
    }
}

// Arrancar el proceso
iniciarWorker();
