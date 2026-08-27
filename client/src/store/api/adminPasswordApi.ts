import { sealPassword } from '@/lib/passwordCrypto'
import { baseApi } from './base'

/** Password mutations live in a separate module so tweetnacl is not shipped in the public SPA. */
export const adminPasswordApi = baseApi.injectEndpoints({
    endpoints: (builder) => ({
        changePassword: builder.mutation<{ status: string }, { current: string; new_password: string }>({
            query: (body) => ({
                url: '/admin/password',
                method: 'POST',
                body: {
                    current_enc: sealPassword(body.current),
                    new_password_enc: sealPassword(body.new_password),
                },
            }),
        }),
        createStaff: builder.mutation<void, { username: string; password: string; role: number }>({
            query: ({ username, password, role }) => ({
                url: '/admin/staff',
                method: 'POST',
                body: { username, role, password_enc: sealPassword(password) },
            }),
            invalidatesTags: ['Staff', 'Logs'],
        }),
        resetStaffPassword: builder.mutation<void, { id: number; password: string }>({
            query: ({ id, password }) => ({
                url: `/admin/staff/${id}/password`,
                method: 'POST',
                body: { password_enc: sealPassword(password) },
            }),
        }),
    }),
})

export const {
    useChangePasswordMutation,
    useCreateStaffMutation,
    useResetStaffPasswordMutation,
} = adminPasswordApi
