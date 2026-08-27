import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useGetHomeQuery } from '@/store/api/boardApi'
import { RefreshCcw } from 'lucide-react'

const FAV_KEY = 'kryivka-favs'

export type FavThread = { slug: string; id: number; title: string }

export function readFavs(): FavThread[] {
    try {
        const raw = localStorage.getItem(FAV_KEY)
        return raw ? JSON.parse(raw) : []
    } catch {
        return []
    }
}

export function toggleFav(item: FavThread): FavThread[] {
    const next = readFavs()
    const idx = next.findIndex((f) => f.slug === item.slug && f.id === item.id)
    if (idx >= 0) next.splice(idx, 1)
    else next.unshift(item)
    localStorage.setItem(FAV_KEY, JSON.stringify(next.slice(0, 30)))
    window.dispatchEvent(new Event('kryivka-favs'))
    return next
}

export function isFaved(slug: string, id: number) {
    return readFavs().some((f) => f.slug === slug && f.id === id)
}

export default function BoardWidget() {
    const { data, refetch, isFetching } = useGetHomeQuery()
    const [favs, setFavs] = useState<FavThread[]>([])
    const [tab, setTab] = useState<'fav' | 'top'>('top')
    const [open, setOpen] = useState(false)

    useEffect(() => {
        setFavs(readFavs())
        const onChange = () => setFavs(readFavs())
        window.addEventListener('kryivka-favs', onChange)
        return () => window.removeEventListener('kryivka-favs', onChange)
    }, [])

    const threads = data?.recent_threads ?? []

    return (
        <aside className="bb ib-widget">
            <div
                className="bb__header"
                onClick={() => setOpen((v) => !v)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setOpen((v) => !v)
                    }
                }}
                role="button"
                tabIndex={0}
            >
                <button type="button" className={tab === 'fav' ? 'font-bold' : ''} onClick={(e) => { e.stopPropagation(); setTab('fav'); setOpen(true) }}>
                    Обране
                </button>
                {' / '}
                <button type="button" className={tab === 'top' ? 'font-bold' : ''} onClick={(e) => { e.stopPropagation(); setTab('top'); setOpen(true) }}>
                    Свіжі треди
                </button>
                <button
                    type="button"
                    className="bb__update"
                    title="Оновити"
                    onClick={(e) => {
                        e.stopPropagation()
                        refetch()
                    }}
                >
                    <RefreshCcw className={isFetching ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
                </button>
            </div>
            {open && (
                <ul className="bb__panels">
                    {tab === 'fav' && (favs.length === 0
                        ? <li className="text-muted-foreground">Порожньо. Натисніть ★ у треді.</li>
                        : favs.map((f) => (
                            <li key={`${f.slug}-${f.id}`} className="truncate py-0.5">
                                <Link to={`/${f.slug}/thread/${f.id}`}>{f.title || `/${f.slug}/ №${f.id}`}</Link>
                            </li>
                        )))}
                    {tab === 'top' && (threads.length === 0
                        ? <li className="text-muted-foreground">Немає тредів.</li>
                        : threads.slice(0, 12).map((t) => (
                            <li key={t.id} className="truncate py-0.5">
                                <Link to={`/${t.board_slug}/thread/${t.id}`}>
                                    /{t.board_slug}/ {t.subject || t.content.slice(0, 48)}
                                </Link>
                            </li>
                        )))}
                </ul>
            )}
        </aside>
    )
}
