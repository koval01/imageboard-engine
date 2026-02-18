import { Link, Outlet } from 'react-router-dom'
import { useGetHomeQuery } from '@/store/apiSlice'

export default function Layout() {
    const { data } = useGetHomeQuery()

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 font-sans">
            <header className="bg-neutral-900 text-white sticky top-0 z-50 border-b border-neutral-800 shadow-md">
                <div className="container mx-auto px-4 h-12 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link to="/" className="font-bold text-lg hover:text-blue-400 transition-colors">
                            kryivka.org
                        </Link>
                        <nav className="hidden md:flex gap-2 text-sm text-neutral-400">
                            {data?.boards.map((b) => (
                                <Link
                                    key={b.model.slug}
                                    to={`/${b.model.slug}`}
                                    className="hover:text-white transition-colors"
                                >
                                    /{b.model.slug}/
                                </Link>
                            ))}
                        </nav>
                    </div>
                    <div className="text-xs text-neutral-500">
                        {data?.admin_role ? <span className="text-red-500 font-bold">ADMIN MODE</span> : 'Guest'}
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-6">
                <Outlet />
            </main>

            <footer className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                <p>© {new Date().getFullYear()} Imageboard Engine</p>
            </footer>
        </div>
    )
}
