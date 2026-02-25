import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
    useGetAdminStatsQuery, useGetReportsQuery, useGetAdminLogsQuery,
    useResolveReportMutation, useBanUserMutation, useDeleteContentMutation,
    useLazyInvestigateQuery, useVisualSearchMutation, useLazySearchContentQuery,
    useAdminLogoutMutation
} from '../store/apiSlice'
import { format } from 'date-fns'
import { AlertTriangle, Ban, CheckCircle, Search, Eye, Image as ImageIcon, FileText, LogOut } from 'lucide-react'
import { toast } from 'sonner'

export default function AdminPanel() {
    const [searchParams] = useSearchParams()
    const urlTarget = searchParams.get('target')

    // Auto-switch tab if target is present in URL
    const [activeTab, setActiveTab] = useState<'overview' | 'reports' | 'logs' | 'investigate'>(
        urlTarget ? 'investigate' : 'overview'
    )

    const [logout] = useAdminLogoutMutation()

    // Мапінг для назв вкладок
    const tabLabels: Record<string, string> = {
        overview: 'Огляд',
        reports: 'Скарги',
        logs: 'Логи',
        investigate: 'Розслідування'
    }

    return (
        <div className="container mx-auto p-4 max-w-7xl min-h-screen">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Адмін-панель</h1>
                <button onClick={() => logout()} className="flex items-center gap-2 px-3 py-1 rounded hover:bg-muted cursor-pointer border">
                    <LogOut size={16} /> Вийти
                </button>
            </div>

            <div className="flex gap-2 mb-6 border-b pb-2 overflow-x-auto">
                {['overview', 'reports', 'logs', 'investigate'].map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab as any)}
                        className={`px-4 py-2 rounded capitalize cursor-pointer ${activeTab === tab ? 'bg-primary text-primary-foreground font-bold' : 'hover:bg-muted'}`}
                    >
                        {tabLabels[tab]}
                    </button>
                ))}
            </div>

            <div className="bg-card text-card-foreground rounded-lg shadow-sm border p-4">
                {activeTab === 'overview' && <OverviewTab />}
                {activeTab === 'reports' && <ReportsTab />}
                {activeTab === 'logs' && <LogsTab />}
                {activeTab === 'investigate' && <InvestigationTab initialTarget={urlTarget || ''} />}
            </div>
        </div>
    )
}

function OverviewTab() {
    const { data: stats } = useGetAdminStatsQuery()
    if (!stats) return <div>Завантаження статистики...</div>

    const cards = [
        { label: 'Всього постів', val: stats.total_posts, icon: FileText },
        { label: 'Активні бани', val: stats.total_bans, icon: Ban },
        { label: 'Всього скарг', val: stats.total_reports, icon: AlertTriangle },
        { label: 'Відкриті скарги', val: stats.open_reports, icon: Eye, color: 'text-red-500' },
    ]

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {cards.map((c) => (
                <div key={c.label} className="border rounded p-6 flex items-center justify-between bg-background">
                    <div>
                        <p className="text-sm text-muted-foreground">{c.label}</p>
                        <p className={`text-2xl font-bold ${c.color || ''}`}>{c.val}</p>
                    </div>
                    <c.icon className="h-8 w-8 text-muted-foreground/20" />
                </div>
            ))}
        </div>
    )
}

