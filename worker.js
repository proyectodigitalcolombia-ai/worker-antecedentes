import fetch from 'node-fetch'; // Asegúrate de tenerlo en tu package.json

const consultarConUnlocker = async (cedula) => {
  try {
    console.log(`🚀 Usando Bright Data para desbloquear portal de la Policía...`);
    
    const response = await fetch('https://api.brightdata.com/request', {
      method: 'POST',
      headers: {
          'Authorization': 'Bearer TU_API_KEY_AQUÍ', // Reemplaza con tu clave real
          'Content-Type': 'application/json'
      },
      body: JSON.stringify({
          zone: 'proyectoantecedentes', 
          url: 'https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml',
          country: 'co', // 🇨🇴 CRÍTICO: Forzamos IP de Colombia
          format: 'json'
      })
    });

    const data = await response.json();
    
    // Si Bright Data tiene éxito, 'data.content' tendrá el HTML del formulario de cédula
    if (data.status === 'ok' || response.ok) {
        console.log("✅ ¡Portal desbloqueado! Ya estamos frente al formulario de cédula.");
        
        // Aquí es donde procesas el resultado o usas Puppeteer 
        // para interactuar con el contenido que te devolvió la API.
        return data.content; 
    } else {
        console.log("❌ Bright Data no pudo desbloquearlo:", data.error || 'Error desconocido');
    }
  } catch (error) {
    console.error('❌ Error de conexión con Bright Data:', error.message);
  }
};
