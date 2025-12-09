import { Spinner, VStack } from "@chakra-ui/react"

export const LoadingPage = () => {
    return (
        <VStack minH="100vh" justifyContent="center">
            <Spinner size={"xl"} />
        </VStack>
    )
}
