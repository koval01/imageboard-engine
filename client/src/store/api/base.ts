import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { solvePoW } from '@/lib/pow'
import { getCookie } from '@/lib/utils'

const POW_ENDPOINTS = [
    'postReply', 'createThread', 'reportPost',
    'adminLogin', 'adminLogout', 'resolveReport',
    'banUser', 'deleteContent', 'visualSearch'
];

export const baseApi = createApi({
    reducerPath: 'api',
    tagTypes: ['Board', 'Thread', 'AdminStats', 'Reports', 'Logs', 'AdminAuth'],
    baseQuery: fetchBaseQuery({
        baseUrl: '/api',
        prepareHeaders: async (headers, { endpoint }) => {
            if (POW_ENDPOINTS.includes(endpoint)) {
                const sessionId = getCookie('client_key');
                if (sessionId) {
                    try {
                        const { nonce, salt } = await solvePoW(sessionId);
                        headers.set('X-PoW-Nonce', nonce);
                        headers.set('X-PoW-Salt', salt);
                    } catch (e) {
                        console.error("PoW Error", e);
                    }
                }
            }
            return headers;
        },
    }),
    endpoints: () => ({}),
})
