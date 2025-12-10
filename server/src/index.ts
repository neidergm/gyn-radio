import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import {
    createWorker
} from "mediasoup";
import type {
    Worker as MSWorker,
    Router,
    WebRtcTransport,
    Producer,
    Consumer,
    DtlsState,
    RouterRtpCodecCapability,
} from "mediasoup/types";

interface CustomSocket extends Socket {
    transports: WebRtcTransport[];
}

const app = express();
const httpServer = createServer(app);

const ALLOWED_ORIGINS = process.env.CLIENT_URL || "http://localhost:5173";
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: ALLOWED_ORIGINS, methods: ["GET", "POST"] }));

const io = new Server(httpServer, {
    cors: {
        origin: ALLOWED_ORIGINS,
        methods: ["GET", "POST"]
    }
});

// --- Configuración Mediasoup ---
let worker: MSWorker;
let router: Router;
let producer: Producer; // Guardaremos aquí al único locutor de la radio
let consumers: Consumer[] = []; // Lista de oyentes

const mediaCodecs: RouterRtpCodecCapability[] = [
    {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2
    }
];

async function startMediasoup() {
    worker = await createWorker();

    router = await worker.createRouter({ mediaCodecs });
    console.log('Mediasoup Worker y Router iniciados');
}

startMediasoup();

// --- Funciones Helper ---
async function createWebRtcTransport(callback: (data: unknown) => void) {
    try {
        const transport = await router.createWebRtcTransport({
            listenIps: [{ ip: '0.0.0.0', announcedIp: '127.0.0.1' }], // Cambiar announcedIp a tu IP pública en producción
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
        });

        // Eventos obligatorios del transporte
        transport.on('dtlsstatechange', (dtlsState: DtlsState) => {
            if (dtlsState === 'closed') transport.close();
        });

        transport.on('@close', () => {
            console.log('Transporte cerrado');
        });

        // Enviamos los datos necesarios al cliente para que cree su transporte local
        callback({
            params: {
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
            }
        });

        return transport;
    } catch (error: any) {
        console.error(error);
        callback({ error: error.message });
    }
}

// --- Socket.io Signaling ---
io.on('connection', (originalSocket) => {
    const socket = originalSocket as CustomSocket;
    console.log('Usuario conectado:', socket.id);

    // 1. Enviar RTP Capabilities al cliente (bajo demanda)
    socket.on('getRouterRtpCapabilities', (callback) => {
        callback(router.rtpCapabilities);
    });

    // 2. Verificar si ya hay un productor activo
    socket.on('getActiveProducer', (callback) => {
        if (producer) {
            callback({ producerId: producer.id });
        } else {
            callback({});
        }
    });

    // 3. Crear Transporte (tanto para enviar como para recibir)
    socket.on('createTransport', async (data, callback) => {
        const transport = await createWebRtcTransport(callback);
        // Guardamos referencia temporal en el socket
        if (!socket.transports) socket.transports = [];
        if (transport) {
            socket.transports.push(transport);
        }
    });

    // 4. Conectar Transporte (DTLS Handshake)
    socket.on('connectTransport', async ({ transportId, dtlsParameters }) => {
        const transport = socket.transports.find(t => t.id === transportId);
        if (transport) await transport.connect({ dtlsParameters });
    });

    // 5. PRODUCIR (Solo el Broadcaster llama esto)
    socket.on('produce', async ({ transportId, kind, rtpParameters }, callback) => {
        const transport = socket.transports.find(t => t.id === transportId);
        if (transport) {
            producer = await transport.produce({ kind, rtpParameters });

            producer.on('transportclose', () => {
                producer.close();
                socket.broadcast.emit('producerClosed');
            });

            console.log('Nuevo Productor de Audio activo');
            callback({ id: producer.id });

            // Avisar a todos los clientes que hay una nueva radio sonando
            socket.broadcast.emit('newProducer', { producerId: producer.id });
        }
    });

    // 6. CONSUMIR (Los oyentes llaman esto)
    socket.on('consume', async ({ transportId, rtpCapabilities }, callback) => {
        try {
            if (!router.canConsume({ producerId: producer.id, rtpCapabilities })) {
                return callback({ error: 'No se puede consumir' });
            }

            const transport = socket.transports.find(t => t.id === transportId);

            if (!transport) {
                return callback({ error: 'Transporte no encontrado' });
            }

            const consumer = await transport.consume({
                producerId: producer.id,
                rtpCapabilities,
                paused: true, // Iniciar pausado es buena práctica
            });

            consumers.push(consumer);

            callback({
                params: {
                    id: consumer.id,
                    producerId: producer.id,
                    kind: consumer.kind,
                    rtpParameters: consumer.rtpParameters,
                }
            });

            // Una vez configurado en cliente, reanudamos
            await consumer.resume();

        } catch (error: any) {
            console.error(error);
            callback({ error: error.message });
        }
    });
});

httpServer.listen(PORT, () => {
    console.log(`Servidor escuchando en puerto ${PORT}`);
});