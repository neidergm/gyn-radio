import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';
import type { Transport, Device } from 'mediasoup-client/types';
import { BACKEND_URL } from '@/config';

export const STATUS = {
    DISCONNECTED: 'Disconnected',
    CONNECTED: 'Connected',
    JOINING: 'Joining',
    JOINED: 'Joined',
    JOINING_BROADCASTER: 'Joining as DJ',
    JOINED_BROADCASTER: 'Joined as DJ',
    JOINING_LISTENER: 'Joining as listener',
    JOINED_LISTENER: 'Joined as listener',
    AVAILABLE_PRODUCER: 'Available producer'
}

export const useRadio = () => {
    const [status, setStatus] = useState(STATUS.DISCONNECTED);
    const [isConnected, setIsConnected] = useState(false);
    const [isBroadcaster, setIsBroadcaster] = useState(false);
    const [isProducerAvailable, setIsProducerAvailable] = useState(false);

    const socketRef = useRef<Socket | null>(null);
    const deviceRef = useRef<Device | null>(null);
    const producerTransportRef = useRef<Transport | null>(null);
    const consumerTransportRef = useRef<Transport | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        console.log("Initializing socket connection...");
        socketRef.current = io(BACKEND_URL);

        socketRef.current.on('connect', () => {
            console.log("Socket connected:", socketRef.current?.id);
            setStatus(STATUS.CONNECTED);
            setIsConnected(true);

            // Check if producer is available immediately
            // We use a check here, but since we removed isBroadcaster from deps, 
            // this closure might have stale state. That's acceptable for now.
            socketRef.current?.emit('getActiveProducer', ({ producerId }: any) => {
                console.log("Active producer check:", producerId);
                setIsProducerAvailable(!!producerId);
            });
        });

        socketRef.current.on('newProducer', ({ producerId }: any) => {
            console.log("New producer available:", producerId);
            setIsProducerAvailable(true);
        });

        socketRef.current.on('producerClosed', () => {
            console.log("Producer closed");
            setIsProducerAvailable(false);
            setStatus(STATUS.CONNECTED);
            if (status === STATUS.JOINED_LISTENER) {
                // Stop audio if playing
                if (audioRef.current) {
                    audioRef.current.srcObject = null;
                }
            }
        });

        socketRef.current.on('disconnect', () => {
            console.log("Socket disconnected");
            setIsConnected(false);
            setStatus(STATUS.DISCONNECTED);
        });

        return () => {
            console.log("Cleaning up socket connection...");
            socketRef.current?.disconnect();
        };
    }, []); // Removed isBroadcaster and status from dependencies to prevent reconnection loops

    const loadDevice = async (routerRtpCapabilities: any) => {
        try {
            deviceRef.current = new mediasoupClient.Device();
            await deviceRef.current.load({ routerRtpCapabilities });
        } catch (error) {
            console.error("Browser no soportado", error);
        }
    };

    const joinAsBroadcaster = async () => {
        console.log(socketRef.current);
        if (!socketRef.current) return;
        setIsBroadcaster(true);
        setStatus(STATUS.JOINING_BROADCASTER);

        socketRef.current.emit('getRouterRtpCapabilities', async (rtpCapabilities: any) => {
            await loadDevice(rtpCapabilities);

            socketRef.current?.emit('createTransport', {}, async ({ params }: any) => {
                if (params.error) return console.error(params.error);

                producerTransportRef.current = deviceRef.current!.createSendTransport(params);

                producerTransportRef.current.on('connect', ({ dtlsParameters }, callback) => {
                    socketRef.current?.emit('connectTransport', {
                        transportId: producerTransportRef.current?.id,
                        dtlsParameters
                    });
                    callback();
                });

                producerTransportRef.current.on('produce', ({ kind, rtpParameters }, callback) => {
                    socketRef.current?.emit('produce', {
                        transportId: producerTransportRef.current?.id,
                        kind,
                        rtpParameters
                    }, ({ id }: any) => {
                        callback({ id });
                    });
                });

                await startStreaming();
            });
        });
    };

    const startStreaming = async () => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            const audioTrack = stream.getAudioTracks()[0];

            if (!audioTrack) {
                alert("¡Debes compartir el audio del sistema/pestaña!");
                return;
            }

            const producer = await producerTransportRef.current?.produce({ track: audioTrack });
            console.log("Producer", producer);
            setStatus(STATUS.JOINED_BROADCASTER);

            stream.getVideoTracks()[0].stop();

        } catch (err) {
            console.error("Error capturando audio", err);
            setStatus(STATUS.CONNECTED);
        }
    };

    const joinAsListener = () => {
        if (!socketRef.current) return;

        setStatus(STATUS.JOINING_LISTENER);

        socketRef.current.emit('getRouterRtpCapabilities', async (rtpCapabilities: any) => {
            await loadDevice(rtpCapabilities);

            socketRef.current?.emit('getActiveProducer', async ({ producerId }: any) => {
                if (producerId) {
                    await consumeAudio(producerId);
                } else {
                    setStatus(STATUS.CONNECTED);
                    setIsProducerAvailable(false);
                }
            });
        });
    };

    const consumeAudio = async (producerId: string) => {
        if (!deviceRef.current || !socketRef.current) return;

        socketRef.current.emit('createTransport', {}, async ({ params }: any) => {

            consumerTransportRef.current = deviceRef.current!.createRecvTransport(params);

            consumerTransportRef.current.on('connect', ({ dtlsParameters }, callback) => {
                socketRef.current?.emit('connectTransport', {
                    transportId: consumerTransportRef.current?.id,
                    dtlsParameters
                });
                callback();
            });

            const { rtpCapabilities } = deviceRef.current!;

            socketRef.current?.emit('consume', {
                transportId: consumerTransportRef.current.id,
                rtpCapabilities
            }, async ({ params }: any) => {
                if (params.error) {
                    console.error('No se puede consumir', params.error);
                    return;
                }

                const consumer = await consumerTransportRef.current?.consume({
                    id: params.id,
                    producerId: producerId,
                    kind: params.kind,
                    rtpParameters: params.rtpParameters,
                });

                const stream = new MediaStream();
                stream.addTrack(consumer!.track);

                if (audioRef.current) {
                    audioRef.current.srcObject = stream;
                    try {
                        await audioRef.current.play();
                        setStatus(STATUS.JOINED_LISTENER);
                    } catch (e) {
                        console.error("Autoplay blocked", e);
                        // We might want to show a specific UI for this, but for now just keep status
                    }
                }
            });
        });
    };

    return {
        status,
        isConnected,
        isBroadcaster,
        isProducerAvailable,
        audioRef,
        joinAsBroadcaster,
        joinAsListener
    };
};
