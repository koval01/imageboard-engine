import { Routes, Route } from "react-router-dom"
import { Layout } from "@/components/layout"
import HomePage from "@/pages/home"
import BoardPage from "@/pages/board"
import ThreadPage from "@/pages/thread"

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
