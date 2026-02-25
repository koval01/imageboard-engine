import { useState } from 'react'
import { useGetAdminLogsQuery } from '@/store/api/adminApi'
import { format } from 'date-fns'

export default function LogsTable() {
    const [page, setPage] = useState(0)
    const [search, setSearch] = useState('')
    const { data } = useGetAdminLogsQuery({ page, search })

    return (
        <div>
            <div className="flex gap-2 mb-4">
                <input type="text" placeholder="Пошук..." className="border px-3 py-2 rounded w-full max-w-sm bg-background" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="rounded border overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-muted">
                    <tr><th className="p-2 text-left">Час</th><th className="p-2 text-left">Адмін</th><th className="p-2 text-left">Дія</th><th className="p-2 text-left">Деталі</th></tr>
                    </thead>
                    <tbody>
                    {data?.data.map(log => (
                        <tr key={log.id} className="border-t hover:bg-muted/50">
                            <td className="p-2 font-mono text-xs">{format(new Date(log.created_at), 'dd.MM HH:mm')}</td>
                            <td className="p-2">{log.admin_username}</td>
                            <td className="p-2 font-bold text-xs">{log.action}</td>
                            <td className="p-2 text-muted-foreground truncate max-w-[200px]">{log.details}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
