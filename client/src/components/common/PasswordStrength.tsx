import { passwordRules } from '@/lib/passwordPolicy'
import { cn } from '@/lib/utils'

type Props = {
    value: string
    username?: string
    className?: string
}

export default function PasswordStrength({ value, username, className }: Props) {
    const rules = passwordRules(value, username)
    const required = rules.filter((r) => r.required)
    const preferred = rules.filter((r) => !r.required)
    const passed = required.filter((r) => r.ok).length
    const ratio = value.length === 0 ? 0 : passed / required.length

    return (
        <div className={cn('mt-2 space-y-2', className)}>
            <div className="h-1.5 rounded bg-muted overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)} aria-label="Сила пароля">
                <div
                    className={cn(
                        'h-full transition-all',
                        ratio < 1 ? 'bg-destructive' : preferred.every((r) => r.ok) ? 'bg-green-600' : 'bg-amber-500',
                    )}
                    style={{ width: `${Math.round(ratio * 100)}%` }}
                />
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                {rules.map((rule) => (
                    <li
                        key={rule.id}
                        className={cn(
                            value.length === 0 ? 'text-muted-foreground' : rule.ok ? 'text-green-700 dark:text-green-400' : rule.required ? 'text-destructive' : 'text-amber-600',
                        )}
                    >
                        {rule.ok && value.length > 0 ? '✓' : '·'} {rule.label}
                    </li>
                ))}
            </ul>
        </div>
    )
}
