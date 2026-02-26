import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';
import pkg from 'https-proxy-agent';
const { HttpsProxyAgent } = pkg;
import { JSDOM } from 'jsdom';

const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;

// Configuración del Proxy usando tus variables de entorno
const agent = new HttpsProxyAgent(`http://${process.env.BRIGHT_DATA_USER}:${process.env.BRIGHT_DATA_PASS}@brd.superproxy.io:22225`);

const app = express();
app.get('/', (req, res) => res.status(200).send('Worker Judicial Activo 🟢'));
app.listen(PORT, '0.0.0.0');

const client = redis.createClient({ url: REDIS_URL });

async function consultar(cedula) {
    try {
        console.log(`🔎 Iniciando consulta para: ${cedula}`);
        
        const response = await fetch('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            agent,
            headers: {
                'X-BrightData-Render': 'true',
                'X-BrightData-Country': 'co'
            }
        });

        const html = await response.text();
        
        // Si no hay HTML, salimos sin intentar procesar
        if (!html) return "ERROR: La página respondió vacío.";

        const dom = new JSDOM(html);
        // Usamos ?. para que si algo es 'undefined', no explote el código
        const textoCompleto = dom.window.document.body?.textContent?.toUpperCase() || "";

        console.log("📡 Contenido recibido, analizando palabras clave...");

        if (textoCompleto.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
        if (textoCompleto.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
        if (textoCompleto.includes("NO ES VÁLIDA")) return "CÉDULA NO VÁLIDA ❌";
        
        // Si llegamos aquí, la página cargó pero quizás mostró un error o un captcha
        return "PÁGINA CARGADA PERO SIN RESULTADO (Posible bloqueo o Captcha)";

    } catch (e) {
        return `ERROR_SISTEMA: ${e.message}`;
    }
}

async function iniciar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📥 Worker conectado a Redis. Esperando tareas...");
        
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                const resultado = await consultar(cedula);
                console.log(`✅ Resultado para ${cedula}: ${resultado}`);
            }
        }
    } catch (err) {
        console.error("❌ Error en el bucle principal:", err.message);
        setTimeout(iniciar, 5000);
    }
}

iniciar();
