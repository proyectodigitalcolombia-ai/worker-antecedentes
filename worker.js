import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';
import pkg from 'https-proxy-agent';
const { HttpsProxyAgent } = pkg;
import { JSDOM } from 'jsdom';

const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;
const BD_USER = process.env.BRIGHT_DATA_USER;
const BD_PASS = process.env.BRIGHT_DATA_PASS;

const proxyUrl = `http://${BD_USER}:${BD_PASS}@brd.superproxy.io:22225`;
const agent = new HttpsProxyAgent(proxyUrl);

const app = express();
app.get('/', (req, res) => res.status(200).send('Worker Activo 🟢'));
app.listen(PORT, '0.0.0.0');

const client = redis.createClient({ url: REDIS_URL });

async function consultar(cedula) {
    try {
        console.log(`🔎 Consultando: ${cedula}`);
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
        return "RESPUESTA DESCONOCIDA ❓";
    } catch (e) {
        return `ERROR: ${e.message}`;
    }
}

async function iniciar() {
    try {
        await client.connect();
        console.log("📥 Conectado y esperando tareas...");
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                const resultado = await consultar(cedula);
                console.log(`✅ [${cedula}]: ${resultado}`);
            }
        }
    } catch (err) {
        console.error("❌ Error fatal:", err);
        setTimeout(iniciar, 5000);
    }
}

iniciar();
