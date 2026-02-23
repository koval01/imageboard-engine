import { useState } from 'react'
import {
    useGetAdminStatsQuery, useGetReportsQuery, useGetAdminLogsQuery,
    useResolveReportMutation, useBanUserMutation, useDeleteContentMutation,
    useLazyInvestigateQuery, useVisualSearchMutation, useLazySearchContentQuery
} from '../store/apiSlice'
import { format } from 'date-fns'
import { AlertTriangle, Ban, CheckCircle, Search, Trash2, Eye, Image as ImageIcon, FileText } from 'lucide-react'
import { toast } from 'sonner'

export default function AdminPanel() {
    const [activeTab, setActiveTab] = useState<'overview' | 'reports' | 'logs' | 'investigate'>('overview')

    return (
        <div className="container mx-auto p-4 max-w-7xl">
            <h1 className="text-3xl font-bold mb-6">Admin Panel</h1>
            <div className="flex gap-2 mb-6 border-b pb-2 overflow-x-auto">
                {['overview', 'reports', 'logs', 'investigate'].map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab as any)}
                        className={`px-4 py-2 rounded capitalize ${activeTab === tab ? 'bg-primary text-primary-foreground font-bold' : 'hover:bg-muted'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <div className="bg-card text-card-foreground rounded-lg shadow-sm border p-4">
                {activeTab === 'overview' && <OverviewTab />}
                {activeTab === 'reports' && <ReportsTab />}
                {activeTab === 'logs' && <LogsTab />}
                {activeTab === 'investigate' && <InvestigationTab />}
            </div>
        </div>
    )
}

function OverviewTab() {
    const { data: stats } = useGetAdminStatsQuery()
    if (!stats) return <div>Loading stats...</div>

    const cards = [
        { label: 'Total Posts', val: stats.total_posts, icon: FileText },
        { label: 'Active Bans', val: stats.total_bans, icon: Ban },
        { label: 'Total Reports', val: stats.total_reports, icon: AlertTriangle },
        { label: 'Open Reports', val: stats.open_reports, icon: Eye, color: 'text-red-500' },
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
        toast.success(`Report marked as ${stat}`)
        refetch()
    }

    const handleBan = async (ip: string, post_id: number) => {
        const reason = prompt("Ban reason:", "Rule violation")
        if (!reason) return
        await banUser({ ip, reason, duration: 24, delete_content: false })
        toast.success("User banned")
        // Optionally delete post too
        if (confirm("Delete this post?")) {
            await delContent({ id: post_id, type_: 'post' })
            await resolveReport({ report_id: post_id, status: 'RESOLVED' }) // Hacky match id
            refetch()
        }
    }

    if (!data) return <div>Loading...</div>

    return (
        <div>
            <div className="flex justify-between mb-4">
                <div className="space-x-2">
                    {['OPEN', 'RESOLVED', 'REJECTED', 'ALL'].map(s => (
                        <button key={s} onClick={() => { setStatus(s); setPage(0) }}
                                className={`text-xs px-2 py-1 rounded border ${status === s ? 'bg-secondary' : ''}`}>
                            {s}
                        </button>
                    ))}
                </div>
                <div className="space-x-2">
                    <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2 border rounded">&lt;</button>
                    <span>Page {page + 1} of {data.total_pages || 1}</span>
                    <button disabled={page >= data.total_pages - 1} onClick={() => setPage(p => p + 1)} className="px-2 border rounded">&gt;</button>
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
                                <span className="ml-2 text-sm text-muted-foreground">{format(new Date(r.created_at), 'MMM d, HH:mm')}</span>
                                <div className="mt-1 font-medium">Reason: {r.reason}</div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => handleResolve(r.id, 'RESOLVED')} className="p-1 hover:bg-green-100 rounded text-green-600" title="Resolve"><CheckCircle size={18} /></button>
                                <button onClick={() => handleResolve(r.id, 'REJECTED')} className="p-1 hover:bg-yellow-100 rounded text-yellow-600" title="Reject"><Ban size={18} /></button>
                            </div>
                        </div>

                        {r.post ? (
                            <div className="bg-muted p-3 rounded text-sm mt-2">
                                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                    <span>{r.board_slug ? `/${r.board_slug}/` : ''} &bull; No. {r.post.id}</span>
                                    <span>IP: {r.post.ip_address}</span>
                                </div>
                                <div className="whitespace-pre-wrap">{r.post.content}</div>
                                {r.images.length > 0 && (
                                    <div className="flex gap-2 mt-2">
                                        {r.images.map(img => (
                                            <a key={img.id} href={img.url} target="_blank" rel="noreferrer">
                                                <img src={img.thumbnail_url} className="h-20 w-20 object-cover rounded border" />
                                            </a>
                                        ))}
                                    </div>
                                )}
                                <div className="mt-2 flex gap-2">
                                    <button onClick={() => handleBan(r.post!.ip_address, r.post!.id)} className="text-xs bg-destructive text-destructive-foreground px-2 py-1 rounded flex items-center gap-1">
                                        <Ban size={12} /> Ban & Delete
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-muted-foreground italic">Post was deleted</div>
                        )}
                    </div>
                ))}
                {data.data.length === 0 && <div className="text-center text-muted-foreground py-8">No reports found.</div>}
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
                    placeholder="Search logs..."
                    className="border px-3 py-2 rounded w-full max-w-sm"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>
            <div className="rounded border overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-muted">
                    <tr>
                        <th className="p-2 text-left">Time</th>
                        <th className="p-2 text-left">Admin</th>
                        <th className="p-2 text-left">Action</th>
                        <th className="p-2 text-left">Target</th>
                        <th className="p-2 text-left">Details</th>
                    </tr>
                    </thead>
                    <tbody>
                    {data?.data.map(log => (
                        <tr key={log.id} className="border-t hover:bg-muted/50">
                            <td className="p-2 font-mono text-xs">{format(new Date(log.created_at), 'MM/dd HH:mm')}</td>
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
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="disabled:opacity-50">Previous</button>
                <span>Page {page + 1}</span>
                <button disabled={page >= (data?.total_pages || 0) - 1} onClick={() => setPage(p => p + 1)} className="disabled:opacity-50">Next</button>
            </div>
        </div>
    )
}

function InvestigationTab() {
    const [mode, setMode] = useState<'text' | 'image'>('text')
    const [target, setTarget] = useState('')
    const [triggerTextSearch, { data: textResults }] = useLazySearchContentQuery()
    const [triggerInvestigate, { data: invResults }] = useLazyInvestigateQuery()
    const [triggerVisual, { data: visResults, isLoading: isUploading }] = useVisualSearchMutation()

    const handleTextSearch = (e: React.FormEvent) => {
        e.preventDefault()
        // Determine if it's an IP/Session lookup or Content search
        if (target.includes('.') || target.length > 20) {
            triggerInvestigate({ target })
        } else {
            triggerTextSearch({ query: target })
        }
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
                    <h3 className="font-bold mb-2 flex items-center gap-2"><Search size={18} /> Search & Investigate</h3>
                    <form onSubmit={handleTextSearch} className="flex gap-2">
                        <input
                            className="border p-2 rounded flex-1"
                            placeholder="IP, Session ID, or Text Content..."
                            value={target}
                            onChange={e => setTarget(e.target.value)}
                        />
                        <button type="submit" className="bg-primary text-primary-foreground px-4 rounded">Go</button>
                    </form>
                    <p className="text-xs text-muted-foreground mt-2">
                        Enter an IP or Session ID to perform a network analysis. Enter text to search post content.
                    </p>
                </div>

                <div className="border rounded p-4 bg-background">
                    <h3 className="font-bold mb-2 flex items-center gap-2"><ImageIcon size={18} /> Visual Search</h3>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90" />
                    {isUploading && <p className="text-sm mt-2">Scanning...</p>}
                </div>
            </div>

            <div className="border rounded p-4 bg-background min-h-[400px] overflow-y-auto">
                <h3 className="font-bold mb-4 border-b pb-2">Results</h3>

                {/* Text Search Results */}
                {textResults && (
                    <div className="space-y-4">
                        <h4 className="text-sm font-semibold text-muted-foreground">Found {textResults.length} posts matching text</h4>
                        {textResults.map(p => (
                            <div key={p.id} className="text-sm border p-2 rounded">
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>No. {p.id}</span>
                                    <span>{p.ip_address}</span>
                                </div>
                                <div>{p.content}</div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Investigation Results */}
                {invResults && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="bg-muted p-2 rounded">
                                <div className="font-bold">Related IPs ({invResults.related_ips.length})</div>
                                <div className="max-h-24 overflow-y-auto font-mono text-xs">
                                    {invResults.related_ips.map(ip => <div key={ip}>{ip}</div>)}
                                </div>
                            </div>
                            <div className="bg-muted p-2 rounded">
                                <div className="font-bold">Related Sessions ({invResults.related_sessions.length})</div>
                                <div className="max-h-24 overflow-y-auto font-mono text-xs">
                                    {invResults.related_sessions.map(s => <div key={s}>{s.substring(0, 12)}...</div>)}
                                </div>
                            </div>
                        </div>
                        {invResults.similar_images.length > 0 && (
                            <div>
                                <h4 className="font-bold text-sm mb-2">Linked Images (Visual Match)</h4>
                                <div className="flex flex-wrap gap-2">
                                    {invResults.similar_images.map(([pid, dist, url]) => (
                                        <div key={pid} className="relative group">
                                            <img src={url} className="w-16 h-16 object-cover rounded border" />
                                            <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[10px] px-1">{dist.toFixed(0)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Visual Search Results */}
                {visResults && (
                    <div className="space-y-2">
                        {visResults.map((res, i) => (
                            <div key={i} className="flex gap-3 border p-2 rounded hover:bg-muted/20">
                                <img src={res.image.thumbnail_url} className="w-16 h-16 object-cover rounded" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <div className="text-xs font-mono">Dist: {res.distance.toFixed(1)}</div>
                                        <div className="text-xs text-muted-foreground">{res.board_slug ? `/${res.board_slug}/` : ''} {res.post?.id}</div>
                                    </div>
                                    <p className="text-sm line-clamp-2 mt-1">{res.post?.content || 'No content'}</p>
                                </div>
                            </div>
                        ))}
                        {visResults.length === 0 && <p>No matches found.</p>}
                    </div>
                )}
            </div>
        </div>
    )
}
