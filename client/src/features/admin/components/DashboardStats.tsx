import { useGetAdminStatsQuery } from '@/store/api/adminApi'
import { AlertTriangle, Ban, Eye, FileText } from 'lucide-react'

export default function DashboardStats() {
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
