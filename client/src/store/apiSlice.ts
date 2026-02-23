import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type {
    HomeResponse, BoardResponse, ThreadResponse, PostItem,
    AdminStats, LogsResponse, ReportsResponse, InvestigationResult, BanPayload, Post, VisualSearchResult
} from '@/types'
import { solvePoW } from '@/lib/pow'

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
            const powEndpoints = [
                'postReply', 'createThread', 'reportPost',
                'adminLogin', 'adminLogout', 'resolveReport',
                'banUser', 'deleteContent', 'visualSearch'
            ];

            if (powEndpoints.includes(endpoint)) {
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
    tagTypes: ['Board', 'Thread', 'AdminStats', 'Reports', 'Logs'],
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
        reportPost: builder.mutation<{ status: string }, { post_id: number; reason: string }>({
            query: (body) => ({ url: '/report', method: 'POST', body }),
        }),

        // --- Admin Endpoints ---
        checkAdmin: builder.query<{ status: string; role: number }, void>({
            query: () => '/admin/status',
        }),
        adminLogin: builder.mutation<{ status: string; role: number }, { key: string }>({
            query: (body) => ({ url: '/admin/login', method: 'POST', body }),
        }),
        adminLogout: builder.mutation<{ status: string }, void>({
            query: () => ({ url: '/admin/logout', method: 'POST' }),
        }),
        getAdminStats: builder.query<AdminStats, void>({
            query: () => '/admin/stats',
            providesTags: ['AdminStats'],
        }),
        getAdminLogs: builder.query<LogsResponse, { page: number; search?: string }>({
            query: ({ page, search }) => `/admin/logs?page=${page}&limit=50&search=${search || ''}`,
            providesTags: ['Logs'],
        }),
        getReports: builder.query<ReportsResponse, { status?: string; page: number }>({
            query: ({ status, page }) => `/admin/reports?status=${status || ''}&page=${page}&limit=20`,
            providesTags: ['Reports'],
        }),
        resolveReport: builder.mutation<void, { report_id: number; status: string }>({
            query: (body) => ({ url: '/admin/resolve', method: 'POST', body }),
            invalidatesTags: ['Reports', 'AdminStats'],
        }),
        banUser: builder.mutation<void, BanPayload>({
            query: (body) => ({ url: '/admin/ban', method: 'POST', body }),
            invalidatesTags: ['Thread', 'Board', 'AdminStats'],
        }),
        deleteContent: builder.mutation<void, { id: number; type_: 'post' | 'thread' }>({
            query: (body) => ({ url: '/admin/delete', method: 'POST', body }),
            invalidatesTags: ['Thread', 'Board'],
        }),
        investigate: builder.query<InvestigationResult, { target: string; threshold?: number }>({
            query: ({ target, threshold }) => `/admin/investigate?target=${target}&threshold=${threshold ?? 10}`,
        }),
        searchContent: builder.query<Post[], { query: string; limit?: number }>({
            query: ({ query, limit }) => `/admin/search?query=${query}&limit=${limit || 50}`,
        }),
        visualSearch: builder.mutation<VisualSearchResult[], FormData>({
            query: (formData) => ({
                url: '/admin/visual-search',
                method: 'POST',
                body: formData,
            }),
        }),
    }),
})

export const {
    useGetHomeQuery,
    useGetBoardQuery,
    useGetThreadQuery,
    usePostReplyMutation,
    useCreateThreadMutation,
    useReportPostMutation,
    useCheckAdminQuery,
    useAdminLoginMutation,
    useAdminLogoutMutation,
    useGetAdminStatsQuery,
    useGetAdminLogsQuery,
    useGetReportsQuery,
    useResolveReportMutation,
    useBanUserMutation,
    useDeleteContentMutation,
    useLazyInvestigateQuery,
    useLazySearchContentQuery,
    useVisualSearchMutation,
} = apiSlice