function ReportsTab() {
    const [page, setPage] = useState(0)
    const [status, setStatus] = useState('OPEN')
    const { data, refetch } = useGetReportsQuery({ page, status })
    const [resolveReport] = useResolveReportMutation()
    const [banUser] = useBanUserMutation()
    const [delContent] = useDeleteContentMutation()

    const handleResolve = async (id: number, stat: string) => {
        await resolveReport({ report_id: id, status: stat })
        toast.success(`Скаргу позначено як ${stat}`)
        refetch()
    }

    const handleBan = async (ip: string, post_id: number) => {
        const reason = prompt("Причина бану:", "Порушення правил")
        if (!reason) return
        await banUser({ ip, reason, duration: 24, delete_content: false })
        toast.success("Користувача забанено")
        if (confirm("Видалити цей пост?")) {
            await delContent({ id: post_id, type_: 'post' })
            await resolveReport({ report_id: post_id, status: 'RESOLVED' })
            refetch()
        }
    }

    if (!data) return <div>Завантаження...</div>

    return (
        <div>
            <div className="flex justify-between mb-4">
                <div className="space-x-2">
                    {['OPEN', 'RESOLVED', 'REJECTED', 'ALL'].map(s => (
                        <button key={s} onClick={() => { setStatus(s); setPage(0) }}
                                className={`text-xs px-2 py-1 rounded border cursor-pointer ${status === s ? 'bg-secondary' : ''}`}>
                            {s}
                        </button>
                    ))}
                </div>
                <div className="space-x-2">
                    <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2 border rounded cursor-pointer disabled:opacity-50">&lt;</button>
                    <span>Сторінка {page + 1} з {data.total_pages || 1}</span>
                    <button disabled={page >= data.total_pages - 1} onClick={() => setPage(p => p + 1)} className="px-2 border rounded cursor-pointer disabled:opacity-50">&gt;</button>
                </div>
            </div>

            <div className="space-y-4">
                {data.data.map(r => (
                    <div key={r.id} className="border p-4 rounded flex flex-col gap-2 relative bg-background">
                        <div className="flex justify-between items-start">
                            <div>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${r.status === 'OPEN' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                    {r.status}
                                </span>
                                <span className="ml-2 text-sm text-muted-foreground">{format(new Date(r.created_at), 'dd.MM, HH:mm')}</span>
                                <div className="mt-1 font-medium">Причина: {r.reason}</div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => handleResolve(r.id, 'RESOLVED')} className="p-1 hover:bg-green-100 rounded text-green-600" title="Вирішити"><CheckCircle size={18} /></button>
                                <button onClick={() => handleResolve(r.id, 'REJECTED')} className="p-1 hover:bg-yellow-100 rounded text-yellow-600" title="Відхилити"><Ban size={18} /></button>
                            </div>
                        </div>

                        {r.post ? (
                            <div className="bg-muted p-3 rounded text-sm mt-2">
                                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                    <span>{r.board_slug ? `/${r.board_slug}/` : ''} &bull; № {r.post.id}</span>
                                    <span>IP: {r.post.ip_address}</span>
                                </div>
                                <div className="whitespace-pre-wrap">{r.post.content}</div>
                                {r.images.length > 0 && (
                                    <div className="flex gap-2 mt-2">
                                        {r.images.map(img => (
                                            <a key={img.id} href={img.url} target="_blank" rel="noreferrer">
                                                <img src={img.thumbnail_url} className="h-20 w-20 object-cover rounded border" alt="" />
                                            </a>
                                        ))}
                                    </div>
                                )}
                                <div className="mt-2 flex gap-2">
                                    <button onClick={() => handleBan(r.post!.ip_address as string, r.post!.id)} className="text-xs bg-destructive text-destructive-foreground px-2 py-1 rounded flex items-center gap-1 cursor-pointer hover:bg-destructive/90">
                                        <Ban size={12} /> Бан та Видалення
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-muted-foreground italic">Пост було видалено</div>
                        )}
                    </div>
                ))}
                {data.data.length === 0 && <div className="text-center text-muted-foreground py-8">Скарг не знайдено.</div>}
            </div>
        </div>
    )
}

