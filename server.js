import express from 'express';
import redis from 'redis';

const app = express();
const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;

const client = redis.createClient({ url: REDIS_URL });

app.use(express.json());

// Endpoint para consultar
app.get('/consultar/:cedula', async (req, res) => {
    const { cedula } = req.params;
    if (!cedula) return res.status(400).json({ error: "Cédula requerida" });

    try {
        if (!client.isOpen) await client.connect();
        
        // Enviar a la cola
        await client.lPush('cola_consultas', JSON.stringify({ 
            cedula, 
            timestamp: Date.now() 
        }));
        
        res.status(200).json({ 
            mensaje: "Consulta recibida y encolada", 
            cedula,
            estado: "Procesando... 🚀" 
        });
    } catch (error) {
        console.error("Error en API:", error);
        res.status(500).json({ error: "Error de conexión con Redis" });
    }
});

app.get('/', (req, res) => res.send('🚀 API Judicial Operativa'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor API corriendo en puerto ${PORT}`);
    client.connect().catch(err => console.error("❌ Error Redis:", err));
});
