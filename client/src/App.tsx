import { useState, useRef } from 'react';
import io, { Socket } from 'socket.io-client';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const socket: Socket = io(BACKEND_URL);

const App = () => {
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('Inactivo');

  // Refs para mantener el estado sin re-renderizar
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isAppendingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);

  // --- LÓGICA DEL EMISOR (BROADCASTER) ---
  const startBroadcast = async () => {
    try {
      // 1. Pedimos captura de pantalla con audio
      // NOTA: Chrome exige pedir 'video' para darte la opción de compartir audio de pestaña
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true
      });

      // 2. Importante: Detenemos el video inmediatamente para ahorrar ancho de banda
      // Solo nos interesa el audio track
      stream.getVideoTracks().forEach(track => track.stop());

      // 3. Configuramos el grabador
      // Usamos el codec Opus que es estándar y eficiente
      const options = { mimeType: 'audio/webm; codecs=opus' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.error('Este navegador no soporta audio/webm opus');
        return;
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      // 4. Cada vez que haya datos (cada 500ms), enviarlos al server
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          socket.emit('radio-stream', event.data);
        }
      };

      // 5. Iniciar grabación enviando trozos cada 100ms para menor latencia
      mediaRecorder.start(100);
      setIsBroadcasting(true);
      setStatus('Transmitiendo en vivo 🔴');

      // Manejar cuando el usuario deja de compartir desde el navegador
      stream.getAudioTracks()[0].onended = () => {
        stopBroadcast();
      };

    } catch (err) {
      console.error("Error al compartir:", err);
      setStatus('Error al acceder al audio');
    }
  };

  const stopBroadcast = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsBroadcasting(false);
    setStatus('Transmisión finalizada');
  };

  // --- LÓGICA DEL OYENTE (LISTENER) ---

  // Función auxiliar para procesar la cola de audio
  const processQueue = () => {
    if (!sourceBufferRef.current || isAppendingRef.current || audioQueueRef.current.length === 0) return;

    // Verificar que el MediaSource esté abierto
    if (mediaSourceRef.current && mediaSourceRef.current.readyState !== 'open') {
      return;
    }

    const chunk = audioQueueRef.current.shift(); // Sacar el primer elemento
    if (chunk) {
      try {
        isAppendingRef.current = true;
        sourceBufferRef.current.appendBuffer(chunk);
      } catch (e) {
        console.error("Error en buffer:", e);
      }
    }
  };

  const startListening = () => {
    setIsListening(true);
    setStatus('Conectando a la radio... 📻');

    // 1. Crear MediaSource
    // 1. Crear MediaSource
    const mediaSource = new MediaSource();
    mediaSourceRef.current = mediaSource;
    const audioUrl = URL.createObjectURL(mediaSource);

    // Crear elemento de audio invisible (o visible si quieres controles)
    const audioEl = new Audio(audioUrl);
    audioRef.current = audioEl; // Guardar referencia para evitar Garbage Collection
    audioEl.play().catch(() => console.log("Click para reproducir (política navegador)"));

    mediaSource.addEventListener('sourceopen', () => {
      // 2. Crear SourceBuffer cuando esté listo
      // Debe coincidir EXACTAMENTE con el mimeType del emisor
      const sourceBuffer = mediaSource.addSourceBuffer('audio/webm; codecs=opus');
      sourceBufferRef.current = sourceBuffer;
      sourceBuffer.mode = 'sequence'; // Importante para streaming

      // Cuando termine de añadir un trozo, intentar añadir el siguiente
      sourceBuffer.addEventListener('updateend', () => {
        isAppendingRef.current = false;
        processQueue();
      });

      setStatus('Escuchando 🎧');
    });

    // 3. Escuchar datos del socket
    socket.on('radio-stream', async (data: Blob | ArrayBuffer) => {
      console.log('Datos recibidos:', data);
      let arrayBuffer: ArrayBuffer;

      if (data instanceof ArrayBuffer) {
        arrayBuffer = data;
      } else if (data instanceof Blob) {
        arrayBuffer = await data.arrayBuffer();
      } else {
        console.error("Tipo de dato desconocido recibido:", data);
        return;
      }

      // Añadir a la cola
      audioQueueRef.current.push(arrayBuffer);

      // Intentar procesar cola
      processQueue();
    });
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', textAlign: 'center' }}>
      <h1>GYN RADIO</h1>
      <h3>Estado: {status}</h3>

      <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '20px' }}>

        {!isListening && (
          <div style={{ border: '1px solid #ccc', padding: '20px', borderRadius: '8px' }}>
            <h2>Soy el DJ (Emisor)</h2>
            {!isBroadcasting ? (
              <button onClick={startBroadcast} style={{ padding: '10px 20px', fontSize: '16px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                Iniciar Transmisión
              </button>
            ) : (
              <button onClick={stopBroadcast} style={{ padding: '10px 20px', fontSize: '16px', background: '#333', color: 'white' }}>
                Detener
              </button>
            )}
            <p style={{ fontSize: '12px', color: '#666' }}>Debes elegir la pestaña y marcar "Compartir audio"</p>
          </div>
        )}

        {!isBroadcasting && (
          <div style={{ border: '1px solid #ccc', padding: '20px', borderRadius: '8px' }}>
            <h2>Soy Oyente</h2>
            {!isListening ? (
              <button onClick={startListening} style={{ padding: '10px 20px', fontSize: '16px', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                Sintonizar Radio
              </button>
            ) : (
              <button disabled style={{ padding: '10px 20px', fontSize: '16px', background: '#2ecc71', color: 'white' }}>
                Reproduciendo...
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default App;