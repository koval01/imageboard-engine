import { sha256 } from '@noble/hashes/sha2.js'

function randomSalt(): string {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** SHA-256 PoW that works on plain HTTP hosts (no SubtleCrypto / secure context). */
export async function solvePoW(sessionId: string): Promise<{ nonce: string; salt: string }> {
    const encoder = new TextEncoder()
    const salt = randomSalt()
    let nonce = 0

    for (;;) {
        for (let i = 0; i < 64; i++) {
            const digest = sha256(encoder.encode(`${sessionId}${salt}${nonce}`))
            if (digest[0] === 0 && digest[1] === 0) {
                return { nonce: String(nonce), salt }
            }
            nonce++
        }
        await Promise.resolve()
    }
}
