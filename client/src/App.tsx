import { useState, useRef, useEffect } from 'react';
import io, { Socket } from 'socket.io-client';

// Configuración de la URL del backend
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

// Inicializamos el socket fuera del componente para evitar reconexiones múltiples
const socket: Socket = io(BACKEND_URL);

const App = () => {
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('Inactivo');

  // Refs para mantener el estado mutable
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  // --- LÓGICA DEL EMISOR (BROADCASTER) ---
  const startBroadcast = async () => {
    try {
      // 1. Captura (Pide video para habilitar la opción de audio)
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true
      });

      // 2. Detener video inmediatamente para ahorrar ancho de banda
      stream.getVideoTracks().forEach(track => track.stop());

      // 3. Configurar Grabador
      const options = { mimeType: 'audio/webm; codecs=opus' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        alert('Tu navegador no soporta audio/webm; codecs=opus');
        return;
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          // Enviamos el blob al servidor
          socket.emit('radio-stream', event.data);
        }
      };

      // Si el usuario deja de compartir desde la barra del navegador
      stream.getAudioTracks()[0].onended = () => {
        stopBroadcast();
      };

      // 4. AJUSTE CRÍTICO: Chunks de 1 segundo (1000ms) para estabilidad
      mediaRecorder.start(1000);

      setIsBroadcasting(true);
      setStatus('Transmitiendo en vivo 🔴');

    } catch (err) {
      console.error("Error al iniciar transmisión:", err);
      setStatus('Cancelado o Error de permisos');
    }
  };

  const stopBroadcast = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // AJUSTE CRÍTICO: Avisar al server que borre el header viejo
    socket.emit('stream-ended');

    setIsBroadcasting(false);
    setStatus('Transmisión finalizada');
  };

  // --- LÓGICA DEL OYENTE (LISTENER) ---

  const processQueue = () => {
    // Condiciones de guardia para no romper el buffer
    if (
      !sourceBufferRef.current ||
      sourceBufferRef.current.updating || // Si ya está ocupado escribiendo, esperamos
      audioQueueRef.current.length === 0
    ) return;

    if (mediaSourceRef.current && mediaSourceRef.current.readyState !== 'open') return;

    const chunk = audioQueueRef.current.shift(); // Sacar el siguiente trozo

    if (chunk) {
      try {
        sourceBufferRef.current.appendBuffer(chunk);
      } catch (e) {
        console.error("Error agregando al buffer:", e);
      }
    }
  };

  const startListening = () => {
    setIsListening(true);
    setStatus('Sintonizando... 📻');

    // 1. Crear nueva instancia de MediaSource
    const mediaSource = new MediaSource();
    mediaSourceRef.current = mediaSource;

    // 2. Crear elemento de audio
    const audioEl = new Audio();
    audioEl.src = URL.createObjectURL(mediaSource);
    audioEl.controls = true; // Útil para depurar (volumen, etc)
    audioElRef.current = audioEl;

    // Intentar reproducir (el navegador puede bloquearlo si no hubo interacción previa)
    audioEl.play().then(() => {
      setStatus('Reproduciendo 🎧');
    }).catch(e => {
      console.warn("Autoplay bloqueado, el usuario debe interactuar", e);
      setStatus('Haz click en la página para escuchar');
    });

    mediaSource.addEventListener('sourceopen', () => {
      // 3. Crear SourceBuffer
      try {
        const sourceBuffer = mediaSource.addSourceBuffer('audio/webm; codecs=opus');
        sourceBuffer.mode = 'sequence';
        sourceBufferRef.current = sourceBuffer;

        sourceBuffer.addEventListener('updateend', () => {
          // Cuando termine de escribir un trozo, procesamos el siguiente
          processQueue();
        });

        sourceBuffer.addEventListener('error', (e) => {
          console.error("Error en SourceBuffer", e);
        });

      } catch (e) {
        console.error("Error creando SourceBuffer. MimeType no soportado?", e);
      }
    });

    // 4. Escuchar eventos del socket
    socket.on('radio-stream', async (data: Blob | ArrayBuffer) => {
      let arrayBuffer: ArrayBuffer;

      if (data instanceof ArrayBuffer) {
        arrayBuffer = data;
      } else {
        arrayBuffer = await (data as Blob).arrayBuffer();
      }

      audioQueueRef.current.push(arrayBuffer);
      processQueue();
    });
  };

  // Limpieza al cerrar componente
  useEffect(() => {
    return () => {
      socket.off('radio-stream');
    };
  }, []);

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ color: '#333' }}>📻 GYN RADIO</h1>
      <div style={{ padding: '10px', background: '#f5f5f5', borderRadius: '5px', marginBottom: '20px' }}>
        <strong>Estado:</strong> {status}
      </div>

      <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap' }}>

        {/* PANEL DJ */}
        {!isListening && (
          <div style={{ border: '2px solid #e74c3c', padding: '20px', borderRadius: '10px', flex: 1, minWidth: '200px' }}>
            <h2 style={{ color: '#e74c3c' }}>Modo DJ</h2>
            <p style={{ fontSize: '0.9rem', color: '#666' }}>Transmite el audio de tu PC</p>

            {!isBroadcasting ? (
              <button
                onClick={startBroadcast}
                style={{ padding: '12px 24px', fontSize: '16px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                🎙️ Iniciar Transmisión
              </button>
            ) : (
              <button
                onClick={stopBroadcast}
                style={{ padding: '12px 24px', fontSize: '16px', background: '#333', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
              >
                ⏹️ Detener
              </button>
            )}
          </div>
        )}

        {/* PANEL OYENTE */}
        {!isBroadcasting && (
          <div style={{ border: '2px solid #3498db', padding: '20px', borderRadius: '10px', flex: 1, minWidth: '200px' }}>
            <h2 style={{ color: '#3498db' }}>Modo Oyente</h2>
            <p style={{ fontSize: '0.9rem', color: '#666' }}>Escucha la transmisión en vivo</p>

            {!isListening ? (
              <button
                onClick={startListening}
                style={{ padding: '12px 24px', fontSize: '16px', background: '#3498db', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                🎧 Sintonizar
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: '#2ecc71', fontWeight: 'bold' }}>Conectado</span>
                <button onClick={() => window.location.reload()} style={{ padding: '5px 10px', cursor: 'pointer' }}>Apagar</button>
              </div>
            )}
          </div>
        )}

      </div>

      <p style={{ marginTop: '2rem', fontSize: '0.8rem', color: '#aaa' }}>Backend: {BACKEND_URL}</p>
    </div>
  );
};

export default App;