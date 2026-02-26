import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

// 1. Configuración desde Variables de Entorno de Render
const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;
const BRIGHT_DATA_KEY = process.env.BRIGHT_DATA_KEY; 
const BRIGHT_DATA_ZONE = 'proyectoantecedentes';

// 2. Servidor Express (Para que Render no marque error de Health Check)
const app = express();
app.get('/', (req, res) => res.status(200).send('Worker Judicial Activo 🟢'));
app.listen(PORT, '0.0.0.0', () => console.log(`📡 Health Check escuchando en puerto ${PORT}`));

// 3. Cliente Redis
const client = redis.createClient({ url: REDIS_URL });

async function iniciarWorker() {
    try {
        await client.connect();
        console.log("📥 Conectado a Redis. Esperando cédulas en 'cola_consultas'...");

        while (true) {
            // Sacar tarea de la lista (bloqueante)
            const tareaRaw = await client.brPop('cola_consultas', 0);
            const { cedula } = JSON.parse(tareaRaw.element);
            
            console.log(`🔎 Procesando Cédula: ${cedula}`);
            const resultado = await consultarPolicia(cedula);
            
            // Aquí puedes guardar el resultado en MongoDB o publicarlo en otra lista de Redis
            console.log(`✅ Resultado para ${cedula}: ${resultado}`);
        }
    } catch (error) {
        console.error("❌ Error Crítico en Worker:", error);
        setTimeout(iniciarWorker, 5000); // Reintentar en 5 segundos
    }
}

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
                country: 'co', // 🇨🇴 IP de Colombia obligatoria
                format: 'json',
                render: true,  // Bright Data abre el navegador por nosotros
                actions: [
                    { "wait": "body" },
                    { "click": ".ui-chkbox-box" }, // Acepta términos automáticamente
                    { "wait": 1000 },
                    { "type": "#formConsulta:cedula", "value": cedula },
                    { "click": "#formConsulta:btnConsultar" },
                    { "wait": 4000 } // Esperamos el resultado final
                ]
            })
        });

        const data = await response.json();

        if (data.status === 'ok' || data.content) {
            const dom = new JSDOM(data.content);
            const bodyText = dom.window.document.body.innerText;

            if (bodyText.includes("NO TIENE ASUNTOS PENDIENTES")) return "SIN ANTECEDENTES";
            if (bodyText.includes("TIENE ASUNTOS PENDIENTES")) return "CON ANTECEDENTES";
            if (bodyText.includes("no es válida")) return "CÉDULA NO VÁLIDA";
            
            return "ERROR: Formato de respuesta desconocido";
        }
        
        return `ERROR_BRIGHT_DATA: ${data.error || 'Sin respuesta'}`;
    } catch (e) {
        return `ERROR_CONEXION: ${e.message}`;
    }
}

iniciarWorker();
