import { sealPassword } from '@/lib/passwordCrypto'
import { passwordAcceptable, passwordRules } from '@/lib/passwordPolicy'
import { solvePoW } from '@/lib/pow'

function getCookie(name: string): string | null {
    const match = document.cookie.match(
        new RegExp(`(?:^|; )${name.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&')}=([^;]*)`),
    )
    return match ? decodeURIComponent(match[1]) : null
}

function setError(el: HTMLElement | null, msg: string) {
    if (el) el.textContent = msg
}

function renderRules(box: HTMLElement | null, password: string, username: string) {
    if (!box) return
    box.hidden = password.length === 0
    const rules = passwordRules(password, username)
    box.innerHTML = rules
        .map((r) => {
            const cls = password.length && r.ok ? 'ok' : password.length && r.required ? 'bad' : ''
            const mark = r.ok && password.length ? '✓' : '·'
            return `<span class="${cls}">${mark} ${r.label}</span>`
        })
        .join('')
}

async function sessionId(): Promise<string> {
    let id = getCookie('client_key')
    if (id) return id
    await fetch('/api/home', { credentials: 'include' })
    id = getCookie('client_key')
    if (!id) throw new Error('Немає сесії')
    return id
}

async function postJson(url: string, body: unknown) {
    const id = await sessionId()
    const { nonce, salt } = await solvePoW(id)
    return fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'X-PoW-Nonce': nonce,
            'X-PoW-Salt': salt,
        },
        body: JSON.stringify(body),
    })
}

async function boot() {
    const form = document.getElementById('gate-form') as HTMLFormElement | null
    if (!form) return
    const mode = document.body.dataset.mode || 'login'
    const usernameDefault = document.body.dataset.user || 'admin'
    const errBox = document.getElementById('err')
    const rulesBox = document.getElementById('rules')
    const pw = form.elements.namedItem('password') as HTMLInputElement
    const userInput = form.elements.namedItem('username') as HTMLInputElement
    const submit = document.getElementById('go') as HTMLButtonElement | null

    const usernameNow = () => (mode === 'setup' ? usernameDefault : userInput.value)

    if (mode === 'setup') {
        rulesBox?.removeAttribute('hidden')
        pw.addEventListener('input', () => {
            renderRules(rulesBox, pw.value, usernameNow())
            if (submit) submit.disabled = !passwordAcceptable(pw.value, usernameNow())
        })
        if (submit) submit.disabled = true
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault()
        setError(errBox, '')
        const password = pw.value
        const username = usernameNow()
        if (mode === 'setup') {
            const pw2 = (form.elements.namedItem('password2') as HTMLInputElement | null)?.value || ''
            if (password !== pw2) {
                setError(errBox, 'Паролі не збігаються')
                return
            }
            if (!passwordAcceptable(password, username)) {
                setError(errBox, 'Пароль не відповідає вимогам')
                return
            }
        }
        if (submit) submit.disabled = true
        try {
            const password_enc = sealPassword(password)
            const res = mode === 'setup'
                ? await postJson('/api/admin/setup', { password_enc })
                : await postJson('/api/admin/login', { username, password_enc })
            const data = await res.json().catch(() => ({})) as { error?: string }
            if (!res.ok) {
                setError(errBox, data.error || (mode === 'setup' ? 'Не вдалося завершити налаштування' : 'Невірний пароль'))
                return
            }
            window.location.assign('/admin')
        } catch {
            setError(errBox, 'Немає звʼязку з сервером')
        } finally {
            if (submit) submit.disabled = false
        }
    })
}

void boot()
