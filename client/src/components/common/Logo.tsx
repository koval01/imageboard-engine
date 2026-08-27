import { useId } from 'react'
import { cn } from '@/lib/utils'

interface LogoProps {
    className?: string
    compact?: boolean
    wordmark?: boolean
    size?: 'home' | 'catalog' | 'board'
}

const sizes = {
    home: { bolt: 'h-20', text: 'text-[2.75rem] sm:text-5xl' },
    catalog: { bolt: 'h-16', text: 'text-4xl' },
    board: { bolt: 'h-[72px]', text: 'text-[2.5rem]' },
} as const

export default function Logo({ className, compact = false, wordmark = true, size }: LogoProps) {
    const gid = useId().replace(/:/g, '')
    const variant = size || (compact ? 'board' : 'home')
    const { bolt, text } = sizes[variant]

    return (
        <span className={cn('logo inline-flex items-center gap-3 text-[hsl(var(--logo))]', className)}>
            <Bolt gid={gid} className={bolt} />
            {wordmark && (
                <span className={cn('select-none font-bold leading-none tracking-tight', text)}>
                    Криївка
                </span>
            )}
        </span>
    )
}

function Bolt({ gid, className }: { gid: string; className?: string }) {
    return (
        <svg
            viewBox="0 0 64 100"
            width={64}
            height={100}
            className={cn('inline-block w-auto shrink-0', className)}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden
        >
            <defs>
                <linearGradient id={gid} x1="0.35" y1="1" x2="0.55" y2="0">
                    <stop offset="0" stopColor="#FE6E1F" />
                    <stop offset="0.25" stopColor="#FE8616" />
                    <stop offset="0.67" stopColor="#FFA00D" />
                    <stop offset="1" stopColor="#FFA90A" />
                </linearGradient>
            </defs>
            <polygon fill={`url(#${gid})`} points="44,2 16,2 4,46 22,46 8,98 60,38 36,38 50,2" />
        </svg>
    )
}
