async function consultar(cedula) {
    try {
        console.log(`🚀 Probando API con Token: ${API_KEY.substring(0, 5)}...`);
        
        const response = await fetch('https://api.brightdata.com/request', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                zone: 'web_unlocker1', // VERIFICA QUE ESTE NOMBRE SEA IGUAL AL DEL PANEL
                url: 'https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml',
                format: 'raw',
                country: 'co',
                render: true 
            })
        });

        const resText = await response.text();
        console.log(`📡 Status API: ${response.status}`);
        
        // Si sigue saliendo 401, este log nos dirá si es el token o la zona
        if (response.status !== 200) {
            console.log(`❌ ERROR DETALLADO DE BRIGHT DATA: ${resText}`);
            return `ERROR ${response.status}: ${resText}`;
        }

        return resText.toUpperCase().includes("NO TIENE ASUNTOS PENDIENTES") ? "LIMPIO ✅" : "REVISAR ⚠️";
    } catch (e) {
        return `ERROR_TECNICO: ${e.message}`;
    }
}
