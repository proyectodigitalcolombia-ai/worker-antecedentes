import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';
import pkg from 'https-proxy-agent';
const { HttpsProxyAgent } = pkg;

const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;

// 1. Construimos el usuario con el sufijo de país como vimos en el ejemplo de Java
// Usamos el usuario de tu imagen: brd-customer-hl_1120b036-zone-proyectoantecedentes
const USER = `${process.env.BRIGHT_DATA_USER}-country-co`;
const PASS = process.env.BRIGHT_DATA_PASS;

// 2. Usamos el puerto 33335 que aparece en tu captura image_cea258.png
const proxyUrl = `http://${USER}:${PASS}@brd.superproxy.io:33335`;
const agent = new HttpsProxyAgent(proxyUrl);

const app = express();
app.get('/', (req, res) => res.status(200).send('Worker Judicial Activo 🟢'));
app.listen(PORT, '0.0.0.0');

const client = redis.createClient({ url: REDIS_URL });

async function consultar(cedula) {
    try {
        console.log(`🔎 Consultando cédula ${cedula} vía Proxy Residencial (Puerto 33335)...`);
        
        const response = await fetch('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            agent,
            headers: {
                // Estos headers obligan a Bright Data a procesar el JS de la página
                'X-BrightData-Render': 'true',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
        });

        const html = await response.text();
        const txt = html.toUpperCase();

        if (txt.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
        if (txt.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
        if (html.length < 500) return "ERROR: Respuesta incompleta del servidor.";

        return "PÁGINA CARGADA (Revisar logs para ver contenido)";
    } catch (e) {
        return `ERROR_PROXY: ${e.message}`;
    }
}

async function iniciar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📥 Esperando tareas...");
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                const resultado = await consultar(cedula);
                console.log(`✅ [${cedula}]: ${resultado}`);
            }
        }
    } catch (err) {
        setTimeout(iniciar, 5000);
    }
}

iniciar();
