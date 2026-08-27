import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import IbSpinner from './IbSpinner'

interface ThreadNavProps {
    boardSlug: string
    onRefresh?: () => void
    refreshing?: boolean
    mode?: 'board' | 'thread'
    autoUpdate?: boolean
    onAutoUpdate?: (value: boolean) => void
    search?: string
    onSearch?: (value: string) => void
    onReply?: () => void
}

function toggleSidebar() {
    document.documentElement.classList.toggle('fm-collapsed')
}

export default function ThreadNav({
    boardSlug,
    onRefresh,
    refreshing,
    mode = 'board',
    autoUpdate,
    onAutoUpdate,
    search,
    onSearch,
    onReply,
}: ThreadNavProps) {
    const [collapsed, setCollapsed] = useState(() => document.documentElement.classList.contains('fm-collapsed'))

    useEffect(() => {
        const sync = () => setCollapsed(document.documentElement.classList.contains('fm-collapsed'))
        window.addEventListener('resize', sync)
        return () => window.removeEventListener('resize', sync)
    }, [])

    if (mode === 'board') {
        return (
            <nav className="tn">
                <button
                    type="button"
                    className="tn__item desktop"
                    title={collapsed ? 'Показати меню' : 'Сховати меню'}
                    onClick={() => {
                        toggleSidebar()
                        setCollapsed((v) => !v)
                    }}
                >
                    {collapsed ? '>>' : '<<'}
                </button>
                {onSearch && (
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => onSearch(e.target.value)}
                        placeholder="Пошук [enter]"
                        className="input tn__search"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') e.preventDefault()
                        }}
                    />
                )}
                <Link to={`/${boardSlug}/catalog`} className="tn__item">Каталог</Link>
            </nav>
        )
    }

    return (
        <nav className="tn tn_thread">
            {onSearch && (
                <input
                    type="search"
                    value={search}
                    onChange={(e) => onSearch(e.target.value)}
                    placeholder="Пошук [enter]"
                    className="input tn__search"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') e.preventDefault()
                    }}
                />
            )}
            <Link to={`/${boardSlug}`} className="tn__item">Назад</Link>
            <span className="tn__sep">|</span>
            <button type="button" className="tn__item" onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}>
                Вниз
            </button>
            <span className="tn__sep">|</span>
            <Link to={`/${boardSlug}/catalog`} className="tn__item">Каталог</Link>
            {onRefresh && (
                <>
                    <span className="tn__sep">|</span>
                    <button type="button" className="tn__item" onClick={onRefresh} disabled={refreshing}>
                        {refreshing ? <IbSpinner label="Оновлення…" /> : 'Оновити'}
                    </button>
                </>
            )}
            {onAutoUpdate && (
                <label className="tn__item tn__auto">
                    <input type="checkbox" checked={!!autoUpdate} onChange={(e) => onAutoUpdate(e.target.checked)} />
                    Автооновлення
                </label>
            )}
            {onReply && (
                <>
                    <span className="tn__sep">|</span>
                    <button type="button" className="tn__item" onClick={onReply}>
                        Відповісти
                    </button>
                </>
            )}
        </nav>
    )
}
