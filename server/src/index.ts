import express from 'express';
import { AccessToken } from 'livekit-server-sdk';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();


// Reemplaza esto con tus credenciales de LiveKit Cloud
const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = process.env.ALLOWED_CLIENT_URL;

const app = express();

app.use(cors({ origin: ALLOWED_ORIGINS, methods: ["GET", "POST"] }));
app.use(express.json());

console.log(API_KEY);
console.log(API_SECRET);

const createToken = async (participantName: string, roomName: string, isPublisher: boolean) => {
    const at = new AccessToken(API_KEY, API_SECRET, {
        identity: participantName,
        ttl: '10m',
    });

    at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: isPublisher,
        canSubscribe: true,
    });

    return await at.toJwt();
};

app.get('/getToken', async (req, res) => {
    // const { participantName, roomName, isPublisher } = req.query;

    // if (!participantName || !roomName) {
    //     res.status(400).json({ error: 'Missing participantName or roomName' });
    //     return;
    // }

    const participantName = "Usuario-" + Math.floor(Math.random() * 1000);
    const roomName = "sala-audio-demo";
    const isPublisher = true;

    try {
        const token = await createToken(
            participantName,
            roomName,
            isPublisher
        );
        res.json({ token });
    } catch (error) {
        console.error('Error generating token:', error);
        res.status(500).json({ error: 'Failed to generate token' });
    }
});


app.listen(PORT, () => {
    console.log(`Backend corriendo en http://localhost:${PORT}`);
});