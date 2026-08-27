import { baseApi } from './base'
import type {
    AdminStats, LogsResponse, ReportsResponse, InvestigationResult,
    BanPayload, VisualSearchResult, AdminStatus, StaffMember, StaffSettings,
    BanRecord, CidrPreview,
} from '@/types/admin'
import type { Post } from '@/types/models'

export const adminApi = baseApi.injectEndpoints({
    endpoints: (builder) => ({
        checkAdmin: builder.query<AdminStatus, void>({
            query: () => '/admin/status',
            providesTags: ['AdminAuth'],
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
            invalidatesTags: ['Thread', 'Board', 'AdminStats', 'Bans'],
        }),
        previewBan: builder.mutation<CidrPreview, { cidr: string }>({
            query: (body) => ({ url: '/admin/ban-preview', method: 'POST', body }),
        }),
        listBans: builder.query<{ data: BanRecord[] }, void>({
            query: () => '/admin/bans',
            providesTags: ['Bans'],
        }),
        unban: builder.mutation<void, { id: number }>({
            query: (body) => ({ url: '/admin/unban', method: 'POST', body }),
            invalidatesTags: ['Bans', 'AdminStats'],
        }),
        deleteContent: builder.mutation<void, { id: number; type_: 'post' | 'thread' }>({
            query: (body) => ({ url: '/admin/delete', method: 'POST', body }),
            invalidatesTags: ['Thread', 'Board'],
        }),
        hideContent: builder.mutation<void, { id: number; type_: 'post' | 'thread'; hidden: boolean }>({
            query: (body) => ({ url: '/admin/hide', method: 'POST', body }),
            invalidatesTags: ['Thread', 'Board'],
        }),
        listStaff: builder.query<{ data: StaffMember[] }, void>({
            query: () => '/admin/staff',
            providesTags: ['Staff'],
        }),
        updateStaff: builder.mutation<void, { id: number } & Record<string, unknown>>({
            query: ({ id, ...body }) => ({ url: `/admin/staff/${id}`, method: 'POST', body }),
            invalidatesTags: ['Staff'],
        }),
        deleteStaff: builder.mutation<void, number>({
            query: (id) => ({ url: `/admin/staff/${id}/delete`, method: 'POST' }),
            invalidatesTags: ['Staff', 'Logs'],
        }),
        getStaffSettings: builder.query<StaffSettings, void>({
            query: () => '/admin/settings',
            providesTags: ['StaffSettings'],
        }),
        saveStaffSettings: builder.mutation<void, Partial<StaffSettings>>({
            query: (body) => ({ url: '/admin/settings', method: 'POST', body }),
            invalidatesTags: ['StaffSettings'],
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
    useAdminLogoutMutation,
    useGetAdminStatsQuery,
    useGetAdminLogsQuery,
    useGetReportsQuery,
    useResolveReportMutation,
    useBanUserMutation,
    usePreviewBanMutation,
    useListBansQuery,
    useUnbanMutation,
    useDeleteContentMutation,
    useHideContentMutation,
    useListStaffQuery,
    useUpdateStaffMutation,
    useDeleteStaffMutation,
    useGetStaffSettingsQuery,
    useSaveStaffSettingsMutation,
    useLazyInvestigateQuery,
    useLazySearchContentQuery,
    useVisualSearchMutation,
} = adminApi
