import nacl from 'tweetnacl'
import { blake2b } from '@noble/hashes/blake2.js'

function hexToBytes(hex: string): Uint8Array {
    const clean = hex.trim()
    if (clean.length % 2 !== 0) throw new Error('bad key')
    const out = new Uint8Array(clean.length / 2)
    for (let i = 0; i < out.length; i++) {
        out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
    }
    return out
}

function bytesToB64(bytes: Uint8Array): string {
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    return btoa(bin)
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
    const out = new Uint8Array(a.length + b.length)
    out.set(a, 0)
    out.set(b, a.length)
    return out
}

/** libsodium crypto_box_seal: ephemeral_pk || nacl.box(msg, blake2b(epk||pk, 24), recipient, eph_sk) */
export function sealBytes(plaintext: Uint8Array, recipientPk: Uint8Array): Uint8Array {
    const eph = nacl.box.keyPair()
    const nonce = blake2b(concat(eph.publicKey, recipientPk), { dkLen: 24 })
    const boxed = nacl.box(plaintext, nonce, recipientPk, eph.secretKey)
    if (!boxed) throw new Error('seal failed')
    return concat(eph.publicKey, boxed)
}

export function publicKeyHex(): string {
    if (typeof document !== 'undefined') {
        const fromBody = document.body?.dataset?.pk
        if (fromBody) return fromBody
    }
    if (typeof window !== 'undefined' && window.__PW_PK__) return window.__PW_PK__
    throw new Error('Немає ключа шифрування')
}

export function sealPassword(password: string, pkHex = publicKeyHex()): string {
    const pt = new TextEncoder().encode(password)
    return bytesToB64(sealBytes(pt, hexToBytes(pkHex)))
}

declare global {
    interface Window {
        __PW_PK__?: string
    }
}
