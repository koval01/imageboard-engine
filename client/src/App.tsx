import { Routes, Route } from 'react-router-dom';
import Home from '@/pages/Home';
import Board from '@/pages/Board';
import Thread from '@/pages/Thread';
import AdminPanel from '@/pages/admin/AdminPanel';
import Layout from '@/components/Layout';

function App() {
    return (
        <Routes>
            <Route path="/" element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="/:slug" element={<Board />} />
                <Route path="/:slug/thread/:id" element={<Thread />} />
                <Route path="/admin/panel" element={<AdminPanel />} />
            </Route>
        </Routes>
    );
}

export default App;
