import { useState, useRef, useEffect } from 'react';
import {
  ChakraProvider, Box, VStack, Heading, Text, Button, Badge,
  defaultSystem, Card, Icon
} from '@chakra-ui/react';
import { Device } from 'mediasoup-client';
import type { Transport } from 'mediasoup-client/types';
import io, { Socket } from 'socket.io-client';
import { FaHeadphones, FaBroadcastTower } from "react-icons/fa";

// Definimos la conexión fuera para no reconectar en cada render
const socket: Socket = io('http://localhost:3000');

// --- COMPONENTE DJ (PRODUCER) ---
const DJView = () => {
  const [status, setStatus] = useState<string>("Listo para transmitir");
  const deviceRef = useRef<Device | null>(null);
  const producerTransportRef = useRef<Transport | null>(null);

  const startBroadcasting = () => {
    setStatus("Inicializando...");

    socket.emit('join', async (routerRtpCapabilities: any) => {
      // 1. Cargar Device
      const device = new Device();
      await device.load({ routerRtpCapabilities });
      deviceRef.current = device;

      // 2. Crear Transporte
      socket.emit('createWebRtcTransport', async (params: any) => {
        if (params.error) return setStatus(params.error);

        const transport = device.createSendTransport(params);
        producerTransportRef.current = transport;

        // Listeners de Mediasoup
        transport.on('connect', ({ dtlsParameters }, cb) => {
          socket.emit('connectTransport', { dtlsParameters });
          cb();
        });

        transport.on('produce', async ({ kind, rtpParameters }, cb) => {
          socket.emit('produce', { kind, rtpParameters }, ({ id }: { id: string }) => cb({ id }));
        });

        // 3. Obtener Audio del Sistema (getDisplayMedia)
        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true, // Necesario para que aparezca el popup
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
          });

          const audioTrack = stream.getAudioTracks()[0];
          const videoTrack = stream.getVideoTracks()[0];

          if (!audioTrack) {
            videoTrack.stop();
            throw new Error("No marcaste la casilla de compartir audio");
          }

          // Importante: Matar el video para ahorrar ancho de banda
          videoTrack.stop();

          // 4. Producir
          await transport.produce({ track: audioTrack });
          setStatus("🟢 Transmitiendo Música");

          audioTrack.onended = () => {
            setStatus("Transmisión finalizada");
            transport.close();
          };

        } catch (e) {
          setStatus("Error: " + (e as Error).message);
        }
      });
    });
  };

  return (
    <VStack gap={6} align="stretch">
      <Box textAlign="center">
        <Icon fontSize="4xl" color="purple.400" mb={2}>
          <FaBroadcastTower />
        </Icon>
        <Text fontSize="lg" fontWeight="bold">Modo DJ</Text>
      </Box>

      <Badge size="lg" colorPalette={status.includes("🟢") ? "green" : "gray"} variant="solid" justifyContent="center">
        {status}
      </Badge>

      <Button onClick={startBroadcasting} colorPalette="purple" size="xl">
        Compartir Audio del Sistema
      </Button>

      <Card.Root size="sm" variant="subtle">
        <Card.Body>
          <Text fontSize="xs" color="gray.400">
            Nota: Al abrirse la ventana, selecciona una pestaña y marca <b>"Share system audio"</b>.
          </Text>
        </Card.Body>
      </Card.Root>
    </VStack>
  );
};

