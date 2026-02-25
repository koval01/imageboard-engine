import { Outlet } from "react-router-dom";

export function AppLayout() {
    return (
        <div className="min-h-screen bg-background bg-grid-pattern font-sans selection:bg-primary selection:text-primary-foreground">
            {/* Glass Header */}
            <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
                <div className="container flex h-14 max-w-screen-2xl items-center justify-between px-4 md:px-8">
                    <div className="flex items-center gap-4">
                        <a href="/" className="flex items-center gap-2 font-bold tracking-tight transition-colors hover:text-primary/80">
                            <div className="h-5 w-5 rounded-full bg-primary" /> {/* Minimal Logo */}
                            <span>kryivka</span>
                        </a>
                    </div>
                    <nav className="flex items-center gap-4 text-sm font-medium text-muted-foreground">
                        <a href="/" className="transition-colors hover:text-foreground">Home</a>
                        <a href="/boards" className="transition-colors hover:text-foreground">Boards</a>
                        {/* Add Theme Toggle Here */}
                    </nav>
                </div>
            </header>

            <main className="container max-w-screen-2xl p-4 md:p-8 animate-fade-in">
                <Outlet />
            </main>

            <footer className="border-t border-border/40 py-6 md:py-0">
                <div className="container flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row">
                    <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
                        Built with Rust & React. Engineering Beauty.
                    </p>
                </div>
            </footer>
        </div>
    );
}
