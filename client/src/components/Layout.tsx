import { Outlet, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function Layout() {
    return (
        <div className="min-h-screen bg-background font-sans antialiased">
            <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container flex h-14 items-center">
                    <div className="mr-4 hidden md:flex">
                        <Link to="/" className="mr-6 flex items-center space-x-2">
              <span className="hidden font-bold sm:inline-block">
                kryivka.org
              </span>
                        </Link>
                        <nav className="flex items-center space-x-6 text-sm font-medium">
                            <Link to="/" className="transition-colors hover:text-foreground/80 text-foreground/60">Home</Link>
                        </nav>
                    </div>
                    <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
                        {/* Admin/Theme toggles could go here */}
                        <Button variant="ghost" size="sm">Login</Button>
                    </div>
                </div>
            </header>
            <main className="container py-6">
                <Outlet />
            </main>
        </div>
    )
}