// --- COMPONENTE LISTENER (CONSUMER) ---
const ListenerView = () => {
  const [status, setStatus] = useState<string>("Esperando...");
  const [isPlaying, setIsPlaying] = useState(false);

  const deviceRef = useRef<Device | null>(null);
  const consumerTransportRef = useRef<Transport | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const connectAndListen = () => {
    setStatus("Conectando...");

    socket.emit('join', async (routerRtpCapabilities: any) => {
      const device = new Device();
      await device.load({ routerRtpCapabilities });
      deviceRef.current = device;

      socket.emit('createWebRtcTransport', async (params: any) => {
        if (params.error) return setStatus(params.error);

        const transport = device.createRecvTransport(params);
        consumerTransportRef.current = transport;

        transport.on('connect', ({ dtlsParameters }, cb) => {
          socket.emit('connectTransport', { dtlsParameters });
          cb();
        });

        // Consumir
        socket.emit('consume', { rtpCapabilities: device.rtpCapabilities }, async (response: any) => {
          if (response.error) {
            setStatus("❌ " + response.error);
            return;
          }

          const { id, producerId, kind, rtpParameters } = response;

          const consumer = await transport.consume({
            id, producerId, kind, rtpParameters,
          });

          const stream = new MediaStream();
          stream.addTrack(consumer.track);

          if (audioRef.current) {
            audioRef.current.srcObject = stream;

            // Resume explícito
            socket.emit('resume', async () => {
              await audioRef.current?.play().catch(e => console.error("Autoplay prevent", e));
              setStatus("🔊 Escuchando en vivo");
              setIsPlaying(true);
            });
          }
        });
      });
    });
  };

  useEffect(() => {
    socket.on('newProducer', () => setStatus("¡DJ conectado! Únete ahora."));
    return () => { socket.off('newProducer'); };
  }, []);

  return (
    <VStack gap={6} align="stretch">
      <Box textAlign="center">
        <Icon fontSize="4xl" color="teal.400" mb={2}>
          <FaHeadphones />
        </Icon>
        <Text fontSize="lg" fontWeight="bold">Modo Oyente</Text>
      </Box>

      <Badge size="lg" colorPalette={isPlaying ? "green" : "orange"} variant="solid" justifyContent="center">
        {status}
      </Badge>

      {!isPlaying && (
        <Button onClick={connectAndListen} colorPalette="teal" size="xl">
          Conectar y Escuchar
        </Button>
      )}

      {/* Audio oculto */}
      <audio ref={audioRef} style={{ display: 'none' }} />
    </VStack>
  );
};

// --- APP PRINCIPAL ---
export default function App() {
  const [role, setRole] = useState<'dj' | 'listener' | null>(null);

  return (
    <ChakraProvider value={defaultSystem}>
      <Box h="100vh" bg="gray.900" color="white" display="flex" justifyContent="center" alignItems="center" p={4}>
        <Card.Root maxW="md" w="full" bg="gray.800" borderColor="gray.700" boxShadow="2xl">
          <Card.Header>
            <Heading size="xl" textAlign="center" mb={2}>Radio TS ⚡</Heading>
            <Text fontSize="sm" color="gray.400" textAlign="center">
              Powered by Mediasoup & TypeScript
            </Text>
          </Card.Header>
          <Card.Body>

            {!role ? (
              <VStack gap={4}>
                <Button w="full" h="16" onClick={() => setRole('dj')} colorPalette="purple" variant="surface">
                  <VStack gap={0}>
                    <Text fontWeight="bold">Soy el DJ</Text>
                    <Text fontSize="xs" opacity={0.7}>Transmitir audio del PC</Text>
                  </VStack>
                </Button>
                <Button w="full" h="16" onClick={() => setRole('listener')} colorPalette="teal" variant="surface">
                  <VStack gap={0}>
                    <Text fontWeight="bold">Soy Oyente</Text>
                    <Text fontSize="xs" opacity={0.7}>Escuchar transmisión</Text>
                  </VStack>
                </Button>
              </VStack>
            ) : (
              <VStack gap={4}>
                <Button size="sm" variant="ghost" onClick={() => setRole(null)} alignSelf="start">
                  ← Cambiar Rol
                </Button>
                {role === 'dj' ? <DJView /> : <ListenerView />}
              </VStack>
            )}

          </Card.Body>
        </Card.Root>
      </Box>
    </ChakraProvider>
  );
}
// import { BrowserRouter, Routes, Route } from 'react-router-dom';
// import { lazy, Suspense } from 'react';
// import { LoadingPage } from './components/LoadingPage';
// import Layout from './components/Layout';

// const ListenerPage = lazy(() => import('./pages/ListenerPage'));
// const BroadcasterPage = lazy(() => import('./pages/BroadcasterPage'));

// const App = () => {
//   return (
//     <BrowserRouter>
//       <Suspense fallback={<LoadingPage />}>
//         <Routes>
//           <Route element={<Layout />}>
//             <Route path="/" element={<ListenerPage />} />
//             <Route path="/dj" element={<BroadcasterPage />} />
//           </Route>
//         </Routes>
//       </Suspense>
//     </BrowserRouter>
//   );
// };

// export default App;