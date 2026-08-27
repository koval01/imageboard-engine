import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useGetBoardQuery } from '@/store/api/boardApi'
import Logo from '@/components/common/Logo'
import IbSpinner from '@/components/common/IbSpinner'
import type { ThreadItem } from '@/types/api'

type SortKey = 'bump' | 'time' | 'posts'

export default function CatalogPage() {
    const { slug } = useParams<{ slug: string }>()
    const { data, isLoading, error } = useGetBoardQuery(slug || '', { skip: !slug })
    const [q, setQ] = useState('')
    const [sort, setSort] = useState<SortKey>('bump')

    const threads = useMemo(() => {
        let list = [...(data?.threads ?? [])]
        const needle = q.trim().toLowerCase()
        if (needle) {
            list = list.filter((t) =>
                (t.model.subject || '').toLowerCase().includes(needle)
                || t.model.content.toLowerCase().includes(needle),
            )
        }
        if (sort === 'time') {
            list.sort((a, b) => +new Date(b.model.created_at) - +new Date(a.model.created_at))
        } else if (sort === 'posts') {
            list.sort((a, b) => b.reply_count - a.reply_count)
        }
        return list
    }, [data, q, sort])

    return (
        <div className="ctlg-page">
            <header className="ctlg-head">
                <Link to="/" className="logo header__logo">
                    <Logo size="catalog" />
                </Link>
                <h1 className="ctlg-title">
                    <Link to={`/${slug}/catalog`}>Каталог /{slug}/</Link>
                </h1>
                <div className="ctlg-bar">
                    <div className="header__ctlgnav">
                        <Link to={`/${slug}`}>← На дошку</Link>
                    </div>
                    <select
                        className="input ctlg-sort"
                        value={sort}
                        onChange={(e) => setSort(e.target.value as SortKey)}
                        aria-label="Сортування"
                    >
                        <option value="bump">За бампами</option>
                        <option value="time">За часом</option>
                        <option value="posts">За кількістю постів</option>
                    </select>
                    <input
                        type="text"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Пошук..."
                        className="input ctlg-search"
                    />
                </div>
            </header>

            {isLoading && <div className="py-8 text-center"><IbSpinner label="Завантаження…" /></div>}
            {error && <div className="p-8 text-center text-destructive">Не вдалося завантажити каталог.</div>}

            <div className="ctlg">
                {threads.map((thread) => (
                    <CatalogCard key={thread.model.id} thread={thread} slug={slug!} cdnUrl={data?.cdn_url || ''} />
                ))}
            </div>
            {!isLoading && !error && threads.length === 0 && (
                <p className="py-8 text-center text-muted-foreground">Немає тредів.</p>
            )}
        </div>
    )
}

function CatalogCard({ thread, slug, cdnUrl }: { thread: ThreadItem; slug: string; cdnUrl: string }) {
    const thumb = thread.images[0]
    const snippet = thread.model.content.slice(0, 220)

    return (
        <Link
            to={`/${slug}/thread/${thread.model.id}`}
            className="ctlg__thread"
            data-testid="thread-link"
        >
            {thumb && cdnUrl && (
                <img
                    className="ctlg__img"
                    src={`${cdnUrl}/${thumb.thumbnail_url}`}
                    alt=""
                    loading="lazy"
                />
            )}
            <div className="ctlg__meta">
                Постів: {thread.reply_count + 1} / Файлів: {thread.image_count + thread.images.length}
            </div>
            {thread.model.subject && <div className="ctlg__title">{thread.model.subject}</div>}
            <div className="ctlg__comment">
                <CatalogSnippet text={snippet} />
            </div>
            <span className="sr-only">{thread.model.content}</span>
        </Link>
    )
}

function CatalogSnippet({ text }: { text: string }) {
    const parts = text.split(/(>>\d+)/g)
    return (
        <>
            {parts.map((part, i) =>
                /^>>\d+$/.test(part)
                    ? <span key={i} className="post-reply-link">{part}</span>
                    : <span key={i}>{part}</span>,
            )}
        </>
    )
}
