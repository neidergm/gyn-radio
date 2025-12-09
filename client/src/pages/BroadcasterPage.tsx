import { IoPlayCircle, IoRadio } from 'react-icons/io5';
import { STATUS, useRadio } from '../hooks/useRadio';
import { Box, Button, Heading, Text, VStack, Icon, Badge } from '@chakra-ui/react';

const BroadcasterPage = () => {
    const { status, joinAsBroadcaster } = useRadio();
    console.log(status);
    const isBroadcasting = status === STATUS.JOINED_BROADCASTER;

    return (
        <VStack
            minH="85vh"
            justify="center"
            gap={8}
            p={8}
            color="white"
        >
            <Box flex={1} display="flex" flexDirection="column" justifyContent="center" alignItems="center" textAlign="center">
                <Box position="relative" mb={8}>
                    <Icon as={IoPlayCircle} boxSize={16} color={isBroadcasting ? "red.400" : "whiteAlpha.800"} />
                    {isBroadcasting && (
                        <Box
                            position="absolute"
                            top="-2"
                            right="-2"
                            bg="red.500"
                            boxSize={4}
                            rounded="full"
                            animation="pulse 2s infinite"
                        />
                    )}
                </Box>

                <Heading size="xl" mb={2}>
                    {isBroadcasting ? 'On Air' : 'Broadcaster Studio'}
                </Heading>
                <Text color="whiteAlpha.600" maxW="md">
                    {isBroadcasting
                        ? 'You are currently broadcasting live to all listeners.'
                        : 'Click the button below to go live.'}
                </Text>

                {isBroadcasting && (
                    <Badge colorScheme="red" variant="solid" fontSize="md" px={4} py={1} rounded="full" mt={4}>
                        LIVE
                    </Badge>
                )}
            </Box>

            <Box w="full" pt={4}>
                {!isBroadcasting ? (
                    <Button
                        w="full"
                        colorPalette={"blue"}
                        size="lg"
                        rounded="full"
                        onClick={joinAsBroadcaster}
                        h={14}
                        fontSize="lg"
                    >
                        <Icon as={IoRadio} mr={2} />
                        Go Live
                    </Button>
                ) : (
                    <Button
                        w="full"
                        variant="outline"
                        colorScheme="red"
                        size="lg"
                        rounded="full"
                        h={14}
                        fontSize="lg"
                        disabled
                    >
                        Broadcasting in progress...
                    </Button>
                )}
            </Box>
        </VStack>
    );
};

export default BroadcasterPage;
