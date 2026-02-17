import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom'
import Home from './pages/Home'
import BoardView from './pages/BoardView'
import ThreadView from './pages/ThreadView'
import { Toaster } from "@/components/ui/toaster"

// Placeholder Layout
const Layout = () => (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
        <header className="border-b p-4 mb-4">
            <nav className="container mx-auto flex gap-4">
                <a href="/" className="font-bold text-lg">Ebala Imageboard</a>
            </nav>
        </header>
        <main className="container mx-auto px-4 pb-12">
            <Outlet />
        </main>
        <Toaster />
    </div>
)

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<Home />} />
                    <Route path=":slug" element={<BoardView />} />
                    <Route path=":slug/thread/:id" element={<ThreadView />} />
                </Route>
            </Routes>
        </BrowserRouter>
    )
}

export default App
