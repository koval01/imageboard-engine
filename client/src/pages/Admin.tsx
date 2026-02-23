import React, { useState } from 'react';
import {
    useCheckAdminQuery,
    useAdminLoginMutation,
    useAdminLogoutMutation,
    useGetAdminStatsQuery,
    useGetAdminLogsQuery
} from '@/store/apiSlice';
import { format } from 'date-fns';
import { Shield, Activity, FileText, Lock, LogOut } from 'lucide-react';

export default function Admin() {
    const { data: auth, isLoading, refetch } = useCheckAdminQuery();

    if (isLoading) return <div className="p-10 text-center">Loading...</div>;

    // If not admin (role 0), show Login Form
    if (!auth || auth.role === 0) {
        return <AdminLogin onLogin={() => refetch()} />;
    }

    // If admin, show Dashboard
    return <AdminDashboard role={auth.role} onLogout={() => refetch()} />;
}

function AdminLogin({ onLogin }: { onLogin: () => void }) {
    const [key, setKey] = useState('');
    const [login, { isLoading, error }] = useAdminLoginMutation();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await login({ key }).unwrap();
            onLogin();
        } catch (err) {
            console.error("Login failed", err);
        }
    };

    return (
        <div className="flex h-screen w-full items-center justify-center bg-transparent">
            <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 shadow-sm">
                <div className="flex flex-col items-center gap-2 text-center">
                    <Shield className="h-10 w-10 text-primary" />
                    <h1 className="text-2xl font-bold">Admin Access</h1>
                    <p className="text-sm text-muted-foreground">Enter service key to continue</p>
                </div>
                <div className="space-y-2">
                    <input
                        type="password"
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        placeholder="Service Key..."
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                </div>
                {error && <p className="text-sm text-destructive text-center">Invalid key or too many attempts.</p>}
                <button
                    disabled={isLoading}
                    className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                    {isLoading ? 'Verifying...' : 'Login'}
                </button>
            </form>
        </div>
    );
}

function AdminDashboard({ role, onLogout }: { role: number, onLogout: () => void }) {
    const { data: stats } = useGetAdminStatsQuery();
    const { data: logs } = useGetAdminLogsQuery();
    const [logout] = useAdminLogoutMutation();

    const handleLogout = async () => {
        await logout();
        onLogout();
    };

    return (
        <div className="min-h-screen bg-background p-6 md:p-10">
            <header className="mb-8 flex items-center justify-between border-b pb-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                    <p className="text-muted-foreground">Welcome back, Role-{role} Administrator.</p>
                </div>
                <button
                    onClick={handleLogout}
                    className="inline-flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
                >
                    <LogOut className="h-4 w-4" />
                    Logout
                </button>
            </header>

            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
                <StatCard title="Total Posts" value={stats?.total_posts} icon={FileText} />
                <StatCard
                    title="Active Reports"
                    value={stats?.open_reports}
                    icon={Activity}
                    highlight={(stats?.open_reports ?? 0) > 0}
                />
                <StatCard title="Total Bans" value={stats?.total_bans} icon={Lock} />
                <StatCard title="Total Reports" value={stats?.total_reports} icon={Shield} />
            </div>

            {/* Logs Section */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold">Audit Logs</h2>
                <div className="rounded-md border bg-card">
                    <div className="relative w-full overflow-auto">
                        <table className="w-full caption-bottom text-sm">
                            <thead className="[&_tr]:border-b">
                            <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Time</th>
                                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Admin</th>
                                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Action</th>
                                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Target</th>
                                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Details</th>
                            </tr>
                            </thead>
                            <tbody className="[&_tr:last-child]:border-0">
                            {logs?.map((log) => (
                                <tr key={log.id} className="border-b transition-colors hover:bg-muted/50">
                                    <td className="p-4 align-middle">{format(new Date(log.created_at + "Z"), "MMM d, HH:mm")}</td>
                                    <td className="p-4 align-middle font-medium">{log.admin_username}</td>
                                    <td className="p-4 align-middle">
                                            <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
                                                {log.action}
                                            </span>
                                    </td>
                                    <td className="p-4 align-middle font-mono text-xs">{log.target_id || "-"}</td>
                                    <td className="p-4 align-middle text-muted-foreground">{log.details}</td>
                                </tr>
                            ))}
                            {!logs?.length && (
                                <tr>
                                    <td colSpan={5} className="p-4 text-center text-muted-foreground">No logs found.</td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StatCard({ title, value, icon: Icon, highlight }: any) {
    return (
        <div className={`rounded-lg border bg-card text-card-foreground shadow-sm ${highlight ? 'border-destructive/50 bg-destructive/10' : ''}`}>
            <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
                <h3 className="tracking-tight text-sm font-medium">{title}</h3>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="p-6 pt-0">
                <div className="text-2xl font-bold">{value ?? 0}</div>
            </div>
        </div>
    );
}
