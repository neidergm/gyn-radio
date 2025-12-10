import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import mediasoup from 'mediasoup';
import type { RouterRtpCodecCapability, WebRtcTransport, Producer, Consumer, Router, Worker } from 'mediasoup/types';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const httpServer = createServer(app);

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = process.env.ALLOWED_CLIENT_URL || "*";
const LISTEN_IP = process.env.LISTEN_IP || "0.0.0.0";
const ANNOUNCED_IP = process.env.ANNOUNCED_IP || "127.0.0.1";

const io = new Server(httpServer, {
    cors: {
        origin: ALLOWED_ORIGINS,
        methods: ["GET", "POST"],
    }
});

// --- Configuración de Mediasoup ---
let worker: Worker;
let router: Router;
let producer: Producer | null = null; // Solo permitimos un DJ a la vez para este demo

const mediaCodecs: RouterRtpCodecCapability[] = [{
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2 // Stereo es importante para audio del sistema
}];

// Inicialización
async function runMediasoup() {
    worker = await mediasoup.createWorker({
        logLevel: 'warn',
    });

    router = await worker.createRouter({ mediaCodecs });
    console.log("🚀 Mediasoup Worker & Router iniciados");
}
runMediasoup();

// --- Lógica de Sockets ---
io.on('connection', (socket: Socket) => {
    console.log('Cliente conectado:', socket.id);

    let transport: WebRtcTransport;
    let consumer: Consumer;

    // 1. Enviar capacidades del Router
    socket.on('join', (callback) => {
        callback(router.rtpCapabilities);
    });

    // 2. Crear Transporte (Para DJ o Listener)
    socket.on('createWebRtcTransport', async (callback) => {
        try {
            transport = await router.createWebRtcTransport({
                listenIps: [{ ip: LISTEN_IP, announcedIp: ANNOUNCED_IP }],
                enableUdp: true,
                enableTcp: true,
            });

            callback({
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
            });
        } catch (error) {
            console.error(error);
            callback({ error: (error as Error).message });
        }
    });

    // 3. Conectar Transporte (DTLS)
    socket.on('connectTransport', async ({ dtlsParameters }) => {
        await transport.connect({ dtlsParameters });
    });

    // --- EVENTOS DEL DJ ---
    socket.on('produce', async ({ kind, rtpParameters }, callback) => {
        // Si ya hay un DJ, podrías rechazar o reemplazar. Aquí reemplazamos.
        if (producer) {
            producer.close();
        }

        producer = await transport.produce({ kind, rtpParameters });

        console.log(`🎵 Nuevo DJ transmitiendo ID: ${producer.id}`);

        // Avisar a todos que hay música
        socket.broadcast.emit('newProducer');

        producer.on('transportclose', () => {
            console.log('DJ desconectado');
            producer = null;
        });

        callback({ id: producer.id });
    });

    // --- EVENTOS DEL OYENTE ---
    socket.on('consume', async ({ rtpCapabilities }, callback) => {
        try {
            if (!router.canConsume({ producerId: producer?.id as string, rtpCapabilities })) {
                return callback({ error: "No se puede consumir" });
            }

            if (!producer) return callback({ error: "No hay DJ activo" });

            consumer = await transport.consume({
                producerId: producer.id,
                rtpCapabilities,
                paused: true, // Siempre iniciar pausado
            });

            callback({
                id: consumer.id,
                producerId: producer.id,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
            });

        } catch (error) {
            console.error("Error consumiendo", error);
        }
    });

    socket.on('resume', async (callback) => {
        if (consumer) await consumer.resume();
        callback();
    });
});

httpServer.listen(PORT, () => console.log(`Server listening on port ${PORT}`));