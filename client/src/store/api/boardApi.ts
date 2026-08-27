import { baseApi } from './base'
import type { HomeResponse, BoardResponse, ThreadResponse, PostItem, SinglePostResponse } from '@/types/api'
import type { Restriction } from '@/types/admin'

export const boardApi = baseApi.injectEndpoints({
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
        getPost: builder.query<SinglePostResponse, number>({
            query: (id) => `/post/${id}`,
        }),
        getRestriction: builder.query<Restriction, { board?: string } | void>({
            query: (arg) => {
                const board = arg && 'board' in arg ? arg.board : undefined
                return board ? `/me/restriction?board=${encodeURIComponent(board)}` : '/me/restriction'
            },
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
    }),
})

export const {
    useGetHomeQuery,
    useGetBoardQuery,
    useGetThreadQuery,
    usePostReplyMutation,
    useCreateThreadMutation,
    useReportPostMutation,
    useGetPostQuery,
    useLazyGetPostQuery,
    useLazyGetThreadQuery,
    useGetRestrictionQuery,
} = boardApi
