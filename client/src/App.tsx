import { Routes, Route } from "react-router-dom"
import HomePage from "@/pages/HomePage.tsx"
import BoardPage from "@/pages/BoardPage.tsx"
import ThreadPage from "@/pages/ThreadPage.tsx"

function App() {
    return (
        <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/:slug" element={<BoardPage />} />
            <Route path="/:slug/thread/:id" element={<ThreadPage />} />
        </Routes>
    )
}

export default App
