import { useState } from 'react'
import {
    useDeleteStaffMutation,
    useListStaffQuery,
    useUpdateStaffMutation,
} from '@/store/api/adminApi'
import { useCreateStaffMutation, useResetStaffPasswordMutation } from '@/store/api/adminPasswordApi'
import type { Privileges, StaffMember } from '@/types/admin'
import PasswordStrength from '@/components/common/PasswordStrength'
import { passwordAcceptable } from '@/lib/passwordPolicy'
import { toast } from 'sonner'

const PRIV_KEYS = [
    { key: 'hide', label: 'Приховувати' },
    { key: 'delete', label: 'Видаляти' },
    { key: 'ban', label: 'Банити' },
    { key: 'view_ip', label: 'Бачити IP' },
] as const

export default function StaffPanel() {
    const { data } = useListStaffQuery()
    const [createStaff] = useCreateStaffMutation()
    const [updateStaff] = useUpdateStaffMutation()
    const [resetPassword] = useResetStaffPasswordMutation()
    const [deleteStaff] = useDeleteStaffMutation()
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [role, setRole] = useState(1)
    const [resetId, setResetId] = useState<number | null>(null)
    const [resetPw, setResetPw] = useState('')
    const [resetName, setResetName] = useState('')

    const add = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!passwordAcceptable(password, username)) {
            toast.error('Пароль не відповідає вимогам')
            return
        }
        try {
            await createStaff({ username, password, role }).unwrap()
            toast.success('Обліковий запис створено')
            setUsername('')
            setPassword('')
        } catch (err: unknown) {
            const msg = (err as { data?: { error?: string } })?.data?.error
            toast.error(msg || 'Помилка')
        }
    }

    const submitReset = async (e: React.FormEvent) => {
        e.preventDefault()
        if (resetId == null) return
        if (!passwordAcceptable(resetPw, resetName)) {
            toast.error('Пароль не відповідає вимогам')
            return
        }
        try {
            await resetPassword({ id: resetId, password: resetPw }).unwrap()
            toast.success('Пароль скинуто')
            setResetId(null)
            setResetPw('')
            setResetName('')
        } catch (err: unknown) {
            const msg = (err as { data?: { error?: string } })?.data?.error
            toast.error(msg || 'Помилка')
        }
    }

    const togglePriv = async (s: StaffMember, key: string, value: boolean) => {
        const overrides = { ...s.overrides, [key]: value }
        try {
            await updateStaff({ id: s.id, privileges: overrides }).unwrap()
        } catch (err: unknown) {
            const msg = (err as { data?: { error?: string } })?.data?.error
            toast.error(msg || 'Не вдалося змінити привілей')
        }
    }

    return (
        <div className="space-y-6">
            <form onSubmit={add} className="space-y-2">
                <div className="flex flex-wrap gap-2 items-end">
                    <label className="text-sm">
                        Імʼя
                        <input className="border bg-input p-2 rounded block" value={username} onChange={(e) => setUsername(e.target.value)} required />
                    </label>
                    <label className="text-sm">
                        Пароль
                        <input type="password" className="border bg-input p-2 rounded block" value={password} onChange={(e) => setPassword(e.target.value)} minLength={13} required autoComplete="new-password" />
                    </label>
                    <label className="text-sm">
                        Рівень
                        <select className="border bg-input p-2 rounded block" value={role} onChange={(e) => setRole(Number(e.target.value))}>
                            <option value={1}>Модератор</option>
                            <option value={2}>Адмін</option>
                        </select>
                    </label>
                    <button type="submit" disabled={!passwordAcceptable(password, username)} className="bg-primary text-primary-foreground px-4 py-2 rounded disabled:opacity-50">Призначити</button>
                </div>
                <PasswordStrength value={password} username={username} />
            </form>
            <p className="text-xs text-muted-foreground">Супер-адмін <code>admin</code> не видаляється і не обмежується. Звичайний адмін модерує нарівні з супер-адміном, але не керує персоналом.</p>

            <div className="space-y-3">
                {(data?.data || []).map((s) => (
                    <div key={s.id} className="border rounded p-3 space-y-2">
                        <div className="flex justify-between gap-2 flex-wrap">
                            <div>
                                <span className="font-bold">{s.username}</span>
                                <span className="ml-2 text-xs text-muted-foreground">
                                    {s.is_super ? 'супер-адмін' : s.role === 2 ? 'адмін' : 'модератор'}
                                    {s.disabled ? ' · вимкнено' : ''}
                                </span>
                                {s.last_login_ip && <div className="text-xs font-mono text-muted-foreground">останній вхід: {s.last_login_ip}</div>}
                            </div>
                            {!s.is_super && (
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        className="text-xs border rounded px-2"
                                        onClick={() => {
                                            setResetId(s.id)
                                            setResetName(s.username)
                                            setResetPw('')
                                        }}
                                    >
                                        Пароль
                                    </button>
                                    <button
                                        className="text-xs border rounded px-2"
                                        onClick={() => updateStaff({ id: s.id, disabled: !s.disabled })}
                                    >
                                        {s.disabled ? 'Увімкнути' : 'Вимкнути'}
                                    </button>
                                    <button
                                        className="text-xs border rounded px-2 text-destructive"
                                        onClick={async () => {
                                            if (!confirm(`Видалити ${s.username}?`)) return
                                            await deleteStaff(s.id)
                                        }}
                                    >
                                        Видалити
                                    </button>
                                </div>
                            )}
                        </div>
                        {resetId === s.id && (
                            <form onSubmit={submitReset} className="space-y-2 border-t pt-2">
                                <input
                                    type="password"
                                    className="border bg-input p-2 rounded w-full"
                                    placeholder={`Новий пароль для ${s.username}`}
                                    value={resetPw}
                                    onChange={(e) => setResetPw(e.target.value)}
                                    autoComplete="new-password"
                                    minLength={13}
                                    aria-label={`Новий пароль для ${s.username}`}
                                />
                                <PasswordStrength value={resetPw} username={s.username} />
                                <div className="flex gap-2">
                                    <button type="submit" disabled={!passwordAcceptable(resetPw, s.username)} className="text-xs bg-primary text-primary-foreground rounded px-2 py-1 disabled:opacity-50">
                                        Зберегти
                                    </button>
                                    <button
                                        type="button"
                                        className="text-xs border rounded px-2"
                                        onClick={() => {
                                            setResetId(null)
                                            setResetPw('')
                                        }}
                                    >
                                        Скасувати
                                    </button>
                                </div>
                            </form>
                        )}
                        {!s.is_super && (
                            <div className="flex flex-wrap gap-3 text-sm">
                                {PRIV_KEYS.map(({ key, label }) => (
                                    <label key={key} className="flex items-center gap-1">
                                        <input
                                            type="checkbox"
                                            checked={Boolean(s.privileges[key as keyof Privileges])}
                                            onChange={(e) => togglePriv(s, key, e.target.checked)}
                                        />
                                        {label}
                                    </label>
                                ))}
                            </div>
                        )}
                        {!s.is_super && (
                            <div className="flex flex-wrap gap-2 text-xs">
                                <input
                                    className="border bg-input p-1 rounded w-20"
                                    placeholder="з HH:MM"
                                    defaultValue={s.work_start || ''}
                                    onBlur={(e) => updateStaff({ id: s.id, work_start: e.target.value })}
                                />
                                <input
                                    className="border bg-input p-1 rounded w-20"
                                    placeholder="до HH:MM"
                                    defaultValue={s.work_end || ''}
                                    onBlur={(e) => updateStaff({ id: s.id, work_end: e.target.value })}
                                />
                                <input
                                    className="border bg-input p-1 rounded w-24"
                                    placeholder="ліміт/год"
                                    defaultValue={s.rate_limit_per_hour ?? ''}
                                    onBlur={(e) => {
                                        const n = Number(e.target.value)
                                        updateStaff({ id: s.id, rate_limit_per_hour: Number.isFinite(n) ? n : 0 })
                                    }}
                                />
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
