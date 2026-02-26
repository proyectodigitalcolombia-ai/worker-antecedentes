import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';
import pkg from 'https-proxy-agent';
const { HttpsProxyAgent } = pkg;

const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;

// Credenciales de Render
const agent = new HttpsProxyAgent(`http://${process.env.BRIGHT_DATA_USER}:${process.env.BRIGHT_DATA_PASS}@brd.superproxy.io:22225`);

const app = express();
app.get('/', (req, res) => res.status(200).send('Worker Activo 🟢'));
app.listen(PORT, '0.0.0.0');

const client = redis.createClient({ url: REDIS_URL });

async function probarTunel() {
    try {
        console.log("🛠️ Verificando túnel con Bright Data...");
        const response = await fetch('https://geo.brdtest.com/welcome.txt?product=resi&method=native', { agent });
        const texto = await response.text();
        console.log(`📡 Respuesta de Bright Data: ${texto.trim()}`);
        return true;
    } catch (e) {
        console.error(`❌ Error de conexión al túnel: ${e.message}`);
        return false;
    }
}

async function consultarPolicia(cedula) {
    try {
        const response = await fetch('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            agent,
            headers: { 'X-BrightData-Render': 'true', 'X-BrightData-Country': 'co' }
        });
        const html = await response.text();
        
        // Buscamos palabras clave en el HTML
        if (html.toUpperCase().includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES ✅";
        if (html.toUpperCase().includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES ⚠️";
        
        return "PÁGINA CARGADA (Sin resultado legible aún)";
    } catch (e) {
        return `ERROR: ${e.message}`;
    }
}

async function iniciarWorker() {
    try {
        if (!client.isOpen) await client.connect();
        
        // Primero probamos si el túnel funciona
        const tunelOk = await probarTunel();
        if (!tunelOk) console.log("⚠️ El túnel no respondió, revisa credenciales.");

        console.log("📥 Esperando tareas en Redis...");
        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Consultando: ${cedula}`);
            const res = await consultarPolicia(cedula);
            console.log(`✅ Resultado: ${res}`);
        }
    } catch (err) {
        setTimeout(iniciarWorker, 5000);
    }
}

iniciarWorker();
