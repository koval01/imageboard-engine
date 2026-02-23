import { useCheckAdminQuery, useAdminLoginMutation } from '@/store/apiSlice'
import AdminPanel from '@/components/AdminPanel'
import { useState } from 'react'
import { toast } from 'sonner'

export default function AdminPage() {
    const { data: adminStatus, isLoading } = useCheckAdminQuery()
    const [login, { isLoading: isLoggingIn }] = useAdminLoginMutation()
    const [key, setKey] = useState('')

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            const res = await login({ key }).unwrap()
            if (res.status === 'ok') {
                toast.success('Logged in successfully')
                // No reload needed due to RTK Query tags
            }
        } catch (err) {
            toast.error('Invalid service key')
        }
    }

    if (isLoading) return (
        <div className="flex items-center justify-center min-h-screen text-muted-foreground">
            Loading admin status...
        </div>
    )

    if (!adminStatus || adminStatus.role < 1) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background">
                <div className="bg-card p-8 rounded-lg shadow-lg border w-full max-w-sm">
                    <h1 className="text-2xl font-bold mb-6 text-center">Admin Access</h1>
                    <form onSubmit={handleLogin}>
                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-2">Service Key</label>
                            <input
                                type="password"
                                className="border bg-input text-foreground w-full p-2 rounded focus:ring-2 focus:ring-primary outline-none"
                                placeholder="Enter key..."
                                value={key}
                                onChange={e => setKey(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <button
                            disabled={isLoggingIn}
                            className="bg-primary text-primary-foreground w-full py-2 rounded font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                            {isLoggingIn ? 'Verifying...' : 'Login'}
                        </button>
                    </form>
                </div>
            </div>
        )
    }

    return <AdminPanel />
}
