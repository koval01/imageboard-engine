import { Link, Outlet } from "react-router-dom"
import { ModeToggle } from "./mode-toggle"
import { Button } from "./ui/button"
import { Home } from "lucide-react"

export function Layout() {
    return (
        <div className="min-h-screen bg-background font-sans antialiased">
            <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container flex h-14 items-center">
                    <div className="mr-4 flex">
                        <Link to="/" className="mr-6 flex items-center space-x-2">
              <span className="hidden font-bold sm:inline-block">
                Ebala Imageboard
              </span>
                        </Link>
                        <nav className="flex items-center space-x-6 text-sm font-medium">
                            <Link
                                to="/"
                                className="transition-colors hover:text-foreground/80 text-foreground/60"
                            >
                                Home
                            </Link>
                        </nav>
                    </div>
                    <div className="flex flex-1 items-center justify-end space-x-2">
                        <nav className="flex items-center">
                            <Link to="/">
                                <Button variant="ghost" size="icon">
                                    <Home className="h-4 w-4" />
                                </Button>
                            </Link>
                            <ModeToggle />
                        </nav>
                    </div>
                </div>
            </header>
            <main className="container py-6">
                <Outlet />
            </main>
        </div>
    )
}
