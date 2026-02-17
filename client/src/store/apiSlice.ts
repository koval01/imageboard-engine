import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

export const apiSlice = createApi({
    reducerPath: 'api',
    baseQuery: fetchBaseQuery({ baseUrl: '/api' }), // Proxy in vite.config.ts handles this in dev
    tagTypes: ['Board', 'Thread'],
    endpoints: (builder) => ({
        getHome: builder.query({
            query: () => '/home',
        }),
        getBoard: builder.query({
            query: (slug) => `/${slug}`,
            providesTags: ['Board'],
        }),
        getThread: builder.query({
            query: ({ slug, id }) => `/${slug}/thread/${id}`,
            providesTags: ['Thread'],
        }),
        postReply: builder.mutation({
            query: ({ slug, id, formData }) => ({
                url: `/${slug}/thread/${id}/reply`,
                method: 'POST',
                body: formData, // FormData handles multipart automatically
                // You will need to implement the PoW logic here for headers
            }),
            invalidatesTags: ['Thread'],
        }),
    }),
})

export const { useGetHomeQuery, useGetBoardQuery, useGetThreadQuery } = apiSlice
