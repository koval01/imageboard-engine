import { Link, useLocation } from 'react-router-dom'
import { Moon, Sun, Hexagon } from 'lucide-react'
import React, { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Toaster } from 'sonner'

const PageTransition = ({ children }: { children: React.ReactNode }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 15, filter: 'blur(5px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -15, filter: 'blur(5px)' }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="w-full"
        >
            {children}
        </motion.div>
    )
}

export default function Layout({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<'light' | 'dark'>('light')
    const location = useLocation();

    useEffect(() => {
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
        <div className="min-h-screen bg-background font-sans text-foreground antialiased selection:bg-primary selection:text-primary-foreground flex flex-col">
            <Toaster position="top-center" richColors />

            <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
                <div className="container mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
                    <Link to="/" className="flex items-center gap-2 font-bold tracking-tight transition-all hover:opacity-80 hover:scale-105 active:scale-95">
                        <Hexagon className="h-6 w-6 stroke-[2.5px]" />
                        <span className="text-lg">KRYIVKA</span>
                    </Link>

                    <button
                        onClick={toggleTheme}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-transparent shadow-sm transition-all hover:bg-accent hover:text-accent-foreground hover:rotate-12 active:scale-90"
                    >
                        {theme === 'light' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    </button>
                </div>
            </header>

            <main className="flex-1 container mx-auto max-w-6xl p-4 md:py-8">
                <AnimatePresence mode='wait'>
                    <PageTransition key={location.pathname}>
                        {children}
                    </PageTransition>
                </AnimatePresence>
            </main>

            <footer className="border-t border-border/40 py-6 md:py-8 bg-muted/20">
                <div className="container mx-auto flex flex-col items-center justify-center gap-4 px-4 text-center md:flex-row md:justify-between">
                    <p className="text-sm text-muted-foreground">
                        © {new Date().getFullYear()} Kryivka.org. Уявіть що тут дуже діловий текст.
                    </p>
                    <div className="text-xs text-muted-foreground opacity-50">
                        Зліпили з гівна і палок
                    </div>
                </div>
            </footer>
        </div>
    )
}
