import { IoRadio, IoMusicalNotes } from 'react-icons/io5';
import { STATUS, useRadio } from '../hooks/useRadio';
import { Box, Button, Heading, Text, VStack, Icon } from '@chakra-ui/react';

const ListenerPage = () => {
    const {
        status,
        joinAsListener,
        stopListening,
        audioRef,
        isProducerAvailable
    } = useRadio();
    console.log(status)
    const isListening = status === STATUS.JOINED_LISTENER;

    return (
        <VStack
            minH="85vh"
            justify="center"
            gap={8}
            p={8}
            color="white"
        >
            {/* Audio element is always present but controlled */}

            <Box flex={1} display="flex" flexDirection="column" justifyContent="center" alignItems="center" textAlign="center">
                <Icon as={isListening ? IoMusicalNotes : IoRadio} boxSize={16} color="whiteAlpha.800" mb={8} />

                <Heading size="xl" mb={2}>
                    {isListening ? 'Connected & Listening' :
                        isProducerAvailable ? 'Ready to Listen?' :
                            'No Active Transmission'}
                </Heading>
                <Text color="whiteAlpha.600">
                    {isListening ? 'Enjoy the music!' :
                        isProducerAvailable ? 'Tap below to start the music.' :
                            'Waiting for the DJ to start...'}
                </Text>
            </Box>

            <Box w="full" pt={4}>
                {isListening ?
                    (
                        <>
                            <audio
                                ref={audioRef}
                                style={{ display: 'none' }}
                            />
                            <Button
                                w="full"
                                size="lg"
                                rounded="full"
                                onClick={stopListening}
                                h={14}
                                fontSize="lg"
                                colorScheme="red"
                            >
                                Stop Listening
                            </Button>
                        </>
                    ) : (
                        <Button
                            w="full"
                            size="lg"
                            rounded="full"
                            onClick={joinAsListener}
                            h={14}
                            fontSize="lg"
                            disabled={!isProducerAvailable}
                            opacity={!isProducerAvailable ? 0.5 : 1}
                        >
                            {isProducerAvailable ? 'Start Listening' : 'Waiting for Signal...'}
                        </Button>
                    )}
            </Box>
        </VStack>
    );
};

export default ListenerPage;
