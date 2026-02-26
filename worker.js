import express from 'express';
import redis from 'redis';
import fetch from 'node-fetch';
import pkg from 'https-proxy-agent';
const { HttpsProxyAgent } = pkg;

// Configuración de Servidor y Redis
const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;

// Configuración de Bright Data con tus variables de Render
// Añadimos el sufijo -country-co para garantizar que la IP sea colombiana
const USER = `${process.env.BRIGHT_DATA_USER}-country-co`;
const PASS = process.env.BRIGHT_DATA_PASS;

/**
 * IMPORTANTE: Usamos el puerto 22225. 
 * Este puerto activa el Web Unlocker, que usa navegadores reales 
 * para saltar el bloqueo de 0 caracteres que tenías antes.
 */
const proxyUrl = `http://${USER}:${PASS}@brd.superproxy.io:22225`;
const agent = new HttpsProxyAgent(proxyUrl);

const app = express();
app.get('/', (req, res) => res.status(200).send('Worker Judicial Premium Activo 🟢'));
app.listen(PORT, '0.0.0.0');

const client = redis.createClient({ url: REDIS_URL });

async function consultar(cedula) {
    try {
        console.log(`🚀 Iniciando consulta con Web Unlocker para cédula: ${cedula}`);
        
        const response = await fetch('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            agent,
            headers: {
                // Instrucciones para que Bright Data resuelva el sitio
                'X-BrightData-Render': 'true',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            },
            timeout: 60000 // El desbloqueo puede tardar, damos 1 minuto de espera
        });

        const html = await response.text();
        console.log(`📡 Respuesta recibida. Tamaño: ${html.length} caracteres.`);

        // Diagnóstico de error de Bright Data
        if (response.status === 407 || response.status === 403) {
            return "ERROR: Autenticación de Proxy fallida. Revisa el saldo o el usuario/pass.";
        }

        if (html.length < 2000) {
            console.log("⚠️ Contenido insuficiente. Verifica que la zona tenga 'Web Unlocker' activo.");
            return "ERROR: La página no cargó completamente (Posible bloqueo)";
        }

        const txt = html.toUpperCase();

        // Lógica de detección de resultados
        if (txt.includes("NO TIENE ASUNTOS PENDIENTES")) {
            return "SIN ANTECEDENTES ✅";
        } else if (txt.includes("TIENE ASUNTOS PENDIENTES")) {
            return "CON ANTECEDENTES ⚠️";
        } else if (txt.includes("NO ES VÁLIDA")) {
            return "CÉDULA NO VÁLIDA ❌";
        }

        return "PÁGINA CARGADA (Resultado no identificado en el texto)";
    } catch (e) {
        console.error(`❌ Error en fetch: ${e.message}`);
        return `ERROR_SISTEMA: ${e.message}`;
    }
}

async function iniciar() {
    try {
        if (!client.isOpen) {
            await client.connect();
            console.log("📥 Conectado a Redis. Esperando tareas...");
        }

        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                const resultado = await consultar(cedula);
                console.log(`✅ [${cedula}]: ${resultado}`);
            }
        }
    } catch (err) {
        console.error("❌ Error en el bucle principal:", err.message);
        // Espera 5 segundos antes de reintentar si algo falla
        setTimeout(iniciar, 5000);
    }
}

iniciar();
