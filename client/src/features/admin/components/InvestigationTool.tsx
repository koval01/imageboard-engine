import { useState, useEffect } from 'react'
import { useLazyInvestigateQuery, useVisualSearchMutation, useLazySearchContentQuery } from '@/store/api/adminApi'
import { Search, ImageIcon } from 'lucide-react'

export default function InvestigationTool({ initialTarget }: { initialTarget: string }) {
    const [target, setTarget] = useState(initialTarget)
    const [triggerTextSearch, { data: textResults }] = useLazySearchContentQuery()
    const [triggerInvestigate, { data: invResults }] = useLazyInvestigateQuery()
    const [triggerVisual, { data: visResults, isLoading: isUploading }] = useVisualSearchMutation()

    useEffect(() => { if (initialTarget) handleSearch(initialTarget) }, [initialTarget])

    const handleSearch = (term: string) => {
        const isIp = term.includes('.') || term.includes(':')
        const isSession = term.length > 20 && !term.includes(' ')
        if (isIp || isSession) triggerInvestigate({ target: term })
        else triggerTextSearch({ query: term })
    }

    const onFormSubmit = (e: React.FormEvent) => { e.preventDefault(); handleSearch(target) }
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const fd = new FormData(); fd.append('file', e.target.files[0]);
            await triggerVisual(fd)
        }
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
                <div className="border rounded p-4 bg-background">
                    <h3 className="font-bold mb-2 flex items-center gap-2"><Search size={18} /> Пошук та Аналіз</h3>
                    <form onSubmit={onFormSubmit} className="flex gap-2">
                        <input className="border px-3 py-2 rounded w-full max-w-sm bg-background" placeholder="IP, Session ID або текст..." value={target} onChange={e => setTarget(e.target.value)} />
                        <button type="submit" className="bg-primary text-primary-foreground px-4 rounded cursor-pointer">Go</button>
                    </form>
                </div>
                <div className="border rounded p-4 bg-background">
                    <h3 className="font-bold mb-2 flex items-center gap-2"><ImageIcon size={18} /> Візуальний пошук</h3>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="block w-full text-sm" />
                    {isUploading && <p className="text-sm mt-2">Сканування...</p>}
                </div>
            </div>

            <div className="border rounded p-4 bg-background min-h-[400px] overflow-y-auto">
                <h3 className="font-bold mb-4 border-b pb-2">Результати</h3>
                {textResults && (
                    <div className="space-y-4">
                        <h4 className="text-sm font-semibold">Знайдено {textResults.length} постів</h4>
                        {textResults.map(p => (
                            <div key={p.id} className="text-sm border p-2 rounded">
                                <div className="text-xs text-muted-foreground">№ {p.id} • {p.ip_address}</div>
                                <div>{p.content}</div>
                            </div>
                        ))}
                    </div>
                )}
                {invResults && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="bg-muted p-2 rounded">
                                <div className="font-bold">IP ({invResults.related_ips.length})</div>
                                {invResults.related_ips.map(ip => <div key={ip}>{ip}</div>)}
                            </div>
                            <div className="bg-muted p-2 rounded">
                                <div className="font-bold">Sessions ({invResults.related_sessions.length})</div>
                                {invResults.related_sessions.map(s => <div key={s}>{s.substring(0, 12)}...</div>)}
                            </div>
                        </div>
                    </div>
                )}
                {visResults && visResults.map((res, i) => (
                    <div key={i} className="flex gap-3 border p-2 rounded mb-2">
                        <img src={res.image.thumbnail_url} className="w-16 h-16 object-cover rounded" alt="" />
                        <div className="text-sm">
                            <div>Відстань: {res.distance.toFixed(1)}</div>
                            <div className="text-xs">{res.post?.content}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