function LogsTab() {
    const [page, setPage] = useState(0)
    const [search, setSearch] = useState('')
    const { data } = useGetAdminLogsQuery({ page, search })

    return (
        <div>
            <div className="flex gap-2 mb-4">
                <input
                    type="text"
                    placeholder="Пошук у логах..."
                    className="border px-3 py-2 rounded w-full max-w-sm"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>
            <div className="rounded border overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-muted">
                    <tr>
                        <th className="p-2 text-left">Час</th>
                        <th className="p-2 text-left">Адмін</th>
                        <th className="p-2 text-left">Дія</th>
                        <th className="p-2 text-left">Ціль</th>
                        <th className="p-2 text-left">Деталі</th>
                    </tr>
                    </thead>
                    <tbody>
                    {data?.data.map(log => (
                        <tr key={log.id} className="border-t hover:bg-muted/50">
                            <td className="p-2 font-mono text-xs">{format(new Date(log.created_at), 'dd.MM HH:mm')}</td>
                            <td className="p-2">{log.admin_username}</td>
                            <td className="p-2 font-bold text-xs">{log.action}</td>
                            <td className="p-2 font-mono text-xs truncate max-w-[150px]">{log.target_id}</td>
                            <td className="p-2 text-muted-foreground truncate max-w-[200px]">{log.details}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
            <div className="mt-4 flex justify-between items-center text-sm">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="disabled:opacity-50 px-2 py-1 border rounded cursor-pointer">Назад</button>
                <span>Сторінка {page + 1}</span>
                <button disabled={page >= (data?.total_pages || 0) - 1} onClick={() => setPage(p => p + 1)} className="disabled:opacity-50 px-2 py-1 border rounded cursor-pointer">Далі</button>
            </div>
        </div>
    )
}

function InvestigationTab({ initialTarget }: { initialTarget: string }) {
    const [target, setTarget] = useState(initialTarget)
    const [triggerTextSearch, { data: textResults }] = useLazySearchContentQuery()
    const [triggerInvestigate, { data: invResults }] = useLazyInvestigateQuery()
    const [triggerVisual, { data: visResults, isLoading: isUploading }] = useVisualSearchMutation()

    // Auto-trigger search if initialTarget is provided via URL
    useEffect(() => {
        if (initialTarget) {
            handleSearch(initialTarget)
        }
    }, [initialTarget])

    const handleSearch = (term: string) => {
        // Simple heuristic: IPs or long session IDs vs content
        // If it looks like an IP or has a specific length (session ID ~32 chars), investigate.
        // Otherwise, text search.
        const isIp = term.includes('.') || term.includes(':')
        const isSession = term.length > 20 && !term.includes(' ')

        if (isIp || isSession) {
            triggerInvestigate({ target: term })
        } else {
            triggerTextSearch({ query: term })
        }
    }

    const onFormSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        handleSearch(target)
    }

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const fd = new FormData()
            fd.append('file', e.target.files[0])
            await triggerVisual(fd)
        }
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
                <div className="border rounded p-4 bg-background">
                    <h3 className="font-bold mb-2 flex items-center gap-2"><Search size={18} /> Пошук та Аналіз</h3>
                    <form onSubmit={onFormSubmit} className="flex gap-2">
                        <input
                            className="border p-2 rounded flex-1"
                            placeholder="IP, Session ID або текст..."
                            value={target}
                            onChange={e => setTarget(e.target.value)}
                        />
                        <button type="submit" className="bg-primary text-primary-foreground px-4 rounded cursor-pointer">Go</button>
                    </form>
                    <p className="text-xs text-muted-foreground mt-2">
                        Введіть IP або Session ID для аналізу мережі. Введіть текст для пошуку по контенту.
                    </p>
                </div>

                <div className="border rounded p-4 bg-background">
                    <h3 className="font-bold mb-2 flex items-center gap-2"><ImageIcon size={18} /> Візуальний пошук</h3>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer" />
                    {isUploading && <p className="text-sm mt-2">Сканування...</p>}
                </div>
            </div>

            <div className="border rounded p-4 bg-background min-h-[400px] overflow-y-auto">
                <h3 className="font-bold mb-4 border-b pb-2">Результати</h3>

                {textResults && (
                    <div className="space-y-4">
                        <h4 className="text-sm font-semibold text-muted-foreground">Знайдено {textResults.length} постів за текстом</h4>
                        {textResults.map(p => (
                            <div key={p.id} className="text-sm border p-2 rounded">
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>№ {p.id}</span>
                                    <span className="font-mono">{p.ip_address}</span>
                                </div>
                                <div>{p.content}</div>
                            </div>
                        ))}
                    </div>
                )}

                {invResults && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="bg-muted p-2 rounded">
                                <div className="font-bold">Пов'язані IP ({invResults.related_ips.length})</div>
                                <div className="max-h-24 overflow-y-auto font-mono text-xs">
                                    {invResults.related_ips.map(ip => <div key={ip}>{ip}</div>)}
                                </div>
                            </div>
                            <div className="bg-muted p-2 rounded">
                                <div className="font-bold">Пов'язані сесії ({invResults.related_sessions.length})</div>
                                <div className="max-h-24 overflow-y-auto font-mono text-xs">
                                    {invResults.related_sessions.map(s => <div key={s}>{s.substring(0, 12)}...</div>)}
                                </div>
                            </div>
                        </div>
                        {invResults.similar_images.length > 0 && (
                            <div>
                                <h4 className="font-bold text-sm mb-2">Пов'язані зображення (Візуальний збіг)</h4>
                                <div className="flex flex-wrap gap-2">
                                    {invResults.similar_images.map(([pid, dist, url]) => (
                                        <div key={pid} className="relative group">
                                            <a href={url} target="_blank" rel="noreferrer">
                                                <img src={url} className="w-16 h-16 object-cover rounded border" alt="" />
                                            </a>
                                            <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[10px] px-1">{dist.toFixed(0)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {/* Display Posts Found in Investigation */}
                        {invResults.posts_found.length > 0 && (
                            <div>
                                <h4 className="font-bold text-sm mb-2">Пов'язані пости ({invResults.posts_found.length})</h4>
                                <div className="space-y-2 max-h-60 overflow-y-auto">
                                    {invResults.posts_found.map(p => (
                                        <div key={p.id} className="text-xs border p-2 rounded hover:bg-muted/10">
                                            <div className="flex justify-between font-mono text-muted-foreground">
                                                <span>№ {p.id}</span>
                                                <span>{p.ip_address}</span>
                                            </div>
                                            <div className="truncate">{p.content}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {visResults && (
                    <div className="space-y-2">
                        {visResults.map((res, i) => (
                            <div key={i} className="flex gap-3 border p-2 rounded hover:bg-muted/20">
                                <img src={res.image.thumbnail_url} className="w-16 h-16 object-cover rounded" alt="" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <div className="text-xs font-mono">Відстань: {res.distance.toFixed(1)}</div>
                                        <div className="text-xs text-muted-foreground">{res.board_slug ? `/${res.board_slug}/` : ''} {res.post?.id}</div>
                                    </div>
                                    <p className="text-sm line-clamp-2 mt-1">{res.post?.content || 'Без контенту'}</p>
                                </div>
                            </div>
                        ))}
                        {visResults.length === 0 && <p className="text-muted-foreground text-sm">Збігів не знайдено.</p>}
                    </div>
                )}
            </div>
        </div>
    )
}
