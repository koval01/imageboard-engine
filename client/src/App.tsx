import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Provider } from "react-redux";
import { store } from "./store/store";
import { Toaster } from "@/components/ui/sonner";

// Public Pages
import Home from "@/pages/Home";
import BoardView from "@/pages/BoardPage";
import ThreadView from "@/pages/ThreadView";

// Admin Page (Acts as the Gatekeeper for Login vs Dashboard)
import Admin from "@/pages/Admin";

export default function App() {
    return (
        <Provider store={store}>
            <BrowserRouter>
                <Routes>
                    {/* Public Routes */}
                    <Route path="/" element={<Home />} />
                    <Route path="/home" element={<Navigate to="/" replace />} />

                    {/*
                        Admin Route
                        1. Must be placed BEFORE /:slug to prevent "admin" being treated as a board name.
                        2. The <Admin /> component handles auth checking internally.
                    */}
                    <Route path="/admin" element={<Admin />} />

                    {/* Dynamic Routes */}
                    <Route path="/:slug" element={<BoardView />} />
                    <Route path="/:slug/thread/:id" element={<ThreadView />} />

                    {/* Fallback for 404s inside React */}
                    <Route path="*" element={<div className="p-10 text-center">404 - Page Not Found</div>} />
                </Routes>
                <Toaster />
            </BrowserRouter>
        </Provider>
    );
}
