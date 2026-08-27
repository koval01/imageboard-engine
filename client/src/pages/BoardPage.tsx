import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useGetBoardQuery, useLazyGetThreadQuery } from '@/store/api/boardApi'
import { ImageGallery } from '@/components/common/ImageGallery'
import { formatPostTime } from '@/lib/format'
import { PostContent } from '@/features/thread/components/PostContent'
import ThreadNav from '@/components/common/ThreadNav'
import IbSpinner from '@/components/common/IbSpinner'
import { isFaved, toggleFav } from '@/components/common/BoardWidget'
import type { PostItem } from '@/types/api'

const HIDDEN_KEY = 'kryivka-hidden'

function readHidden(): number[] {
    try {
        return JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')
    } catch {
        return []
    }
}

export default function BoardPage() {
    const { slug } = useParams<{ slug: string }>()
    const { data, isLoading, isFetching, error, refetch } = useGetBoardQuery(slug || '', { skip: !slug, refetchOnMountOrArgChange: true })
    const [loadThread] = useLazyGetThreadQuery()
    const [expanded, setExpanded] = useState<Record<number, PostItem[] | 'loading' | 'error'>>({})
    const [hidden, setHidden] = useState<number[]>(readHidden)
    const [favTick, setFavTick] = useState(0)
    const [search, setSearch] = useState('')

    const hideThread = (id: number) => {
        const next = hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id]
        setHidden(next)
        localStorage.setItem(HIDDEN_KEY, JSON.stringify(next))
    }

    const expandThread = async (id: number) => {
        if (expanded[id] === 'loading' || Array.isArray(expanded[id])) return
        setExpanded((prev) => ({ ...prev, [id]: 'loading' }))
        try {
            const res = await loadThread({ slug: slug!, id }).unwrap()
            setExpanded((prev) => ({ ...prev, [id]: res.replies }))
        } catch {
            setExpanded((prev) => ({ ...prev, [id]: 'error' }))
        }
    }

    const threads = useMemo(() => {
        const list = data?.threads ?? []
        const needle = search.trim().toLowerCase()
        if (!needle) return list
        return list.filter((t) =>
            (t.model.subject || '').toLowerCase().includes(needle)
            || t.model.content.toLowerCase().includes(needle),
        )
    }, [data, search])

    if (error && !data) return <div className="p-8 text-center text-destructive">Не вдалося завантажити вміст.</div>

    const nav = (
        <ThreadNav
            boardSlug={slug!}
            mode="board"
            onRefresh={() => refetch()}
            refreshing={isFetching && !isLoading}
            search={search}
            onSearch={setSearch}
        />
    )

    return (
        <div>
            {nav}

            <h2 className="mb-1 mt-1 text-[0.9em] text-muted-foreground">
                Активні треди{data ? `: ${threads.length}` : ''}
                {isLoading && !data && <IbSpinner className="ml-2" label="Завантаження…" />}
                {isFetching && !isLoading && <IbSpinner className="ml-2" label="завантаження постів…" />}
            </h2>

            {isLoading && !data && (
                <div className="space-y-2 py-1">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="ib-reply min-h-[72px] animate-pulse opacity-80">
                            <IbSpinner className="p-3" label="Завантаження тредів…" />
                        </div>
                    ))}
                </div>
            )}

            {threads.map((thread) => {
                if (hidden.includes(thread.model.id)) {
                    return (
                        <p key={thread.model.id} className="ib-missed py-1">
                            Приховано №{thread.model.id}.{' '}
                            <button type="button" className="text-primary" onClick={() => hideThread(thread.model.id)}>Показати</button>
                        </p>
                    )
                }

                const extra = expanded[thread.model.id]
                const omitted = thread.omitted_posts || Math.max(0, thread.reply_count - thread.replies_preview.length)
                const replies = Array.isArray(extra) ? extra : thread.replies_preview
                const faved = favTick >= 0 && isFaved(slug!, thread.model.id)

                return (
                    <article key={thread.model.id} className="thread">
                        <div className="ib-op post post_type_oppost">
                            <div className="post__details">
                                {thread.model.subject && (
                                    <span className="post__detailpart">
                                        <span className="ib-title post__title">{thread.model.subject}</span>
                                    </span>
                                )}
                                <span className="post__detailpart">
                                    <span className="post__anon">Анонім</span>
                                </span>
                                <span className="post__detailpart">
                                    <span className="post__time">{formatPostTime(thread.model.created_at)}</span>
                                </span>
                                <span className="post__detailpart">
                                    <Link
                                        to={`/${slug}/thread/${thread.model.id}`}
                                        data-testid="thread-link"
                                        className="post__reflink"
                                    >
                                        №{thread.model.id}
                                        <span className="sr-only">{thread.model.content}</span>
                                    </Link>
                                </span>
                                <span className="post__detailpart">
                                    <Link to={`/${slug}/thread/${thread.model.id}`}>Відповідь</Link>
                                </span>
                                <button
                                    type="button"
                                    className={faved ? 'text-primary' : undefined}
                                    title="Обране"
                                    onClick={() => {
                                        toggleFav({
                                            slug: slug!,
                                            id: thread.model.id,
                                            title: thread.model.subject || thread.model.content.slice(0, 60),
                                        })
                                        setFavTick((n) => n + 1)
                                    }}
                                >
                                    {faved ? '★' : '☆'}
                                </button>
                                <button type="button" title="Приховати" onClick={() => hideThread(thread.model.id)}>[-]</button>
                            </div>

                            <div className="post__message clearfix">
                                {thread.images.length > 0 && (
                                    <ImageGallery
                                        images={thread.images}
                                        cdnUrl={data!.cdn_url}
                                        interactive={false}
                                        to={`/${slug}/thread/${thread.model.id}`}
                                    />
                                )}
                                <blockquote className="post__comment">
                                    <PostContent
                                        content={thread.model.content}
                                        boardSlug={slug!}
                                        currentThreadId={thread.model.id}
                                    />
                                </blockquote>
                            </div>
                        </div>

                        {omitted > 0 && !Array.isArray(extra) && (
                            <p className="ib-missed">
                                <button type="button" onClick={() => expandThread(thread.model.id)} title="Розгорнути">
                                    {extra === 'loading' ? <IbSpinner label="завантаження постів…" /> : '[+]'}
                                </button>
                                {' '}
                                Пропущено {omitted} постів
                                {thread.omitted_images > 0 ? `, ${thread.omitted_images} з картинками.` : '.'}
                                {' '}
                                <Link to={`/${slug}/thread/${thread.model.id}`}>У тред</Link>
                                {extra === 'error' && <span className="text-destructive"> Не вдалося розгорнути.</span>}
                            </p>
                        )}

                        {extra === 'loading' && (
                            <div className="ib-reply min-h-[56px] animate-pulse">
                                <IbSpinner className="p-2" label="завантаження постів…" />
                            </div>
                        )}

                        {replies.map((reply) => (
                            <div key={reply.model.id} className="ib-reply post post_type_reply">
                                <div className="post__details">
                                    <span className="post__detailpart">
                                        <span className="post__anon">Анонім</span>
                                    </span>
                                    <span className="post__detailpart">
                                        <span className="post__time">{formatPostTime(reply.model.created_at)}</span>
                                    </span>
                                    <span className="post__detailpart">
                                        <Link
                                            to={`/${slug}/thread/${thread.model.id}#p${reply.model.id}`}
                                            className="post__reflink"
                                        >
                                            №{reply.model.id}
                                        </Link>
                                    </span>
                                    <span className="post__detailpart">
                                        <Link to={`/${slug}/thread/${thread.model.id}#p${reply.model.id}`}>Відповідь</Link>
                                    </span>
                                </div>
                                <div className="post__message clearfix">
                                    {reply.images?.length > 0 && (
                                        <ImageGallery images={reply.images} cdnUrl={reply.cdn_url || data!.cdn_url} interactive={false} />
                                    )}
                                    <blockquote className="post__comment">
                                        <PostContent
                                            content={reply.model.content}
                                            boardSlug={slug!}
                                            currentThreadId={thread.model.id}
                                        />
                                    </blockquote>
                                </div>
                            </div>
                        ))}

                        <hr />
                    </article>
                )
            })}

            {data && nav}
        </div>
    )
}
