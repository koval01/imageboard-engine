import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from '@/components/Layout'
import HomePage from '@/pages/HomePage'
import BoardPage from '@/pages/BoardPage'
import ThreadPage from '@/pages/ThreadPage'

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<HomePage />} />
                    <Route path="/:slug" element={<BoardPage />} />
                    <Route path="/:slug/thread/:id" element={<ThreadPage />} />
                </Route>
            </Routes>
        </BrowserRouter>
    )
}

export default App
