import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
const PORT = process.env.PORT || 3000;
const app = express();
app.use(cors());
// Creamos el servidor HTTP a partir de Express
const httpServer = createServer(app);
// Configuramos Socket.io
const io = new Server(httpServer, {
    cors: {
        // IMPORTANTE: Aquí pones la URL de tu frontend (Vite corre en 5173 por defecto)
        origin: "http://localhost:5173",
        methods: ["GET", "POST"]
    }
});
io.on('connection', (socket) => {
    console.log('Un usuario se conectó:', socket.id);
    // Evento cuando el Emisor (Tu PC) envía audio
    socket.on('radio-stream', (audioChunk) => {
        // Reenviar a todos los demás (Broadcast)
        socket.broadcast.emit('radio-stream', audioChunk);
    });
    socket.on('disconnect', () => {
        console.log('Usuario desconectado:', socket.id);
    });
});
httpServer.listen(PORT, () => {
    console.log(`📻 Servidor de Radio corriendo en http://localhost:${PORT}`);
});
//# sourceMappingURL=index.js.map