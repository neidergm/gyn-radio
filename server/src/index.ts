import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const httpServer = createServer(app);

const allowedOrigin = process.env.CLIENT_URL || "http://localhost:5173";

app.use(cors({ origin: allowedOrigin, methods: ["GET", "POST"] }));

const io = new Server(httpServer, {
    cors: {
        origin: allowedOrigin,
        methods: ["GET", "POST"]
    }
});

// --- LÓGICA DE STREAMING ---
let headerChunk: any = null; // AQUÍ guardaremos el inicio del stream

io.on('connection', (socket) => {
    console.log('Usuario conectado:', socket.id);

    // 1. Si hay un stream activo y entra un oyente nuevo,
    // LE ENVIAMOS EL HEADER PRIMERO para que pueda decodificar.
    if (headerChunk) {
        console.log('Enviando header a nuevo oyente');
        socket.emit('radio-stream', headerChunk);
    }

    socket.on('radio-stream', (audioChunk) => {
        // 2. Si es el primer chunk que recibimos del DJ, lo guardamos como Header
        if (!headerChunk) {
            console.log('Header recibido y guardado');
            headerChunk = audioChunk;
        }

        // 3. Reenviar a todos (menos al que lo envió)
        socket.broadcast.emit('radio-stream', audioChunk);
    });

    // Limpieza cuando el DJ se desconecta o deja de transmitir (Opcional, lógica simple)
    // En una app real, necesitarías un evento 'stop-stream' para limpiar headerChunk
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`📻 Server listo en puerto ${PORT}`);
});