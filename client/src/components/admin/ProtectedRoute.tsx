import { Navigate, Outlet } from 'react-router-dom';
import { useGetHomeQuery } from '@/store/apiSlice.ts';
import { Loader2 } from 'lucide-react';

export function ProtectedRoute() {
    // We check the admin role status via the lightweight /home endpoint
    // or you could create a specific /api/admin/check endpoint.
    const { data, isLoading } = useGetHomeQuery();

    if (isLoading) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    // If role is < 1 (0 is User), redirect to login
    if (!data || data.admin_role < 1) {
        return <Navigate to="/admin/login" replace />;
    }

    return <Outlet />;
}
