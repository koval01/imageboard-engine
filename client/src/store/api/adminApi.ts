import { baseApi } from './base'
import type {
    AdminStats, LogsResponse, ReportsResponse, InvestigationResult,
    BanPayload, VisualSearchResult
} from '@/types/admin'
import type { Post } from '@/types/models'

export const adminApi = baseApi.injectEndpoints({
    endpoints: (builder) => ({
        checkAdmin: builder.query<{ status: string; role: number }, void>({
            query: () => '/admin/status',
            providesTags: ['AdminAuth'],
        }),
        adminLogin: builder.mutation<{ status: string; role: number }, { key: string }>({
            query: (body) => ({ url: '/admin/login', method: 'POST', body }),
            invalidatesTags: ['AdminAuth'],
        }),
        adminLogout: builder.mutation<{ status: string }, void>({
            query: () => ({ url: '/admin/logout', method: 'POST' }),
            invalidatesTags: ['AdminAuth'],
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
} = adminApi
