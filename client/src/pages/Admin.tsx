import { useState } from 'react'

export default function Admin() {
    const [key, setKey] = useState('')
    const [status, setStatus] = useState<string | null>(null)

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key })
            })
            const data = await res.json()
            if (res.ok) {
                setStatus(`Logged in! Role: ${data.role}`)
                window.location.reload()
            } else {
                setStatus(`Error: ${data.error}`)
            }
        } catch (e) {
            setStatus('Connection failed')
        }
    }

    return (
        <div className="max-w-md mx-auto mt-20 p-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded">
            <h1 className="text-2xl font-bold mb-6">Admin Access</h1>

            <form onSubmit={handleLogin} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium mb-1">Service Key</label>
                    <input
                        type="password"
                        value={key}
                        onChange={e => setKey(e.target.value)}
                        className="w-full p-2 border rounded dark:bg-black dark:border-neutral-700"
                    />
                </div>

                <button className="w-full bg-red-600 text-white py-2 rounded hover:bg-red-700">
                    Login
                </button>
            </form>

            {status && <div className="mt-4 p-2 bg-neutral-100 dark:bg-neutral-800 rounded text-center">{status}</div>}
        </div>
    )
}
