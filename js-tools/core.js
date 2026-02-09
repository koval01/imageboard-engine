(function () {
    // --- Configuration ---
    // The "salt" used for the XOR logic.
    // In production, this logic should be confusing.
    const MAGIC_OFFSET = 255;

    // --- Helpers ---

    // 1. Get the Session Key (UUID) from cookies
    function getSessionKey() {
        const name = "client_key=";
        const decodedCookie = decodeURIComponent(document.cookie);
        const ca = decodedCookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') {
                c = c.substring(1);
            }
            if (c.indexOf(name) === 0) {
                return c.substring(name.length, c.length);
            }
        }
        return "";
    }

    // 2. The Decryptor (Unpacker)
    // Matches the Rust Obfuscator::pack logic
    function unpackData(payloadBase64) {
        if (!payloadBase64) return null;
        try {
            const key = getSessionKey();
            if (!key) throw new Error("No key found in cookies");

            const binaryString = atob(payloadBase64);
            const len = binaryString.length;
            const keyLen = key.length;
            let result = "";

            for (let i = 0; i < len; i++) {
                const byte = binaryString.charCodeAt(i);
                const keyByte = key.charCodeAt(i % keyLen);
                // Rolling XOR Reversal
                const charCode = byte ^ keyByte ^ (i % MAGIC_OFFSET);
                result += String.fromCharCode(charCode);
            }
            return JSON.parse(result);
        } catch (e) {
            console.error("KR_ERR: 0x01", e); // Obscure error log
            return null;
        }
    }

    // 3. HTML Generators (Replicating Askama templates in JS)
    const Gen = {
        img: (img, cdn) => {
            return `
            <figure class="group flex flex-col shrink-0 max-w-[150px] sm:max-w-[200px]">
                <figcaption class="text-[10px] text-skin-muted truncate w-full mb-1" title="${img.filename}">
                    <a href="${cdn}/${img.url}" target="_blank" class="hover:underline hover:text-skin-link">${img.filename}</a>
                    <span class="text-[9px] opacity-70">(${Math.round(img.size / 1024)}KB)</span>
                </figcaption>
                <a href="${cdn}/${img.url}" target="_blank" class="block relative overflow-hidden rounded-sm border border-skin-border bg-black/5">
                    <img src="${cdn}/${img.thumbnail_url}" class="w-full h-auto max-h-[150px] sm:max-h-[200px] object-contain transition-opacity group-hover:opacity-80" alt="${img.filename}">
                </a>
            </figure>`;
        },
        flag: (cc) => {
            if (!cc) return '';
            return `<span class="fi fi-${cc.toLowerCase()} mr-1" title="${cc}"></span>`;
        },
        date: (ts) => {
            const d = new Date(ts + "Z"); // Assume UTC from Rust
            return d.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        }
    };

    // --- Main Rendering Logic ---

    window.__kr_hydrate = function (config) {
        const payloadEl = document.getElementById('__KR_DATA');
        if (!payloadEl) return;

        const raw = payloadEl.textContent;
        const data = unpackData(raw);
        const container = document.getElementById(config.targetId);

        if (!data || !container) {
            container.innerHTML = `<div class="text-skin-red font-mono text-center text-xs p-4">Будь ласка увімкніть cookies та JavaScript.</div>`;
            return;
        }

        let html = '';

        // Thread View (Array of Posts)
        if (config.mode === 'thread' && data.posts) {
            // Render Replies
            data.posts.forEach(item => {
                const p = item.model;
                const images = item.images || [];

                const imgHtml = images.length ?
                    `<div class="flex flex-wrap gap-2 mb-2">${images.map(i => Gen.img(i, config.cdn)).join('')}</div>` : '';

                html += `
                <div class="reply-container bg-skin-surface border border-skin-border rounded-r-lg rounded-bl-lg p-3 min-w-[300px] max-w-full sm:max-w-4xl shadow-post" id="p${p.id}">
                    <div class="text-xs text-skin-muted mb-2 pb-1 border-b border-skin-border/50 border-dashed flex justify-between">
                        <div class="flex items-center gap-2">
                            ${Gen.flag(p.country_code)}
                            <span class="font-bold text-green-600">Анонім</span>
                            <span>${Gen.date(p.created_at)}</span>
                            <a href="#p${p.id}" class="hover:text-skin-accent hover:underline">№${p.id}</a>
                        </div>
                        <div class="opacity-0 hover:opacity-100 transition-opacity">
                            <button class="text-[10px] uppercase font-bold text-skin-muted hover:text-skin-text" onclick="replyTo(${p.id})">Відповісти</button>
                        </div>
                    </div>
                    ${imgHtml}
                    <div class="text-sm text-skin-text whitespace-pre-wrap break-words">${p.content}</div>
                </div>`;
            });
        }

        // Board View (Array of Threads)
        else if (config.mode === 'board' && Array.isArray(data)) {
            data.forEach(item => {
                const t = item.model;
                const images = item.images || [];
                const replies = item.replies || [];

                const imgHtml = images.length ?
                    `<div class="shrink-0 flex flex-wrap gap-2 sm:flex-col sm:gap-4 max-w-full sm:max-w-[200px]">
                        ${images.map(i => Gen.img(i, config.cdn)).join('')}
                    </div>` : '';

                // Generate replies HTML
                let repliesHtml = '';
                if(replies.length > 0) {
                    repliesHtml = `<div class="mt-3 pl-2 sm:pl-12 flex flex-col gap-2"><div class="text-[10px] text-skin-muted italic mb-1">Останні відповіді:</div>`;
                    replies.forEach(r => {
                        const rp = r.model;
                        const replyImages = r.images || [];
                        // Small preview for reply images
                        const replyImgHtml = replyImages.length ?
                            `<div class="flex flex-wrap gap-1 mb-1">${replyImages.map(i =>
                                `<a href="${config.cdn}/${i.url}" target="_blank"><img src="${config.cdn}/${i.thumbnail_url}" class="w-16 h-16 object-cover rounded border border-skin-border"></a>`
                            ).join('')}</div>` : '';

                        repliesHtml += `
                        <div class="bg-skin-surface border border-skin-border rounded-r rounded-bl p-3 w-fit min-w-[300px] max-w-full text-sm shadow-sm hover:border-skin-accent/50 transition-colors">
                            <div class="text-xs text-skin-muted mb-2 pb-1 border-b border-skin-border/50 border-dashed flex gap-2">
                                ${Gen.flag(rp.country_code)}
                                <span class="font-bold text-green-600">Анонім</span>
                                <span>${Gen.date(rp.created_at)}</span>
                                <a href="/${t.board_slug}/thread/${t.id}#p${rp.id}" class="hover:text-skin-accent hover:underline">№${rp.id}</a>
                            </div>
                            ${replyImgHtml}
                            <div class="text-skin-text whitespace-pre-wrap break-words">${rp.content}</div>
                        </div>`;
                    });
                    repliesHtml += `</div>`;
                }

                html += `
                <div class="thread group/thread mb-10" id="thread-${t.id}">
                    <article class="flex flex-col sm:flex-row gap-3">
                        ${imgHtml}
                        <div class="flex-grow min-w-0">
                            <div class="text-xs text-skin-muted mb-2">
                                ${t.subject ? `<span class="font-bold text-skin-text text-sm mr-2">${t.subject}</span>` : ''}
                                ${Gen.flag(t.country_code)}
                                <span class="font-bold text-green-600">Анонім</span>
                                <span class="mx-1"></span>
                                <span>${Gen.date(t.created_at)}</span>
                                <span class="mx-1"></span>
                                <a href="/${t.board_slug}/thread/${t.id}" class="text-skin-text hover:text-skin-accent hover:underline">№${t.id}</a>
                                <span class="mx-2"></span>
                                <a href="/${t.board_slug}/thread/${t.id}" class="bg-skin-surface border border-skin-border px-1.5 rounded hover:border-skin-accent text-skin-text transition-colors">[Відповісти]</a>
                            </div>
                            <div class="text-sm text-skin-text leading-relaxed whitespace-pre-wrap break-words font-sans">${t.content}</div>
                        </div>
                    </article>
                    ${repliesHtml}
                </div>
                <hr class="border-skin-border/30 clear-both">`;
            });
        }

        // Injection
        container.innerHTML = html;
        container.classList.remove('opacity-0');
        payloadEl.remove(); // Cleanup
    };

    // --- Anti-Bot Protection (The Challenge) ---
    // Listens for HTMX requests and injects the Proof-of-Work header
    document.body.addEventListener('htmx:configRequest', function (evt) {
        if (evt.detail.verb === 'post') {
            const key = getSessionKey();
            if (!key) return;

            // Algorithm: Reverse String -> Base64
            // Must match the Rust server Middleware logic exactly
            const reversed = key.split('').reverse().join('');
            const proof = btoa(reversed);

            evt.detail.headers['X-K-Proof'] = proof;
        }
    });

})();
