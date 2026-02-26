import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';
import pkg from 'https-proxy-agent';
const { HttpsProxyAgent } = pkg;

const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;

// Construcción dinámica basada en tus capturas
// Añadimos -country-co para garantizar salida por Colombia
const USER = `${process.env.BRIGHT_DATA_USER}-country-co`;
const PASS = process.env.BRIGHT_DATA_PASS;
const proxyUrl = `http://${USER}:${PASS}@brd.superproxy.io:33335`;
const agent = new HttpsProxyAgent(proxyUrl);

const app = express();
app.get('/', (req, res) => res.status(200).send('Worker Judicial Activo 🟢'));
app.listen(PORT, '0.0.0.0');

const client = redis.createClient({ url: REDIS_URL });

async function consultar(cedula) {
    try {
        console.log(`🔎 Consultando cédula ${cedula} (Proxy Residencial CO)...`);
        
        const response = await fetch('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            agent,
            headers: {
                'X-BrightData-Render': 'true', // Activa navegador real en Bright Data
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            },
            timeout: 45000 // Damos tiempo suficiente para el renderizado
        });

        const html = await response.text();
        const txt = html.toUpperCase();

        // Búsqueda directa en el HTML (Evita el consumo de RAM de JSDOM)
        if (txt.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
        if (txt.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
        
        if (html.length < 500) {
            return "ERROR: La policía bloqueó la conexión (IP no autorizada en Bright Data)";
        }

        return "PÁGINA CARGADA (Resultado no detectado)";
    } catch (e) {
        return `ERROR_SISTEMA: ${e.message}`;
    }
}

async function iniciar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📥 Worker conectado. Esperando tareas de Redis...");
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
