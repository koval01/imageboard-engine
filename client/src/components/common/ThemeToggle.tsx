import { cn } from '@/lib/utils'

interface ThemeToggleProps {
    theme: 'light' | 'dark'
    onToggle: () => void
    className?: string
}

export default function ThemeToggle({ theme, onToggle, className }: ThemeToggleProps) {
    const dark = theme === 'dark'
    return (
        <button
            type="button"
            onClick={onToggle}
            className={cn('nm inline-flex items-center gap-1.5 text-muted-foreground', className)}
            title={dark ? 'Денна тема' : 'Нічна тема'}
            aria-label={dark ? 'Денна тема' : 'Нічна тема'}
        >
            <span className={cn('nm-switch', dark && 'nm-switch-on')}>
                <span className="nm-bullet" />
            </span>
        </button>
    )
}
