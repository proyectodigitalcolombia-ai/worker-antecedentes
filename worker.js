import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';
import pkg from 'https-proxy-agent';
const { HttpsProxyAgent } = pkg;
import { JSDOM } from 'jsdom';

const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;
const agent = new HttpsProxyAgent(`http://${process.env.BRIGHT_DATA_USER}:${process.env.BRIGHT_DATA_PASS}@brd.superproxy.io:22225`);

const app = express();
app.get('/', (req, res) => res.status(200).send('Worker Activo 🟢'));
app.listen(PORT, '0.0.0.0');

const client = redis.createClient({ url: REDIS_URL });

async function consultar(cedula) {
    try {
        console.log(`🔎 Consultando cédula: ${cedula}`);
        const response = await fetch('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            agent,
            timeout: 15000,
            headers: {
                'X-BrightData-Render': 'true',
                'X-BrightData-Country': 'co'
            }
        });

        const html = await response.text();
        
        if (!html || html.length < 100) {
            return "ERROR: Respuesta vacía de la Policía (Posible bloqueo de IP)";
        }

        const dom = new JSDOM(html);
        const body = dom.window.document.body;
        
        if (!body) return "ERROR: No se pudo leer el cuerpo de la página";

        const txt = body.innerText ? body.innerText.toUpperCase() : "";

        if (txt.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
        if (txt.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
        if (txt.includes("ROBOT") || txt.includes("CAPTCHA")) return "BLOQUEADO POR CAPTCHA 🤖";
        
        return "PÁGINA CARGADA PERO RESULTADO NO ENCONTRADO";
    } catch (e) {
        return `ERROR_CONEXION: ${e.message}`;
    }
}

async function iniciar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📥 Worker listo. Esperando tareas...");
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
