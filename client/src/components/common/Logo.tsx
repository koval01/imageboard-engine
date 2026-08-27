import { useId } from 'react'
import { cn } from '@/lib/utils'

interface LogoProps {
    className?: string
    compact?: boolean
    wordmark?: boolean
    size?: 'home' | 'catalog' | 'board'
}

export default function Logo({ className, compact = false, wordmark = true, size }: LogoProps) {
    const gid = useId().replace(/:/g, '')
    const variant = size || (compact ? 'board' : 'home')
    const box =
        variant === 'home'
            ? 'h-20 w-auto'
            : variant === 'catalog'
                ? 'h-16 w-auto'
                : 'h-[72px] w-auto'

    if (!wordmark) {
        return (
            <span className={cn('logo inline-flex text-[hsl(var(--logo))]', className)}>
                <Bolt gid={gid} className="h-[72px] w-auto" />
            </span>
        )
    }

    return (
        <span className={cn('logo inline-flex text-[hsl(var(--logo))]', className)}>
            <svg viewBox="0 0 400 100" className={cn('shrink-0', box)} role="img" aria-hidden>
                <defs>
                    <linearGradient id={gid} x1="0.35" y1="1" x2="0.55" y2="0">
                        <stop offset="0" stopColor="#FE6E1F" />
                        <stop offset="0.25" stopColor="#FE8616" />
                        <stop offset="0.67" stopColor="#FFA00D" />
                        <stop offset="1" stopColor="#FFA90A" />
                    </linearGradient>
                </defs>
                <polygon fill={`url(#${gid})`} points="70,6 32,6 16,48 40,48 22,94 92,40 62,40 80,6" />
                <text
                    x="108"
                    y="72"
                    fill="currentColor"
                    fontFamily="Trebuchet MS, PT Sans, sans-serif"
                    fontSize="56"
                    fontWeight="700"
                    letterSpacing="-1.5"
                >
                    Криївка
                </text>
            </svg>
        </span>
    )
}

function Bolt({ gid, className }: { gid: string; className?: string }) {
    return (
        <svg viewBox="0 0 64 100" className={cn('w-auto shrink-0', className)} aria-hidden>
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
