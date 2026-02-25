import React, { useState } from 'react'
import { useCheckAdminQuery, useAdminLoginMutation } from '@/store/api/adminApi'
import AdminLayout from '@/features/admin/AdminLayout'
import { toast } from 'sonner'

export default function AdminPage() {
    const { data: adminStatus, isLoading } = useCheckAdminQuery()
    const [login, { isLoading: isLoggingIn }] = useAdminLoginMutation()
    const [key, setKey] = useState('')

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            const res = await login({ key }).unwrap()
            if (res.status === 'ok') toast.success('Успішний вхід')
        } catch (err) { toast.error('Невірний ключ') }
    }

    if (isLoading) return <div className="h-screen flex items-center justify-center">Перевірка...</div>

    if (!adminStatus || adminStatus.role < 1) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background">
                <div className="bg-card p-8 rounded-lg shadow-lg border w-full max-w-sm">
                    <h1 className="text-2xl font-bold mb-6 text-center">Вхід для адміністратора</h1>
                    <form onSubmit={handleLogin}>
                        <input type="password" className="border bg-input text-foreground w-full p-2 rounded mb-4" placeholder="Ключ..." value={key} onChange={e => setKey(e.target.value)} autoFocus />
                        <button disabled={isLoggingIn} className="bg-primary text-primary-foreground w-full py-2 rounded disabled:opacity-50">{isLoggingIn ? '...' : 'Увійти'}</button>
                    </form>
                </div>
            </div>
        )
    }

    return <AdminLayout />
}
