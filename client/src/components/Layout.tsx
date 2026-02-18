import { Outlet, Link, ScrollRestoration } from 'react-router-dom'
import { Moon, Sun, Hexagon } from 'lucide-react'
import { useState, useEffect } from 'react'

export default function Layout() {
    const [theme, setTheme] = useState<'light' | 'dark'>('light')

    useEffect(() => {
        // Check system preference or localStorage
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            setTheme('dark')
            document.documentElement.classList.add('dark')
        }
    }, [])

    const toggleTheme = () => {
        if (theme === 'light') {
            setTheme('dark')
            document.documentElement.classList.add('dark')
        } else {
            setTheme('light')
            document.documentElement.classList.remove('dark')
        }
    }

    return (
        <div className="min-h-screen bg-background font-sans text-foreground antialiased selection:bg-primary selection:text-primary-foreground">
            <ScrollRestoration />

            {/* Header */}
            <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
                    <Link to="/" className="flex items-center gap-2 font-bold tracking-tight transition-opacity hover:opacity-80">
                        <Hexagon className="h-6 w-6" />
                        <span>KRYIVKA</span>
                    </Link>

                    <button
                        onClick={toggleTheme}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-transparent shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                        {theme === 'light' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto max-w-6xl p-4 md:py-8">
                <Outlet />
            </main>

            {/* Footer */}
            <footer className="border-t py-6 md:py-0">
                <div className="container mx-auto flex h-14 max-w-6xl flex-col items-center justify-between gap-4 px-4 md:h-16 md:flex-row">
                    <p className="text-sm text-muted-foreground">
                        Built with Rust & React.
                    </p>
                </div>
            </footer>
        </div>
    )
}
