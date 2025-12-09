import { Container, HStack, Icon, Separator, Text } from '@chakra-ui/react'
import { IoHeart } from 'react-icons/io5'

const Footer = () => {
    return (
        <Container bg="bg.subtle/30">
            <HStack justifyContent={"center"} fontSize={"xs"} color="gray.500" align="stretch" py={2}>
                <Text>With <Icon as={IoHeart} color="fg.muted" fontSize={14} /> by <strong>NG</strong> </Text>
                <Separator orientation="vertical" />
                <Text>{new Date().getFullYear()}</Text>
            </HStack>
        </Container>
    )
}

export default Footer