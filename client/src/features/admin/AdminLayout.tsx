import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAdminLogoutMutation } from '@/store/api/adminApi'
import { LogOut } from 'lucide-react'
import DashboardStats from './components/DashboardStats'
import ReportsTable from './components/ReportsTable'
import LogsTable from './components/LogsTable'
import InvestigationTool from './components/InvestigationTool'

export default function AdminLayout() {
    const [searchParams] = useSearchParams()
    const urlTarget = searchParams.get('target')
    const [activeTab, setActiveTab] = useState<'overview' | 'reports' | 'logs' | 'investigate'>(
        urlTarget ? 'investigate' : 'overview'
    )
    const [logout] = useAdminLogoutMutation()

    const tabLabels = { overview: 'Огляд', reports: 'Скарги', logs: 'Логи', investigate: 'Розслідування' }

    return (
        <div className="container mx-auto p-4 max-w-7xl min-h-screen">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Адмін-панель</h1>
                <button onClick={() => logout()} className="flex items-center gap-2 px-3 py-1 rounded hover:bg-muted cursor-pointer border">
                    <LogOut size={16} /> Вийти
                </button>
            </div>
            <div className="flex gap-2 mb-6 border-b pb-2 overflow-x-auto">
                {(Object.keys(tabLabels) as Array<keyof typeof tabLabels>).map((tab) => (
                    <button
                        key={tab} onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 rounded capitalize cursor-pointer ${activeTab === tab ? 'bg-primary text-primary-foreground font-bold' : 'hover:bg-muted'}`}
                    >
                        {tabLabels[tab]}
                    </button>
                ))}
            </div>
            <div className="bg-card text-card-foreground rounded-lg shadow-sm border p-4">
                {activeTab === 'overview' && <DashboardStats />}
                {activeTab === 'reports' && <ReportsTable />}
                {activeTab === 'logs' && <LogsTable />}
                {activeTab === 'investigate' && <InvestigationTool initialTarget={urlTarget || ''} />}
            </div>
        </div>
    )
}
