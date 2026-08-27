import { Link, useLocation } from 'react-router-dom'
import React, { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { useGetHomeQuery, useGetRestrictionQuery } from '@/store/api/boardApi'
import { groupBoards } from '@/lib/boards'
import Logo from '@/components/common/Logo'
import ThemeToggle from '@/components/common/ThemeToggle'
import LoadingBar from '@/components/common/LoadingBar'
import BoardWidget from '@/components/common/BoardWidget'
import { PostFormProvider, usePostForm } from '@/components/common/PostFormContext'
import PostForm from '@/features/posting/components/PostForm'
import { cn } from '@/lib/utils'

function PingIndicator() {
    const [ms, setMs] = useState<number | null>(null)
    const origin = import.meta.env.VITE_API_ORIGIN || ''

    useEffect(() => {
        let cancelled = false
        const ping = async () => {
            const started = performance.now()
            try {
                await fetch(`${origin}/api/health`, { cache: 'no-store' })
                if (!cancelled) setMs(Math.round(performance.now() - started))
            } catch {
                if (!cancelled) setMs(null)
            }
        }
        ping()
        const id = window.setInterval(ping, 15000)
        return () => {
            cancelled = true
            window.clearInterval(id)
        }
    }, [origin])

    return (
        <span className="footer-ping" title="Затримка відповіді API">
            {ms === null ? '—' : `${ms} мс`}
        </span>
    )
}
function applyTheme(theme: 'light' | 'dark') {
    const root = document.documentElement
    if (theme === 'dark') {
        root.classList.add('dark')
        root.setAttribute('data-theme', 'nightmode')
    } else {
        root.classList.remove('dark')
        root.removeAttribute('data-theme')
    }
    localStorage.setItem('kryivka-theme', theme)
}

function readTheme(): 'light' | 'dark' {
    try {
        const stored = localStorage.getItem('kryivka-theme')
        if (stored === 'dark' || stored === 'light') return stored
    } catch {
        /* ignore */
    }
    return 'dark'
}

function BoardShell({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<'light' | 'dark'>('dark')
    const location = useLocation()
    const { data } = useGetHomeQuery()
    const { open, toggle, setOpen, quoteInsert, consumeQuote } = usePostForm()

    const pathParts = location.pathname.split('/').filter(Boolean)
    const isHome = pathParts.length === 0
    const isAdmin = pathParts[0] === 'admin'
    const slug = !isHome && !isAdmin ? pathParts[0] : undefined
    const { data: restriction } = useGetRestrictionQuery(slug ? { board: slug } : undefined)
    const isCatalog = Boolean(slug) && pathParts[1] === 'catalog'
    const isThread = Boolean(slug) && pathParts[1] === 'thread'
    const threadId = isThread ? Number(pathParts[2]) : undefined
    const showBoardShell = Boolean(slug) && !isCatalog && !isAdmin
    const board = data?.boards.find((b) => b.model.slug === slug)?.model
    const groups = groupBoards(data?.boards ?? [])

    useEffect(() => {
        const initial = readTheme()
        setTheme(initial)
        applyTheme(initial)
    }, [])

    useEffect(() => {
        if (isHome) document.title = 'Криївка'
        else if (isAdmin) document.title = 'Адмінка — Криївка'
        else if (isCatalog && board) document.title = `Каталог /${board.slug}/ — Криївка`
        else if (isThread && board) document.title = `/${board.slug}/ — ${board.name} — Криївка`
        else if (board) document.title = `/${board.slug}/ — ${board.name} — Криївка`
        else if (slug) document.title = `/${slug}/ — Криївка`
    }, [isHome, isAdmin, isCatalog, board, slug])

    useEffect(() => {
        setOpen(location.hash === '#post-form' || location.hash === '#reply-form')
        // Close the form on route changes; hash on the same page is handled by toggle().
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname])

    const toggleTheme = () => {
        const next = theme === 'light' ? 'dark' : 'light'
        setTheme(next)
        applyTheme(next)
    }

    const viewBlocked = Boolean(restriction?.viewing_blocked) && !isAdmin
    const postBlocked = Boolean(restriction?.posting_blocked) && !isAdmin && !viewBlocked

    return (
        <div className="flex min-h-screen flex-col bg-background text-foreground">
            <Toaster position="top-center" richColors />
            <LoadingBar />

            {(isHome || isCatalog) && (
                <div className="absolute right-3 top-3 z-20">
                    <ThemeToggle theme={theme} onToggle={toggleTheme} />
                </div>
            )}
            {!isHome && !isCatalog && (
                <header className="header">
                    <div className="header__menu">
                        <nav className="header__menu-left">
                            <Link to="/" className="header__menuitem">Головна</Link>
                            {data?.boards.length ? (
                                <span className="header__myboards">
                                    [{' '}
                                    {data.boards.map((b, i) => (
                                        <span key={b.model.slug}>
                                            {i > 0 && ' / '}
                                            <Link
                                                to={`/${b.model.slug}`}
                                                className={cn(slug === b.model.slug && 'font-bold')}
                                            >
                                                {b.model.slug}
                                            </Link>
                                        </span>
                                    ))}
                                    {' '}]
                                </span>
                            ) : null}
                            {slug && !isCatalog && (
                                <Link to={`/${slug}/catalog`} className="header__menuitem">Каталог</Link>
                            )}
                            {isAdmin && <span className="text-muted-foreground">Адмінка</span>}
                        </nav>
                        <ThemeToggle theme={theme} onToggle={toggleTheme} />
                    </div>
                </header>
            )}

            {showBoardShell && (
                <div className="header__board">
                    <Link to={`/${slug}`} className="header__logo" title={`/${slug}/`}>
                        <span className="header__banner">
                            <Logo size="board" />
                        </span>
                    </Link>
                    <h1 className="header__title">
                        <Link to={`/${slug}`}>{board?.name || `/${slug}/`}</Link>
                    </h1>
                    <div className="header__newpost">
                        <a
                            className="ib-newpost"
                            href={isThread ? '#reply-form' : '#post-form'}
                            onClick={(e) => {
                                e.preventDefault()
                                toggle()
                            }}
                        >
                            {open
                                ? 'Закрити форму постингу'
                                : isThread
                                    ? 'Відповісти в тред'
                                    : 'Створити тред'}
                        </a>
                    </div>
                    {open && slug && (
                        <PostForm
                            boardSlug={slug}
                            threadId={Number.isFinite(threadId) ? threadId : undefined}
                            fileInputId={isThread ? 'file-upload' : 'file-upload-new'}
                            quoteInsert={quoteInsert}
                            onQuoteConsumed={consumeQuote}
                            onSuccess={() => {
                                if (!isThread) setOpen(false)
                            }}
                        />
                    )}
                    <hr />
                </div>
            )}

            <div className={cn('cntnt flex flex-1', showBoardShell && 'flex-row')}>
                {showBoardShell && (
                    <aside className="sidebar">
                        {groups.map((group) => (
                            <div key={group.id} className="fm__item">
                                <div className="fm__header">{group.title}</div>
                                <ul className="fm__sub">
                                    {group.items.map((b) => (
                                        <li key={b.model.slug}>
                                            <Link to={`/${b.model.slug}`}>
                                                /{b.model.slug}/ — {b.model.name}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </aside>
                )}

                <main className={cn('cntnt__main min-w-0 flex-1', isHome ? '' : isAdmin ? 'p-3' : isCatalog ? '' : 'pt-1')}>
                    {postBlocked && (
                        <div className="ban-banner" role="status">
                            Вам заборонено створювати контент
                            {restriction?.scope === 'board' && restriction.board_slug ? ` на /${restriction.board_slug}/` : ''}
                            {restriction?.reason ? `: ${restriction.reason}` : '.'}
                            {restriction?.expires_at ? ` До ${new Date(restriction.expires_at).toLocaleString('uk-UA')}.` : ''}
                        </div>
                    )}
                    {viewBlocked ? (
                        <div className="ban-page" role="alert">
                            <h1>Доступ обмежено</h1>
                            <p>
                                Перегляд
                                {restriction?.scope === 'board' && restriction.board_slug ? ` /${restriction.board_slug}/` : ' сайту'}
                                {' '}заблоковано
                                {restriction?.reason ? `: ${restriction.reason}` : '.'}
                            </p>
                            {restriction?.expires_at && (
                                <p className="text-muted-foreground text-sm">До {new Date(restriction.expires_at).toLocaleString('uk-UA')}</p>
                            )}
                        </div>
                    ) : children}
                </main>
            </div>

            {showBoardShell && <BoardWidget />}
            {showBoardShell && (
                <>
                    <button
                        type="button"
                        className="na na_type_up"
                        title="Наверх"
                        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    >
                        ↑
                    </button>
                    <button
                        type="button"
                        className="na na_type_down"
                        title="Вниз"
                        onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}
                    >
                        ↓
                    </button>
                </>
            )}

            <footer className="home-footer">
                <p>
                    {isHome ? (
                        'kryivka.org'
                    ) : (
                        <>
                            <Link to="/">головна</Link>
                            {' / '}
                            kryivka.org
                        </>
                    )}
                    <PingIndicator />
                </p>
            </footer>
        </div>
    )
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <PostFormProvider>
            <BoardShell>{children}</BoardShell>
        </PostFormProvider>
    )
}
