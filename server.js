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
        
        // Guardamos en la cola para el worker
        await client.lPush('cola_consultas', JSON.stringify({ cedula }));
        
        res.status(200).json({ 
            mensaje: "Consulta recibida", 
            cedula,
            estado: "En cola ⏳" 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/', (req, res) => res.send('Servidor API Judicial Activo 🚀'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`API escuchando en puerto ${PORT}`);
    client.connect().catch(console.error);
});
