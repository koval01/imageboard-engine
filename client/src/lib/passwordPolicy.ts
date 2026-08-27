/** Keep in sync with `src/service/staff.rs` password_issues. */
export const MIN_PASSWORD_LEN = 13
export const MIN_PASSWORD_DIGITS = 2
export const MIN_PASSWORD_SPECIAL = 1
export const PREFERRED_PASSWORD_SPECIAL = 2

const SEQUENCE_RUN = 4
const REPEAT_RUN = 4

const COMMON_WEAK = [
    '123456',
    '1234567',
    '12345678',
    '123456789',
    '1234567890',
    'password',
    'qwerty',
    'qwertyui',
    'asdfgh',
    'zxcvbn',
    'abc123',
    'abcdef',
    'letmein',
    'welcome',
    'iloveyou',
    'monkey',
    'dragon',
    'пароль',
    'криївка',
    'kryivka',
]

export type PasswordRuleId =
    | 'length'
    | 'upper'
    | 'lower'
    | 'digits'
    | 'special'
    | 'specialPreferred'
    | 'sequence'
    | 'common'
    | 'username'
    | 'whitespace'

export type PasswordRule = {
    id: PasswordRuleId
    label: string
    ok: boolean
    required: boolean
}

function isSpecialChar(c: string) {
    return c.length === 1 && !/[\p{L}\p{N}\s]/u.test(c)
}

function hasCodepointRun(password: string, minRun: number) {
    const chars = [...password.toLocaleLowerCase()]
    if (chars.length < minRun) return false
    let asc = 1
    let desc = 1
    for (let i = 1; i < chars.length; i++) {
        const a = chars[i - 1].codePointAt(0) ?? 0
        const b = chars[i].codePointAt(0) ?? 0
        if (b === a + 1) {
            asc += 1
            desc = 1
        } else if (b === a - 1) {
            desc += 1
            asc = 1
        } else {
            asc = 1
            desc = 1
        }
        if (asc >= minRun || desc >= minRun) return true
    }
    return false
}

function hasRepeatedRun(password: string, minRun: number) {
    const chars = [...password.toLocaleLowerCase()]
    let prev = ''
    let count = 0
    for (const c of chars) {
        if (c === prev) count += 1
        else {
            prev = c
            count = 1
        }
        if (count >= minRun) return true
    }
    return false
}

export function passwordRules(password: string, username?: string): PasswordRule[] {
    const chars = [...password]
    let upper = 0
    let lower = 0
    let digits = 0
    let special = 0
    for (const c of chars) {
        if (/\p{Lu}/u.test(c)) upper += 1
        else if (/\p{Ll}/u.test(c)) lower += 1
        else if (/[0-9]/.test(c)) digits += 1
        else if (isSpecialChar(c)) special += 1
    }
    const name = username?.trim() ?? ''
    const hasUsername = name.length >= 3 && password.toLocaleLowerCase().includes(name.toLocaleLowerCase())
    const lowerPass = password.toLocaleLowerCase()

    return [
        {
            id: 'length',
            label: `Щонайменше ${MIN_PASSWORD_LEN} символів`,
            ok: chars.length >= MIN_PASSWORD_LEN,
            required: true,
        },
        { id: 'upper', label: 'Велика літера', ok: upper > 0, required: true },
        { id: 'lower', label: 'Мала літера', ok: lower > 0, required: true },
        {
            id: 'digits',
            label: `Щонайменше ${MIN_PASSWORD_DIGITS} цифри`,
            ok: digits >= MIN_PASSWORD_DIGITS,
            required: true,
        },
        {
            id: 'special',
            label: 'Спецсимвол (!@#$%…)',
            ok: special >= MIN_PASSWORD_SPECIAL,
            required: true,
        },
        {
            id: 'specialPreferred',
            label: 'Краще два спецсимволи',
            ok: special >= PREFERRED_PASSWORD_SPECIAL,
            required: false,
        },
        {
            id: 'sequence',
            label: 'Без 123456 / abcdef і повторів',
            ok: !hasCodepointRun(password, SEQUENCE_RUN) && !hasRepeatedRun(password, REPEAT_RUN),
            required: true,
        },
        {
            id: 'common',
            label: 'Не зі словника слабких паролів',
            ok: !COMMON_WEAK.some((needle) => lowerPass.includes(needle)),
            required: true,
        },
        {
            id: 'username',
            label: 'Без імені облікового запису',
            ok: !hasUsername,
            required: true,
        },
        {
            id: 'whitespace',
            label: 'Без пробілів',
            ok: !/\s/.test(password),
            required: true,
        },
    ]
}

export function passwordAcceptable(password: string, username?: string) {
    return passwordRules(password, username).every((rule) => !rule.required || rule.ok)
}
