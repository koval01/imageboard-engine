import { Link } from 'react-router-dom'
import Logo from '@/components/common/Logo'

export default function NotFoundPage() {
    return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
            <Logo size="catalog" />
            <p className="text-xl">Сторінку не знайдено</p>
            <p className="text-muted-foreground">Такої дошки чи треду немає.</p>
            <Link to="/">Повернутися на головну</Link>
        </div>
    )
}
