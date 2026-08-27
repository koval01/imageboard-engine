import { useMemo, useState } from 'react'
import { useGetHomeQuery } from '@/store/api/boardApi'
import { Link } from 'react-router-dom'
import Logo from '@/components/common/Logo'
import { groupBoards } from '@/lib/boards'
import IbSpinner from '@/components/common/IbSpinner'

type BoardGroup = ReturnType<typeof groupBoards>[number]

export default function HomePage() {
    const { data, isLoading, error } = useGetHomeQuery()
    const [tab, setTab] = useState<'boards' | 'fresh'>('boards')
    const [filter, setFilter] = useState('')

    const groups = groupBoards(data?.boards ?? [])
    const columns = useMemo(() => {
        const buckets: BoardGroup[][] = [[], []]
        groups.forEach((g, i) => buckets[i % 2].push(g))
        return buckets.filter((c) => c.length > 0)
    }, [groups])

    const filteredBoards = useMemo(() => {
        const list = data?.boards ?? []
        const q = filter.trim().toLowerCase()
        if (!q) return list
        return list.filter(
            (b) =>
                b.model.slug.includes(q)
                || b.model.name.toLowerCase().includes(q)
                || b.model.description.toLowerCase().includes(q),
        )
    }, [data, filter])

    const totalPosts = data?.boards.reduce((n, b) => n + b.post_count, 0) ?? 0

    return (
        <div className="home">
            <header className="home-header">
                <h1 aria-label="Kryivka">
                    <Logo size="home" />
                </h1>
                <p className="home-sub">Ласкаво просимо. Знову.</p>
            </header>

            {isLoading && (
                <div className="mb-6 text-center">
                    <IbSpinner label="Завантаження…" />
                </div>
            )}
            {error && <div className="p-8 text-center text-destructive">Не вдалося завантажити дані.</div>}

            {data && (
                <main className="home-main">
                    <section className="main__block main__meta">
                        <p>
                            <span className="paragraph">Криївка</span>
                            {' '}
                            — це система форумів, де можна спілкуватися швидко і вільно, де будь-яка точка зору має право на життя. Тут немає реєстрації і підписуватися не потрібно, хоча це не звільняє від правил. Кожна дошка має власну тематику. Усе, що не заборонено правилами окремої дошки і стосується її теми, на цій дошці дозволено.
                        </p>
                        <p className="mt-3">Анонімний український іміджборд.</p>
                        <p className="mt-3">
                            Наразі відкрито <strong>{data.boards.length}</strong> дошок
                            {totalPosts > 0 && (
                                <>
                                    , залишено <strong>{totalPosts}</strong> постів
                                </>
                            )}
                            .
                        </p>
                    </section>

                    <section className="main__block boards">
                        {columns.map((col, i) => (
                            <div key={i} className="boards__col">
                                <ul className="boards__ul">
                                    {col.map((group) => (
                                        <li key={group.id}>
                                            <div className="boards__title">{group.title}</div>
                                            <ul>
                                                {group.items.map((b) => (
                                                    <li key={b.model.slug}>
                                                        <Link to={`/${b.model.slug}`}>
                                                            /{b.model.slug}/ — {b.model.name}
                                                        </Link>
                                                    </li>
                                                ))}
                                            </ul>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </section>

                    {data.recent_threads.length > 0 && (
                        <section className="main__block news">
                            <header className="main__title">Свіжі треди</header>
                            <div className="news__data">
                                {[0, 1].map((col) => (
                                    <ul key={col} className="news__col">
                                        {data.recent_threads
                                            .filter((_, i) => i % 2 === col)
                                            .map((t) => (
                                                <li key={t.id} className="news__item">
                                                    <Link
                                                        to={`/${t.board_slug}/thread/${t.id}`}
                                                        title={t.subject || t.content}
                                                    >
                                                        /{t.board_slug}/ {t.subject || t.content.slice(0, 72)}
                                                    </Link>
                                                </li>
                                            ))}
                                    </ul>
                                ))}
                            </div>
                        </section>
                    )}

                    <section className="main__block boardtbl">
                        <h2 className="main__title">Дошки</h2>
                        <div className="boardtbl__tabs">
                            <button
                                type="button"
                                className={tab === 'boards' ? 'is-active' : undefined}
                                onClick={() => setTab('boards')}
                            >
                                Дошки
                            </button>
                            <button
                                type="button"
                                className={tab === 'fresh' ? 'is-active' : undefined}
                                onClick={() => setTab('fresh')}
                            >
                                Свіжий контент
                            </button>
                        </div>

                        {tab === 'boards' && (
                            <>
                                <div className="boardtbl__filter">
                                    <input
                                        className="input"
                                        placeholder="Фільтр"
                                        size={8}
                                        value={filter}
                                        onChange={(e) => setFilter(e.target.value)}
                                    />
                                </div>
                                <table className="boardtbl__table">
                                    <thead>
                                        <tr>
                                            <th>Дошка</th>
                                            <th>Назва</th>
                                            <th>Опис</th>
                                            <th>Постів</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredBoards.map((b) => (
                                            <tr key={b.model.slug}>
                                                <td>
                                                    <Link to={`/${b.model.slug}`}>/{b.model.slug}/</Link>
                                                </td>
                                                <td>
                                                    <Link to={`/${b.model.slug}`}>{b.model.name}</Link>
                                                </td>
                                                <td>{b.model.description}</td>
                                                <td>{b.post_count}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </>
                        )}

                        {tab === 'fresh' && (
                            <div className="fresh-grid">
                                {data.recent_images.length === 0 && (
                                    <p className="text-muted-foreground">Поки немає зображень.</p>
                                )}
                                {data.recent_images.slice(0, 24).map((img) => (
                                    <Link
                                        key={img.id}
                                        to={`/${img.board_slug}/thread/${img.thread_id}`}
                                        className="fresh-grid__item"
                                    >
                                        <img
                                            src={`${data.cdn_url}/${img.thumbnail_url}`}
                                            alt=""
                                            loading="lazy"
                                        />
                                    </Link>
                                ))}
                            </div>
                        )}
                    </section>
                </main>
            )}
        </div>
    )
}
