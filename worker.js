import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;
const BRIGHT_DATA_KEY = '3cf70efc-6366-481e-a02a-ac13eef2307b';
const BRIGHT_DATA_ZONE = 'proyectoantecedentes';

const app = express();
app.get('/', (req, res) => res.status(200).send('Worker Judicial Activo 🟢'));
app.listen(PORT, '0.0.0.0');

const client = redis.createClient({ url: REDIS_URL });

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
                // QUITAMOS "actions" porque tu zona no los permite.
                // Usamos "screenshot" para forzar que el navegador cargue todo antes de responder.
                screenshot: true 
            })
        });

        const data = await response.json();
        if (data.status !== 'ok') return `ERROR_BD: ${data.error}`;

        // Como no podemos hacer click, la página cargará el formulario vacío.
        // Pero esto nos servirá para confirmar que Bright Data YA ENTRA a la página.
        const dom = new JSDOM(data.content);
        const txt = dom.window.document.body.innerText.toUpperCase();
        
        if (txt.includes("CEDULA")) return "PÁGINA CARGADA OK - LISTO PARA EL PASO FINAL";
        return "ERROR_CONTENIDO: No se reconoce la página de la policía";

    } catch (e) { return `ERROR_SISTEMA: ${e.message}`; }
}

async function iniciarWorker() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("📥 Conectado. Esperando tareas...");
        while (true) {
            const tareaRaw = await client.brPop('cola_consultas', 0);
            const { cedula } = JSON.parse(tareaRaw.element);
            console.log(`🔎 Probando acceso para: ${cedula}`);
            const res = await consultarPolicia(cedula);
            console.log(`✅ Resultado: ${res}`);
        }
    } catch (err) {
        setTimeout(iniciarWorker, 5000);
    }
}

iniciarWorker();
