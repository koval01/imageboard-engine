import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type { HomeResponse, BoardResponse, ThreadResponse, PostItem } from '@/types'
import { solvePoW } from '@/lib/pow'

// Helper to get session ID from cookie
function getCookie(name: string): string | null {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
}

export const apiSlice = createApi({
    reducerPath: 'api',
    baseQuery: fetchBaseQuery({
        baseUrl: '/api',
        prepareHeaders: async (headers, { endpoint }) => {
            // Apply Proof of Work for mutation endpoints
            if (endpoint === 'postReply' || endpoint === 'createThread') {
                const sessionId = getCookie('client_key');
                if (sessionId) {
                    try {
                        const { nonce, salt } = await solvePoW(sessionId);
                        headers.set('X-PoW-Nonce', nonce);
                        headers.set('X-PoW-Salt', salt);
                    } catch (e) {
                        console.error("PoW generation failed", e);
                    }
                }
            }
            return headers;
        },
    }),
    tagTypes: ['Board', 'Thread'],
    endpoints: (builder) => ({
        getHome: builder.query<HomeResponse, void>({
            query: () => '/home',
        }),
        getBoard: builder.query<BoardResponse, string>({
            query: (slug) => `/${slug}`,
            providesTags: ['Board'],
        }),
        getThread: builder.query<ThreadResponse, { slug: string; id: number }>({
            query: ({ slug, id }) => `/${slug}/thread/${id}`,
            providesTags: ['Thread'],
        }),
        postReply: builder.mutation<PostItem, { slug: string; id: number; formData: FormData }>({
            query: ({ slug, id, formData }) => ({
                url: `/${slug}/thread/${id}/reply`,
                method: 'POST',
                body: formData,
            }),
            invalidatesTags: ['Thread'],
        }),
        createThread: builder.mutation<{ thread_id: number }, { slug: string; formData: FormData }>({
            query: ({ slug, formData }) => ({
                url: `/${slug}/submit`,
                method: 'POST',
                body: formData,
            }),
            invalidatesTags: ['Board'],
        }),
    }),
})

export const {
    useGetHomeQuery,
    useGetBoardQuery,
    useGetThreadQuery,
    usePostReplyMutation,
    useCreateThreadMutation
} = apiSlice
