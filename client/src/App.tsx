import { Routes, Route } from 'react-router-dom'
import Layout from '@/components/Layout'
import HomeView from '@/features/home/HomeView'
import BoardView from '@/features/board/BoardView'
import ThreadView from '@/features/thread/ThreadView'

function App() {
    return (
        <Routes>
            <Route path="/" element={<Layout />}>
                <Route index element={<HomeView />} />
                <Route path=":slug" element={<BoardView />} />
                <Route path=":slug/thread/:id" element={<ThreadView />} />
            </Route>
        </Routes>
    )
}

export default App
