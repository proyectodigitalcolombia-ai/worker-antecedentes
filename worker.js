import fetch from 'node-fetch';
import { JSDOM } from 'jsdom'; // Para leer el HTML que nos devuelve Bright Data

const API_KEY = 'TU_BRIGHT_DATA_API_KEY';
const ZONE = 'proyectoantecedentes';

async function consultarAntecedentes(cedula) {
    try {
        console.log(`🔎 Iniciando consulta para: ${cedula} vía Web Unlocker...`);

        // 1. SOLICITUD A BRIGHT DATA (Paso del formulario de cédula)
        const response = await fetch('https://api.brightdata.com/request', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                zone: ZONE,
                url: 'https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml',
                country: 'co', // 🇨🇴 IP Colombiana
                format: 'json',
                // Configuramos el llenado del formulario en la misma petición
                render: true, // Importante para que Bright Data procese el JS
                actions: [
                    { "wait": "#formConsulta:cedula" }, // Esperamos el campo de cédula
                    { "type": "#formConsulta:cedula", "value": cedula }, // Escribimos la cédula
                    { "click": "#formConsulta:btnConsultar" }, // Click en el botón final
                    { "wait": ".ui-messages-info-detail, .ui-messages-error-detail" } // Esperamos el resultado
                ]
            })
        });

        const data = await response.json();

        if (data.status === 'ok' || data.content) {
            // 2. PARSEAR EL HTML RESULTANTE
            const dom = new JSDOM(data.content);
            const doc = dom.window.document;

            // Buscamos el texto que indica si tiene o no antecedentes
            const resultadoTexto = doc.body.innerText;
            
            let estado = "No encontrado";
            if (resultadoTexto.includes("NO TIENE ASUNTOS PENDIENTES")) {
                estado = "SIN ANTECEDENTES ✅";
            } else if (resultadoTexto.includes("TIENE ASUNTOS PENDIENTES")) {
                estado = "CON ANTECEDENTES ⚠️";
            } else if (resultadoTexto.includes("no es válida")) {
                estado = "CÉDULA NO VÁLIDA ❌";
            }

            console.log(`📊 Resultado para ${cedula}: ${estado}`);
            return { cedula, estado, fecha: new Date() };

        } else {
            console.error("❌ Bright Data no pudo completar la acción.");
            return null;
        }

    } catch (error) {
        console.error("❌ Error en la extracción:", error.message);
        return null;
    }
}
