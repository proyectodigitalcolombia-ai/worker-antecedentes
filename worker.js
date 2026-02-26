import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';
import pkg from 'https-proxy-agent';
const { HttpsProxyAgent } = pkg;

const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;

// Configuración según tus capturas (Puerto 33335 para Residencial)
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
        console.log(`🔎 Consultando cédula ${cedula}...`);
        
        const response = await fetch('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            agent,
            headers: {
                // Forzamos el desbloqueo total y renderizado de navegador
                'X-BrightData-Render': 'true',
                'X-BrightData-Super-Proxy-Session': `sess_${Math.floor(Math.random() * 100000)}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            },
            timeout: 30000 // Aumentamos a 30 seg para evitar el SIGTERM por lentitud
        });

        const html = await response.text();
        
        // ANALISIS DIRECTO (Más rápido que JSDOM para ahorrar RAM)
        const txt = html.toUpperCase();

        if (txt.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
        if (txt.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
        if (txt.includes("CAPTCHA") || txt.includes("ROBOT")) return "BLOQUEO POR CAPTCHA 🤖";
        
        if (html.length < 1000) {
            console.log("⚠️ HTML recibido muy corto, posible bloqueo.");
            return "ERROR: Bloqueo de seguridad (Página vacía)";
        }

        return "PÁGINA CARGADA PERO RESULTADO NO ENCONTRADO";
    } catch (e) {
        return `ERROR: ${e.message}`;
    }
}

async function iniciar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📥 Worker listo y esperando...");
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
