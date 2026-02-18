import { Routes, Route } from "react-router-dom"
import Layout from "@/components/Layout.tsx"
import HomePage from "@/pages/HomePage.tsx"
import BoardPage from "@/pages/BoardPage.tsx"
import ThreadPage from "@/pages/ThreadPage.tsx"

function App() {
    return (
        <Routes>
            <Route element={<Layout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/:slug" element={<BoardPage />} />
                <Route path="/:slug/thread/:id" element={<ThreadPage />} />
            </Route>
        </Routes>
    )
}

export default App
