import { cn } from '@/lib/utils'

export default function IbSpinner({ className, label }: { className?: string; label?: string }) {
    return (
        <span className={cn('inline-flex items-center gap-1.5 text-muted-foreground', className)}>
            <span className="ib-spinner" aria-hidden />
            {label && <span>{label}</span>}
        </span>
    )
}
