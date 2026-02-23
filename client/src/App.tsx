import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Provider } from "react-redux";
import { store } from "./store/store";
import { Toaster } from "@/components/ui/sonner";

// Public Pages
import Home from "@/pages/Home";
import BoardView from "@/pages/BoardPage";
import ThreadView from "@/pages/ThreadView";

// Admin Page
import Admin from "@/pages/Admin";

export default function App() {
    return (
        <Provider store={store}>
            <BrowserRouter>
                <Routes>
                    {/* Home Route */}
                    <Route path="/" element={<Home />} />
                    <Route path="/home" element={<Navigate to="/" replace />} />

                    <Route path="/admin" element={<Admin />} />

                    {/* Dynamic Routes (Catch-all for boards) */}
                    <Route path="/:slug" element={<BoardView />} />
                    <Route path="/:slug/thread/:id" element={<ThreadView />} />

                    {/* 404 Fallback */}
                    <Route path="*" element={<div className="p-10 text-center">404 - Page Not Found</div>} />
                </Routes>
                <Toaster />
            </BrowserRouter>
        </Provider>
    );
}
