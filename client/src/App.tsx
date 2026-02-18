import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Provider } from "react-redux";
import { store } from "./store/store";
import { Toaster } from "@/components/ui/sonner";

// Public Pages
import Home from "@/pages/Home";
import BoardView from "@/pages/BoardPage";
import ThreadView from "@/pages/ThreadView";

// Admin Pages
import AdminLogin from "@/pages/Admin/AdminLogin";
import AdminDashboard from "@/pages/Admin/AdminDashboard";
import { ProtectedRoute } from "@/components/admin/ProtectedRoute";

export default function App() {
    return (
        <Provider store={store}>
            <BrowserRouter>
                <Routes>
                    {/* Public Routes */}
                    <Route path="/" element={<Home />} />
                    <Route path="/home" element={<Navigate to="/" replace />} />

                    <Route path="/:slug" element={<BoardView />} />
                    <Route path="/:slug/thread/:id" element={<ThreadView />} />

                    {/* Admin Routes */}
                    <Route path="/admin/login" element={<AdminLogin />} />

                    {/* Protected Admin Zone */}
                    <Route element={<ProtectedRoute />}>
                        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
                        <Route path="/admin/dashboard" element={<AdminDashboard />} />
                    </Route>

                    {/* Fallback for 404s inside React */}
                    <Route path="*" element={<div className="p-10 text-center">404 - Page Not Found</div>} />
                </Routes>
                <Toaster />
            </BrowserRouter>
        </Provider>
    );
}
