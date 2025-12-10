import { useEffect, useState } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  ControlBar,
  BarVisualizer,
  useTracks,
} from '@livekit/components-react';
import '@livekit/components-styles'; // Importar estilos predeterminados
import { Track } from 'livekit-client';

// Tu URL de LiveKit Cloud (wss://...)
const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL;
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

function App() {
  const [token, setToken] = useState("");

  // 1. Al cargar la página, pedimos el Token al backend
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`${BACKEND_URL}/getToken`);
        const data = await resp.json();
        setToken(data.token);
      } catch (e) {
        console.error("Error obteniendo token:", e);
      }
    })();
  }, []);

  if (!token) {
    return <div>Cargando y conectando...</div>;
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <h1>Sala de Audio LiveKit 🎙️</h1>

      {/* 2. El componente principal que maneja la conexión */}
      <LiveKitRoom
        video={false} // Desactivamos video, solo queremos audio
        audio={false}  // Activamos micrófono al entrar
        token={token}
        serverUrl={LIVEKIT_URL}
        data-lk-theme="default"
        style={{ height: '50vh', border: '1px solid #ccc', borderRadius: '10px', padding: '20px' }}
      >
        {/* Componente invisible que reproduce el audio de los demás */}
        <RoomAudioRenderer />

        {/* Visualizador simple de quién está en la sala */}
        <Participantes />

        {/* Barra de controles (Mute, Salir, etc.) */}
        <ControlBar variation="verbose" controls={{ microphone: false, camera: false, screenShare: true }} />
        <BarVisualizer />
      </LiveKitRoom>
    </div>
  );
}

// Un componente pequeño para listar usuarios conectados
function Participantes() {
  // Hook para obtener tracks de audio activos
  const audioTracks = useTracks([Track.Source.Microphone]);

  return (
    <div style={{ margin: '20px 0' }}>
      <h3>Usuarios en línea: {audioTracks.length}</h3>
      <ul>
        {audioTracks.map((track) => (
          <li key={track.participant.identity}>
            {track.participant.identity}
            {track.participant.isSpeaking && ' 🔊 Hablando...'}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;