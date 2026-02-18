import { Outlet, Link } from 'react-router-dom'
import { useGetHomeQuery } from '@/store/apiSlice'

export default function Layout() {
    const { data } = useGetHomeQuery()

    return (
        <div className="min-h-screen bg-background text-foreground font-sans text-sm">
            {/* Header / Board List */}
            <header className="border-b border-border bg-card p-2 text-xs">
                <nav className="flex flex-wrap gap-2 text-muted-foreground">
                    <Link to="/" className="hover:text-primary font-bold">[Home]</Link>
                    {data?.boards.map((b) => (
                        <Link
                            key={b.model.slug}
                            to={`/${b.model.slug}`}
                            className="hover:text-primary"
                            title={b.model.name}
                        >
                            /{b.model.slug}/
                        </Link>
                    ))}
                </nav>
            </header>

            {/* Main Content */}
            <main className="p-4 max-w-7xl mx-auto w-full">
                <Outlet />
            </main>

            <footer className="p-8 text-center text-xs text-muted-foreground mt-8 border-t">
                <p>Imageboard Client © {new Date().getFullYear()}</p>
            </footer>
        </div>
    )
}
