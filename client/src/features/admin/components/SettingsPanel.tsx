import { useEffect, useState } from 'react'
import { useCheckAdminQuery, useGetStaffSettingsQuery, useSaveStaffSettingsMutation } from '@/store/api/adminApi'
import { useChangePasswordMutation } from '@/store/api/adminPasswordApi'
import PasswordStrength from '@/components/common/PasswordStrength'
import { passwordAcceptable } from '@/lib/passwordPolicy'
import { toast } from 'sonner'

export default function SettingsPanel() {
    const { data: status } = useCheckAdminQuery()
    const { data: settings } = useGetStaffSettingsQuery()
    const [saveSettings] = useSaveStaffSettingsMutation()
    const [changePassword] = useChangePasswordMutation()
    const [rate, setRate] = useState(120)
    const [start, setStart] = useState('')
    const [end, setEnd] = useState('')
    const [tz, setTz] = useState('Europe/Kyiv')
    const [current, setCurrent] = useState('')
    const [next, setNext] = useState('')
    const canManage = Boolean(status?.privileges?.manage_staff)

    useEffect(() => {
        if (!settings) return
        setRate(settings.default_rate_limit_per_hour)
        setStart(settings.default_work_start || '')
        setEnd(settings.default_work_end || '')
        setTz(settings.timezone)
    }, [settings])

    return (
        <div className="grid gap-8 md:grid-cols-2">
            <form
                className="space-y-3"
                onSubmit={async (e) => {
                    e.preventDefault()
                    if (!passwordAcceptable(next, status?.username)) {
                        toast.error('Пароль не відповідає вимогам')
                        return
                    }
                    try {
                        await changePassword({ current, new_password: next }).unwrap()
                        toast.success('Пароль змінено')
                        setCurrent('')
                        setNext('')
                    } catch (err: unknown) {
                        const msg = (err as { data?: { error?: string } })?.data?.error
                        toast.error(msg || 'Не вдалося змінити пароль')
                    }
                }}
            >
                <h2 className="font-bold">Мій пароль</h2>
                <label className="text-sm block">
                    Поточний пароль
                    <input type="password" className="border bg-input w-full p-2 rounded mt-1" placeholder="Поточний пароль" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
                </label>
                <label className="text-sm block">
                    Новий пароль
                    <input type="password" className="border bg-input w-full p-2 rounded mt-1" placeholder="Новий пароль" value={next} onChange={(e) => setNext(e.target.value)} minLength={13} autoComplete="new-password" />
                </label>
                <PasswordStrength value={next} username={status?.username} />
                <button type="submit" disabled={!passwordAcceptable(next, status?.username)} className="bg-primary text-primary-foreground px-4 py-2 rounded disabled:opacity-50">Зберегти пароль</button>
            </form>

            {canManage && (
                <form
                    className="space-y-3"
                    onSubmit={async (e) => {
                        e.preventDefault()
                        try {
                            await saveSettings({
                                default_rate_limit_per_hour: rate,
                                default_work_start: start,
                                default_work_end: end,
                                timezone: tz,
                            }).unwrap()
                            toast.success('Налаштування збережено')
                        } catch (err: unknown) {
                            const msg = (err as { data?: { error?: string } })?.data?.error
                            toast.error(msg || 'Помилка')
                        }
                    }}
                >
                    <h2 className="font-bold">Глобальні ліміти персоналу</h2>
                    <label className="text-sm block">
                        Дій на годину (за замовчуванням)
                        <input type="number" min={0} className="border bg-input w-full p-2 rounded mt-1" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
                    </label>
                    <div className="flex gap-2">
                        <label className="text-sm flex-1">
                            Початок зміни
                            <input className="border bg-input w-full p-2 rounded mt-1" placeholder="09:00" value={start} onChange={(e) => setStart(e.target.value)} />
                        </label>
                        <label className="text-sm flex-1">
                            Кінець зміни
                            <input className="border bg-input w-full p-2 rounded mt-1" placeholder="21:00" value={end} onChange={(e) => setEnd(e.target.value)} />
                        </label>
                    </div>
                    <label className="text-sm block">
                        Часовий пояс
                        <input className="border bg-input w-full p-2 rounded mt-1" value={tz} onChange={(e) => setTz(e.target.value)} />
                    </label>
                    <p className="text-xs text-muted-foreground">Порожні години означають цілодобову роботу. Поза зміною персонал бачить логи, але не діє. Супер-адмін не обмежується.</p>
                    <button className="bg-primary text-primary-foreground px-4 py-2 rounded">Зберегти</button>
                </form>
            )}
        </div>
    )
}
