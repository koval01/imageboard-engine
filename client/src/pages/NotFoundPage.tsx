import { Link } from 'react-router-dom'

export default function NotFoundPage() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
            <h1 className="text-9xl font-black text-muted-foreground/20">404</h1>
            <p className="text-2xl font-semibold">Сторінку не знайдено</p>
            <Link to="/" className="text-primary hover:underline">
                Повернутися на головну
            </Link>
        </div>
    )
}
