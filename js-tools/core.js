(function () {
    // --- Configuration ---
    const MAGIC_OFFSET = 255;

    // --- Helpers ---

    // Robust Cookie Reader
    function getSessionKey() {
        try {
            const v = document.cookie.match('(^|;) ?client_key=([^;]*)(;|$)');
            return v ? v[2] : null;
        } catch (e) { return null; }
    }

    // Decryptor
    function unpackData(payloadBase64) {
        if (!payloadBase64) return null;
        try {
            const key = getSessionKey();
            if (!key) return null; // Fail silently if no key

            const binaryString = atob(payloadBase64);
            const len = binaryString.length;
            const keyLen = key.length;
            const bytes = new Uint8Array(len);

            for (let i = 0; i < len; i++) {
                const byte = binaryString.charCodeAt(i);
                const keyByte = key.charCodeAt(i % keyLen);
                bytes[i] = byte ^ keyByte ^ (i % MAGIC_OFFSET);
            }

            const decoder = new TextDecoder('utf-8');
            return JSON.parse(decoder.decode(bytes));
        } catch (e) {
            console.error("KR: Data error");
            return null;
        }
    }

    // --- UI Generators ---

    const UI = {
        // STRICT GRID LAYOUT (Fixes sliding/overflow)
        images: (images, cdn) => {
            if (!images || images.length === 0) return '';

            // 1. Single Image - Display large
            if (images.length === 1) {
                const i = images[0];
                return `
                <div class="mb-3 block">
                    <div class="text-[10px] text-skin-muted mb-1 flex items-center gap-2">
                        <a href="${cdn}/${i.url}" target="_blank" class="hover:underline font-bold truncate max-w-[200px]">${i.filename}</a>
                        <span class="opacity-70">(${Math.round(i.size / 1024)}KB, ${i.width}x${i.height})</span>
                    </div>
                    <a href="${cdn}/${i.url}" onclick="return openLightbox(this.href)" class="inline-block">
                        <img src="${cdn}/${i.thumbnail_url}" class="rounded border border-skin-border max-h-[350px] w-auto object-contain hover:opacity-95" loading="lazy">
                    </a>
                </div>`;
            }

            // 2. Multiple Images - Strict CSS Grid (No flex sliding)
            // Use standard <a> tags without complex nesting to ensure alignment
            const gridItems = images.map(i => `
                <a href="${cdn}/${i.url}" onclick="return openLightbox(this.href)" 
                   class="block relative aspect-square bg-black/5 border border-skin-border overflow-hidden hover:opacity-90 transition-opacity">
                    <img src="${cdn}/${i.thumbnail_url}" class="w-full h-full object-cover" loading="lazy">
                </a>
            `).join('');

            // Grid container: 2 cols on mobile, 4 on desktop. Gap fixed.
            return `<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 max-w-[600px]">${gridItems}</div>`;
        },

        meta: (p, isOp) => {
            const d = new Date(p.created_at + "Z");
            const dateStr = d.toLocaleString('uk-UA', {
                day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
            });
            const flag = p.country_code
                ? `<span class="fi fi-${p.country_code.toLowerCase()} rounded-[2px] shadow-sm mr-1"></span>`
                : '';

            return `
            <div class="flex items-center justify-between text-xs text-skin-muted mb-2 border-b border-skin-border/30 pb-1">
                <div class="flex items-center gap-2">
                    <div class="flex items-center">${flag} <span class="font-bold text-[#15803d]">Анонім</span></div>
                    <span class="opacity-70">${dateStr}</span>
                </div>
                <div class="flex items-center gap-2">
                    <a href="#p${p.id}" class="hover:text-skin-accent hover:underline font-mono" onclick="replyTo(${p.id})">№${p.id}</a>
                    ${!isOp ? `<span class="cursor-pointer hover:text-skin-text opacity-50 hover:opacity-100" onclick="replyTo(${p.id})">↵</span>` : ''}
                </div>
            </div>`;
        },

        content: (text) => {
            if (!text) return '';
            const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            const processed = escaped.split('\n').map(line => {
                if (line.trim().startsWith('&gt;')) return `<span class="text-[#789922]">${line}</span>`;
                return line;
            }).join('<br>');
            return `<div class="text-sm text-skin-text leading-relaxed whitespace-pre-wrap break-words font-sans">${processed}</div>`;
        }
    };

    // --- Core Logic ---

    // 1. Anti-Bot Handler (Must define string explicitly to avoid obfuscation issues)
    // We attach to 'document' to catch bubbling events from HTMX
    document.addEventListener('htmx:configRequest', function(evt) {
        // Only protect POST requests
        if (evt.detail.verb !== 'post') return;

        const key = getSessionKey();
        if (!key) {
            console.error("KR: Cookie missing");
            return;
        }

        // Logic: Reverse(Key) -> Base64
        try {
            const reversed = key.split('').reverse().join('');
            const proof = btoa(reversed);

            if (!evt.detail.headers) evt.detail.headers = {};
            evt.detail.headers['X-K-Proof'] = proof;
        } catch (e) {
            console.error("KR: Proof gen failed", e);
        }
    });

    // 2. Hydration (Rendering)
    window.__kr_hydrate = function (config) {
        const payloadEl = document.getElementById('__KR_DATA');
        if (!payloadEl) return;

        const data = unpackData(payloadEl.textContent);
        if (!data) return;

        // --- Thread Mode ---
        if (config.mode === 'thread') {
            // Render OP Images
            const opAnchor = document.getElementById('op-images-anchor');
            if (opAnchor && data.images && data.images.length > 0) {
                opAnchor.innerHTML = UI.images(data.images, config.cdn);
                opAnchor.style.display = 'block';
            }

            // Render Replies
            const container = document.getElementById(config.targetId);
            if (container && data.posts) {
                container.innerHTML = data.posts.map(item => {
                    const p = item.model;
                    return `
                    <div class="flex gap-2 mb-1" id="p${p.id}">
                        <div class="shrink-0 w-6 text-center text-[10px] text-skin-muted/40 pt-3 select-none">&gt;&gt;</div>
                        <div class="grow bg-skin-surface border border-skin-border rounded shadow-sm p-3 min-w-0">
                            ${UI.meta(p, false)}
                            ${UI.images(item.images, config.cdn)}
                            ${UI.content(p.content)}
                        </div>
                    </div>`;
                }).join('');
                container.classList.remove('opacity-0');
            }
        }

        // --- Board Mode ---
        else if (config.mode === 'board') {
            const container = document.getElementById(config.targetId);
            if (!container) return;

            container.innerHTML = data.map(item => {
                const t = item.model;
                let repliesHtml = '';

                if (item.replies && item.replies.length > 0) {
                    repliesHtml = `<div class="mt-4 space-y-2 pl-3 border-l-2 border-skin-border/40">` +
                        item.replies.map(r => `
                            <div class="text-xs text-skin-muted bg-skin-base/50 p-2 rounded flex gap-2">
                                <span class="opacity-50">>></span>
                                <div class="truncate">${r.model.content}</div>
                            </div>
                        `).join('') + `</div>`;
                }

                return `
                <div class="bg-skin-surface border border-skin-border rounded-lg p-4 mb-6 shadow-sm">
                    <div class="flex flex-col sm:flex-row gap-4">
                        <div class="shrink-0">${UI.images(item.images, config.cdn)}</div>
                        <div class="grow min-w-0">
                            <div class="text-xs text-skin-muted mb-2 flex items-center gap-2">
                                <a href="/${t.board_slug}/thread/${t.id}" class="font-bold text-skin-accent text-sm hover:underline">/${t.board_slug}/${t.id}</a>
                                <span class="font-bold text-[#15803d]">Анонім</span>
                                <a href="/${t.board_slug}/thread/${t.id}" class="ml-auto bg-skin-primary/10 text-skin-primary px-2 py-0.5 rounded text-[10px] font-bold hover:bg-skin-primary hover:text-white transition-colors">ВІДПОВІСТИ</a>
                            </div>
                            <h3 class="font-bold text-skin-text text-base mb-1">${t.subject || ''}</h3>
                            ${UI.content(t.content)}
                            ${repliesHtml}
                        </div>
                    </div>
                </div>`;
            }).join('');
            container.classList.remove('opacity-0');
        }
    };

    // 3. Re-Hydrate on Auto-Refresh
    document.addEventListener('htmx:afterSwap', function(evt) {
        if (window.__kr_config) {
            window.__kr_hydrate(window.__kr_config);
        }
    });

    // 4. Lightbox Logic
    window.openLightbox = function(url) {
        const lb = document.getElementById('lightbox');
        const img = document.getElementById('lightbox-img');
        if(!lb || !img) return true;
        img.src = url;
        lb.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        return false;
    };

    window.closeLightbox = function() {
        const lb = document.getElementById('lightbox');
        lb.classList.add('hidden');
        document.getElementById('lightbox-img').src = '';
        document.body.style.overflow = '';
    };

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') window.closeLightbox();
    });

})();
