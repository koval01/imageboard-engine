import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Provider } from "react-redux";
import { store } from "./store/store";
import { Toaster } from "@/components/ui/sonner";

import ThreadView from "@/pages/ThreadView";
import AdminLogin from "@/pages/Admin/AdminLogin";
import AdminDashboard from "@/pages/Admin/AdminDashboard";

import HomePage from "@/pages/HomePage.tsx"
import BoardPage from "@/pages/BoardPage.tsx"

function App() {
    return (
        <Provider store={store}>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/:slug" element={<BoardPage />} />
                    <Route path="/:slug/thread/:id" element={<ThreadView />} />
                    <Route path="/admin/login" element={<AdminLogin />} />
                    <Route path="/admin/dashboard" element={<AdminDashboard />} />
                </Routes>
                <Toaster />
            </BrowserRouter>
        </Provider>
    )
}

export default App
