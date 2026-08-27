import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { solvePoW } from '@/lib/pow'
import { getCookie } from '@/lib/utils'

const apiOrigin = import.meta.env.VITE_API_ORIGIN || ''

let clientKeyCache: string | null = null

function sessionId(): string | null {
    return getCookie('client_key') || clientKeyCache
}

async function rememberKey(res: Response) {
    const key = res.headers.get('x-client-key')
    if (key) clientKeyCache = key
    return res
}

async function ensureSession(): Promise<string | null> {
    let id = sessionId()
    if (id) return id
    try {
        const warm = await fetch(`${apiOrigin}/api/home`, { credentials: 'include' })
        await rememberKey(warm)
    } catch (e) {
        console.error('Failed to establish session', e)
    }
    return sessionId()
}

const baseQuery = fetchBaseQuery({
    baseUrl: `${apiOrigin}/api`,
    credentials: 'include',
    fetchFn: async (input, init) => {
        const original = input instanceof Request ? input : new Request(input, init)
        if (original.method.toUpperCase() === 'POST') {
            const id = await ensureSession()
            if (!id) {
                throw new Error('Немає сесії для Proof of Work')
            }
            const { nonce, salt } = await solvePoW(id)
            const headers = new Headers(original.headers)
            headers.set('X-PoW-Nonce', nonce)
            headers.set('X-PoW-Salt', salt)
            return rememberKey(await fetch(new Request(original, { headers })))
        }
        return rememberKey(await fetch(original))
    },
})

export const baseApi = createApi({
    reducerPath: 'api',
    tagTypes: ['Board', 'Thread', 'AdminStats', 'Reports', 'Logs', 'AdminAuth', 'Staff', 'Bans', 'StaffSettings'],
    baseQuery,
    endpoints: () => ({}),
})
