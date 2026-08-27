import { useEffect, useState } from 'react'
import { useBanUserMutation, useListBansQuery, usePreviewBanMutation, useUnbanMutation } from '@/store/api/adminApi'
import type { CidrPreview } from '@/types/admin'
import { toast } from 'sonner'
import { format } from 'date-fns'

export default function BansPanel() {
    const { data } = useListBansQuery()
    const [previewBan] = usePreviewBanMutation()
    const [banUser] = useBanUserMutation()
    const [unban] = useUnbanMutation()
    const [cidr, setCidr] = useState('')
    const [reason, setReason] = useState('Порушення правил')
    const [duration, setDuration] = useState(24)
    const [scope, setScope] = useState<'site' | 'board'>('site')
    const [boardSlug, setBoardSlug] = useState('m')
    const [kind, setKind] = useState<'post' | 'view'>('post')
    const [deleteContent, setDeleteContent] = useState(false)
    const [preview, setPreview] = useState<CidrPreview | null>(null)
    const [previewing, setPreviewing] = useState(false)

    useEffect(() => {
        const t = setTimeout(async () => {
            if (!cidr.trim()) {
                setPreview(null)
                return
            }
            setPreviewing(true)
            try {
                const res = await previewBan({ cidr: cidr.trim() }).unwrap()
                setPreview(res)
            } catch {
                setPreview(null)
            } finally {
                setPreviewing(false)
            }
        }, 400)
        return () => clearTimeout(t)
    }, [cidr, previewBan])

    const submit = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            await banUser({
                ip: cidr.trim(),
                cidr: cidr.trim(),
                reason,
                duration,
                delete_content: deleteContent && kind === 'post',
                scope,
                board_slug: scope === 'board' ? boardSlug : undefined,
                kind,
            }).unwrap()
            toast.success('Бан застосовано')
            setCidr('')
            setPreview(null)
        } catch (err: unknown) {
            const msg = (err as { data?: { error?: string } })?.data?.error
            toast.error(msg || 'Не вдалося забанити')
        }
    }

    return (
        <div className="grid gap-6 lg:grid-cols-2">
            <form onSubmit={submit} className="space-y-3">
                <h2 className="font-bold">Новий бан (IP / CIDR)</h2>
                <input
                    className="border bg-input w-full p-2 rounded font-mono text-sm"
                    placeholder="198.51.100.12 або 198.51.100.0/24"
                    value={cidr}
                    onChange={(e) => setCidr(e.target.value)}
                    required
                />
                <div className="grid grid-cols-2 gap-2">
                    <label className="text-sm">
                        Обсяг
                        <select className="border bg-input w-full p-2 rounded mt-1" value={scope} onChange={(e) => setScope(e.target.value as 'site' | 'board')}>
                            <option value="site">Весь сайт</option>
                            <option value="board">Одна дошка</option>
                        </select>
                    </label>
                    {scope === 'board' && (
                        <label className="text-sm">
                            Дошка
                            <input className="border bg-input w-full p-2 rounded mt-1" value={boardSlug} onChange={(e) => setBoardSlug(e.target.value)} />
                        </label>
                    )}
                    <label className="text-sm">
                        Тип
                        <select className="border bg-input w-full p-2 rounded mt-1" value={kind} onChange={(e) => setKind(e.target.value as 'post' | 'view')}>
                            <option value="post">Лише постинг</option>
                            <option value="view">Перегляд і постинг</option>
                        </select>
                    </label>
                    <label className="text-sm">
                        Тривалість (год)
                        <input type="number" min={1} className="border bg-input w-full p-2 rounded mt-1" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
                    </label>
                </div>
                <input className="border bg-input w-full p-2 rounded" placeholder="Причина" value={reason} onChange={(e) => setReason(e.target.value)} />
                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={deleteContent} onChange={(e) => setDeleteContent(e.target.checked)} />
                    Видалити контент цієї IP (лише /32)
                </label>
                <button className="bg-destructive text-destructive-foreground px-4 py-2 rounded">Застосувати бан</button>

                {previewing && <p className="text-xs text-muted-foreground">Рахуємо діапазон…</p>}
                {preview && (
                    <div className="border rounded p-3 text-sm space-y-1 bg-background">
                        <p><span className="text-muted-foreground">CIDR:</span> <code>{preview.cidr}</code></p>
                        <p><span className="text-muted-foreground">Діапазон:</span> {preview.first_ip} — {preview.last_ip}</p>
                        <p><span className="text-muted-foreground">Адрес:</span> {preview.address_count}</p>
                        <p><span className="text-muted-foreground">Країна:</span> {preview.country || '—'} {preview.country_code ? `(${preview.country_code})` : ''}</p>
                        <p><span className="text-muted-foreground">Провайдер:</span> {preview.isp || '—'}</p>
                        {preview.org && <p><span className="text-muted-foreground">Орг.:</span> {preview.org}</p>}
                        {preview.asn && <p><span className="text-muted-foreground">AS:</span> {preview.asn}</p>}
                        {preview.spillover ? (
                            <p className="text-destructive">
                                Блок зачіпає інші провайдери: {preview.other_isps.join(', ') || 'кілька ASN'}
                            </p>
                        ) : (
                            <p className="text-muted-foreground">Вибірки вказують на одного провайдера.</p>
                        )}
                    </div>
                )}

                <details className="text-sm text-muted-foreground border rounded p-3">
                    <summary className="cursor-pointer font-medium text-foreground">Шпаргалка CIDR</summary>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li><code>/32</code> — одна IPv4-адреса.</li>
                        <li><code>/24</code> — 256 адрес (типовий «маленький» блок провайдера).</li>
                        <li><code>/16</code> — 65 536 адрес; майже завжди зачепить чужі мережі.</li>
                        <li>Бан на постинг блокує створення тредів і відповідей; перегляд лишається.</li>
                        <li>Бан на перегляд закриває дошку або весь сайт, окрім /admin.</li>
                        <li>Якщо превʼю показує spillover — звузьте маску, щоб не забанити випадкових людей.</li>
                    </ul>
                </details>
            </form>

            <div>
                <h2 className="font-bold mb-3">Активні бани</h2>
                <div className="space-y-2 max-h-[32rem] overflow-auto">
                    {(data?.data || []).map((b) => (
                        <div key={b.id} className="border rounded p-3 text-sm flex justify-between gap-2">
                            <div>
                                <div className="font-mono">{b.cidr || b.ip_address}</div>
                                <div className="text-muted-foreground">
                                    {b.kind === 'view' ? 'перегляд' : 'постинг'} · {b.scope === 'board' ? `/${b.board_slug}/` : 'сайт'}
                                    {b.reason ? ` · ${b.reason}` : ''}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    до {format(new Date(b.expires_at), 'dd.MM HH:mm')}
                                    {b.created_by ? ` · ${b.created_by}` : ''}
                                </div>
                            </div>
                            <button className="text-xs border rounded px-2 h-8" onClick={() => unban({ id: b.id })}>Зняти</button>
                        </div>
                    ))}
                    {data?.data.length === 0 && <p className="text-muted-foreground text-sm">Немає активних банів.</p>}
                </div>
            </div>
        </div>
    )
}
