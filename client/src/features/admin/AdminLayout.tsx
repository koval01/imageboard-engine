import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAdminLogoutMutation, useCheckAdminQuery } from '@/store/api/adminApi'
import { LogOut } from 'lucide-react'
import DashboardStats from './components/DashboardStats'
import ReportsTable from './components/ReportsTable'
import LogsTable from './components/LogsTable'
import InvestigationTool from './components/InvestigationTool'
import BansPanel from './components/BansPanel'
import StaffPanel from './components/StaffPanel'
import SettingsPanel from './components/SettingsPanel'

type Tab = 'overview' | 'reports' | 'logs' | 'investigate' | 'bans' | 'staff' | 'settings'

export default function AdminLayout() {
    const [searchParams] = useSearchParams()
    const urlTarget = searchParams.get('target')
    const { data: status, isError, error } = useCheckAdminQuery()
    const [activeTab, setActiveTab] = useState<Tab>(urlTarget ? 'investigate' : 'overview')
    const [logout] = useAdminLogoutMutation()

    useEffect(() => {
        if (!isError) return
        const code = (error as { status?: number } | undefined)?.status
        if (code === 401 || code === 403) window.location.assign('/admin')
    }, [isError, error])

    useEffect(() => {
        if (status && status.role < 1) window.location.assign('/admin')
    }, [status])
    const canManage = Boolean(status?.privileges?.manage_staff)
    const canInvestigate = Boolean(status?.privileges?.view_ip)

    const tabLabels: Partial<Record<Tab, string>> = {
        overview: 'Огляд',
        reports: 'Скарги',
        logs: 'Логи',
        bans: 'Бани',
        ...(canInvestigate ? { investigate: 'Розслідування' } : {}),
        ...(canManage ? { staff: 'Персонал' } : {}),
        settings: 'Налаштування',
    }

    return (
        <div className="container mx-auto p-4 max-w-7xl min-h-screen">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold">Адмін-панель</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {status?.username}
                        {status?.hours_active === false && (
                            <span className="ml-2 text-destructive">Поза робочими годинами — дії вимкнено</span>
                        )}
                    </p>
                </div>
                <button
                    onClick={async () => {
                        await logout()
                        window.location.assign('/admin')
                    }}
                    className="flex items-center gap-2 px-3 py-1 rounded hover:bg-muted cursor-pointer border"
                >
                    <LogOut size={16} /> Вийти
                </button>
            </div>
            <div className="flex gap-2 mb-6 border-b pb-2 overflow-x-auto">
                {(Object.keys(tabLabels) as Tab[]).map((tab) => (
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
                {activeTab === 'bans' && <BansPanel />}
                {activeTab === 'investigate' && canInvestigate && <InvestigationTool initialTarget={urlTarget || ''} />}
                {activeTab === 'staff' && canManage && <StaffPanel />}
                {activeTab === 'settings' && <SettingsPanel />}
            </div>
        </div>
    )
}
