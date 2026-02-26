import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';
import pkg from 'https-proxy-agent'; // Importación compatible
const { HttpsProxyAgent } = pkg;
import { JSDOM } from 'jsdom';

const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;

// Credenciales desde variables de entorno
const BRIGHT_DATA_USER = process.env.BRIGHT_DATA_USER;
const BRIGHT_DATA_PASS = process.env.BRIGHT_DATA_PASS;

const proxyUrl = `http://${BRIGHT_DATA_USER}:${BRIGHT_DATA_PASS}@brd.superproxy.io:22225`;
const agent = new HttpsProxyAgent(proxyUrl);

const app = express();
app.get('/', (req, res) => res.status(200).send('Worker Judicial Activo 🟢'));
app.listen(PORT, '0.0.0.0');

const client = redis.createClient({ url: REDIS_URL });

async function consultarPolicia(cedula) {
    try {
        console.log(`🌐 Conectando a través de Bright Data para: ${cedula}`);
        
        const response = await fetch('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            agent,
            headers: {
                'X-BrightData-Render': 'true',
                'X-BrightData-Country': 'co'
            }
        });

        const html = await response.text();
        const dom = new JSDOM(html);
        const txt = dom.window.document.body.innerText.toUpperCase();

        if (txt.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
        if (txt.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
        if (txt.includes("NO ES VÁLIDA")) return "CÉDULA INVÁLIDA ❌";

        return "PÁGINA CARGADA OK (Esperando interacción)";
    } catch (e) {
        return `ERROR_PROXY: ${e.message}`;
    }
}

async function iniciarWorker() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📥 Worker iniciado correctamente. Esperando tareas...");
        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            if (!tareaRaw) continue;
            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Consultando cédula: ${cedula}`);
            const res = await consultarPolicia(cedula);
            console.log(`✅ Resultado: ${res}`);
        }
    } catch (err) {
        console.error("❌ Error:", err.message);
        setTimeout(iniciarWorker, 5000);
    }
}

iniciarWorker();
