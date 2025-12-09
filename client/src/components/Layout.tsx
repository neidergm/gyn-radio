import { Container, VStack } from "@chakra-ui/react"
import { Outlet } from "react-router-dom"
import Footer from "./Footer"
import Header from "./Header"

const Layout = () => {
    return (
        <VStack minH="100vh" bg="#1a103c">
            <Header />
            <Container flex={1}>
                <Outlet />
            </Container>
            <Footer />
        </VStack>
    )
}

export default Layout