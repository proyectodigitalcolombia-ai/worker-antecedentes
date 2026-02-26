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
        console.log(`🔎 Intentando acceso profundo para: ${cedula}`);
        
        const response = await fetch('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            agent,
            headers: {
                // Forzamos a Bright Data a usar un navegador real y resolver CAPTCHAs
                'X-BrightData-Render': 'true',
                'X-BrightData-Country': 'co',
                'X-BrightData-Wait': '3000', // Espera 3 segundos a que cargue el JS
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const html = await response.text();
        
        // Si sigue llegando vacío, es que la Zona necesita permisos de "Residencial"
        if (!html || html.length < 500) {
            return "ERROR: Bloqueo de seguridad (Requiere IP Residencial)";
        }

        const dom = new JSDOM(html);
        const texto = dom.window.document.body?.textContent?.toUpperCase() || "";

        if (texto.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
        if (texto.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
        
        return "PÁGINA CARGADA (Pero el formulario está vacío)";
    } catch (e) {
        return `ERROR_SISTEMA: ${e.message}`;
    }
}

async function iniciar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📥 Worker Camuflado listo...");
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
