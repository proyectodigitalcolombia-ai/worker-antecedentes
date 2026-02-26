import express from 'express';
import redis from 'redis';

const app = express();
const PORT = process.env.PORT || 10000;
const REDIS_URL = process.env.REDIS_URL;

const client = redis.createClient({ url: REDIS_URL });

app.use(express.json());

// Endpoint para recibir la cédula
app.get('/consultar/:cedula', async (req, res) => {
    const { cedula } = req.params;
    try {
        if (!client.isOpen) await client.connect();
        
        // Guardamos en la cola para que el worker la procese
        await client.lPush('cola_consultas', JSON.stringify({ cedula }));
        
        res.status(200).json({ 
            mensaje: "Consulta en cola", 
            cedula,
            estado: "Pendiente ⏳" 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/', (req, res) => res.send('API Judicial Principal Activa 🚀'));

app.listen(PORT, () => {
    console.log(`API escuchando en puerto ${PORT}`);
    client.connect().then(() => console.log("Conectado a Redis ✅"));
});
