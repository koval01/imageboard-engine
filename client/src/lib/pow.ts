export async function solvePoW(sessionId: string): Promise<{ nonce: string; salt: string }> {
    const encoder = new TextEncoder();
    const salt = crypto.randomUUID().replace(/-/g, '');
    let nonce = 0;

    while (true) {
        const input = sessionId + salt + nonce.toString();
        const buffer = encoder.encode(input);
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = new Uint8Array(hashBuffer);
        // Перевірка на 2 початкових нульових байти (16 нульових бітів) згідно з логікою Rust
        if (hashArray[0] === 0 && hashArray[1] === 0) {
            return { nonce: nonce.toString(), salt };
        }
        nonce++;
    }
}
