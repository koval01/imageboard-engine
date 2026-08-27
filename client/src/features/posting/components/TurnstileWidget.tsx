import { useEffect, useRef } from 'react'

declare global {
    interface Window {
        turnstile?: {
            render: (
                el: HTMLElement,
                opts: {
                    sitekey: string
                    callback?: (token: string) => void
                    'expired-callback'?: () => void
                    'error-callback'?: () => void
                    theme?: 'auto' | 'light' | 'dark'
                    size?: 'normal' | 'compact' | 'flexible'
                    action?: string
                },
            ) => string
            remove: (id: string) => void
            reset: (id: string) => void
        }
    }
}

function loadScript(): Promise<void> {
    if (window.turnstile) return Promise.resolve()
    const existing = document.querySelector<HTMLScriptElement>('script[data-cf-turnstile]')
    if (existing) {
        return new Promise((resolve, reject) => {
            existing.addEventListener('load', () => resolve(), { once: true })
            existing.addEventListener('error', () => reject(new Error('turnstile')), { once: true })
        })
    }
    return new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        s.async = true
        s.defer = true
        s.dataset.cfTurnstile = '1'
        s.onload = () => resolve()
        s.onerror = () => reject(new Error('turnstile'))
        document.head.appendChild(s)
    })
}

export default function TurnstileWidget({
    siteKey,
    onToken,
}: {
    siteKey: string
    onToken: (token: string) => void
}) {
    const boxRef = useRef<HTMLDivElement>(null)
    const idRef = useRef<string | null>(null)

    useEffect(() => {
        let gone = false
        onToken('')
        loadScript()
            .then(() => {
                if (gone || !boxRef.current || !window.turnstile) return
                idRef.current = window.turnstile.render(boxRef.current, {
                    sitekey: siteKey,
                    callback: (token) => onToken(token),
                    'expired-callback': () => onToken(''),
                    'error-callback': () => onToken(''),
                    theme: 'auto',
                    size: 'flexible',
                    action: 'post',
                })
            })
            .catch(() => onToken(''))
        return () => {
            gone = true
            if (idRef.current && window.turnstile) {
                window.turnstile.remove(idRef.current)
                idRef.current = null
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- widget is recreated when siteKey changes
    }, [siteKey])

    return <div ref={boxRef} className="postform__turnstile" />
}
