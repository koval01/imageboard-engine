import { useState } from 'react'
import { useGetReportsQuery, useResolveReportMutation, useBanUserMutation, useDeleteContentMutation } from '@/store/api/adminApi'
import { format } from 'date-fns'
import { Ban, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'

export default function ReportsTable() {
    const [page, setPage] = useState(0)
    const [status, setStatus] = useState('OPEN')
    const { data, refetch } = useGetReportsQuery({ page, status })
    const [resolveReport] = useResolveReportMutation()
    const [banUser] = useBanUserMutation()
    const [delContent] = useDeleteContentMutation()

    const handleResolve = async (id: number, stat: string) => {
        await resolveReport({ report_id: id, status: stat })
        toast.success(`Скаргу позначено як ${stat === 'RESOLVED' ? 'розвʼязану' : 'відхилену'}`)
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
                    {([['OPEN', 'Відкриті'], ['RESOLVED', 'Розвʼязані'], ['REJECTED', 'Відхилені'], ['ALL', 'Усі']] as const).map(([value, label]) => (
                        <button key={value} onClick={() => { setStatus(value); setPage(0) }} className={`text-xs px-2 py-1 rounded border cursor-pointer ${status === value ? 'bg-secondary' : ''}`}>{label}</button>
                    ))}
                </div>
                <div className="space-x-2">
                    <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2 border rounded cursor-pointer disabled:opacity-50">&lt;</button>
                    <span>{page + 1} / {data.total_pages || 1}</span>
                    <button disabled={page >= data.total_pages - 1} onClick={() => setPage(p => p + 1)} className="px-2 border rounded cursor-pointer disabled:opacity-50">&gt;</button>
                </div>
            </div>

            <div className="space-y-4">
                {data.data.map(r => (
                    <div key={r.id} className="border p-4 rounded flex flex-col gap-2 relative bg-background">
                        <div className="flex justify-between items-start">
                            <div>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${r.status === 'OPEN' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>{r.status === 'OPEN' ? 'Відкрита' : r.status === 'RESOLVED' ? 'Розвʼязана' : r.status === 'REJECTED' ? 'Відхилена' : r.status}</span>
                                <span className="ml-2 text-sm text-muted-foreground">{format(new Date(r.created_at), 'dd.MM, HH:mm')}</span>
                                <div className="mt-1 font-medium">Причина: {r.reason}</div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => handleResolve(r.id, 'RESOLVED')} className="p-1 hover:bg-green-100 rounded text-green-600"><CheckCircle size={18} /></button>
                                <button onClick={() => handleResolve(r.id, 'REJECTED')} className="p-1 hover:bg-yellow-100 rounded text-yellow-600"><Ban size={18} /></button>
                            </div>
                        </div>
                        {r.post ? (
                            <div className="bg-muted p-3 rounded text-sm mt-2">
                                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                    <span>{r.board_slug ? `/${r.board_slug}/` : ''} &bull; № {r.post.id}</span>
                                    <span>{r.post.ip_address ? `IP: ${r.post.ip_address}` : ''}</span>
                                </div>
                                <div className="whitespace-pre-wrap">{r.post.content}</div>
                                <div className="mt-2">
                                    <button onClick={() => handleBan(r.post!.ip_address || '', r.post!.id)} className="text-xs bg-destructive text-destructive-foreground px-2 py-1 rounded flex items-center gap-1 cursor-pointer"><Ban size={12} /> Бан та Видалення</button>
                                </div>
                            </div>
                        ) : <div className="text-sm italic">Пост видалено</div>}
                    </div>
                ))}
            </div>
        </div>
    )
}
