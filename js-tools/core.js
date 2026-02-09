(function () {
    // --- Constants ---
    const MAGIC_OFFSET = 255;

    // --- Helpers ---

    // Robust Cookie Reader (Fixes 403 Error)
    function getSessionKey() {
        const match = document.cookie.match(new RegExp('(^| )client_key=([^;]+)'));
        if (match) return decodeURIComponent(match[2]);
        return null;
    }

    // Decryptor (UTF-8 Compatible)
    function unpackData(payloadBase64) {
        if (!payloadBase64) return null;
        try {
            const key = getSessionKey();
            if (!key) throw new Error("No session key found. Please enable cookies.");

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
            console.error("KR_ERR: Data unpack failed.", e);
            return null;
        }
    }

    // --- UI Generators ---

    const UI = {
        // Smart Grid: Fixes vertical stacking and sliding issues
        images: (images, cdn) => {
            if (!images || images.length === 0) return '';

            // 1. Single Image (Large Preview)
            if (images.length === 1) {
                const i = images[0];
                return `
                <div class="mb-2">
                    <div class="text-[10px] text-skin-muted mb-1 flex items-center gap-1">
                        <a href="${cdn}/${i.url}" target="_blank" class="hover:underline hover:text-skin-accent truncate max-w-[200px] font-bold">${i.filename}</a>
                        <span class="opacity-70">(${Math.round(i.size / 1024)}KB, ${i.width}x${i.height})</span>
                    </div>
                    <a href="${cdn}/${i.url}" onclick="return openLightbox(this.href)" class="block w-fit">
                        <img src="${cdn}/${i.thumbnail_url}" class="rounded border border-skin-border max-h-[300px] w-auto object-contain hover:opacity-90 transition-opacity" loading="lazy">
                    </a>
                </div>`;
            }

            // 2. Multiple Images (Strict Grid)
            // Uses CSS Grid to force items into neat rows/cols, preventing "sliding"
            const gridHtml = images.map(i => `
                <a href="${cdn}/${i.url}" onclick="return openLightbox(this.href)" class="relative group aspect-square bg-black/5 rounded border border-skin-border overflow-hidden">
                    <img src="${cdn}/${i.thumbnail_url}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" loading="lazy">
                    <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors"></div>
                    <span class="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                        ${Math.round(i.size/1024)}KB
                    </span>
                </a>
            `).join('');

            return `<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-2 max-w-xl">${gridHtml}</div>`;
        },

        meta: (p, isOp) => {
            const d = new Date(p.created_at + "Z");
            const dateStr = d.toLocaleString('uk-UA', {
                day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
            });

            const flag = p.country_code
                ? `<span class="fi fi-${p.country_code.toLowerCase()} rounded-[2px] shadow-sm" title="${p.country_code}"></span>`
                : '';

            return `
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-skin-muted mb-2 border-b border-skin-border/30 pb-1">
                <div class="flex items-center gap-2">
                    ${flag}
                    <span class="font-bold text-[#15803d]">Анонім</span>
                    <span class="opacity-70">${dateStr}</span>
                </div>
                <div class="flex items-center gap-2 ml-auto sm:ml-0">
                    <a href="#p${p.id}" class="hover:text-skin-accent hover:underline cursor-pointer font-mono" onclick="replyTo(${p.id})">№${p.id}</a>
                    ${!isOp ? `<span class="cursor-pointer hover:text-skin-text opacity-50 hover:opacity-100 transition-opacity select-none" onclick="replyTo(${p.id})">[Відп]</span>` : ''}
                </div>
            </div>`;
        },

        content: (text) => {
            if (!text) return '';
            const escaped = text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");

            const processed = escaped.split('\n').map(line => {
                if (line.trim().startsWith('&gt;')) {
                    return `<span class="text-[#789922]">${line}</span>`; // Greentext
                }
                return line;
            }).join('<br>');

            return `<div class="text-[13px] sm:text-sm text-skin-text leading-relaxed whitespace-pre-wrap break-words font-sans">${processed}</div>`;
        }
    };

    // --- Main Rendering Logic ---

    window.__kr_hydrate = function (config) {
        const payloadEl = document.getElementById('__KR_DATA');
        if (!payloadEl) return;

        const data = unpackData(payloadEl.textContent);
        if (!data) return;

        // 1. Thread Mode
        if (config.mode === 'thread') {
            // A. OP Images (Fix for "Not displayed")
            // We target a specific DIV in the OP post to inject images
            const opImagesContainer = document.getElementById('op-images-anchor');
            if (opImagesContainer && data.images) {
                opImagesContainer.innerHTML = UI.images(data.images, config.cdn);
                opImagesContainer.classList.remove('hidden');
            }

            // B. Replies
            const container = document.getElementById(config.targetId);
            if (container && data.posts) {
                container.innerHTML = data.posts.map(item => {
                    const p = item.model;
                    return `
                    <div class="flex gap-2 group mb-2" id="p${p.id}">
                        <div class="shrink-0 text-[10px] text-skin-muted/40 pt-3 select-none w-6 text-center">&gt;&gt;</div>
                        <div class="grow bg-skin-surface border border-skin-border rounded p-3 shadow-sm hover:border-skin-accent/30 transition-colors max-w-full overflow-hidden">
                            ${UI.meta(p, false)}
                            ${UI.images(item.images, config.cdn)}
                            ${UI.content(p.content)}
                        </div>
                    </div>`;
                }).join('');
                container.classList.remove('opacity-0');
            }
        }

        // 2. Board Mode
        else if (config.mode === 'board') {
            const container = document.getElementById(config.targetId);
            if (!container) return;

            container.innerHTML = data.map(item => {
                const t = item.model;

                // Mini-replies
                let repliesHtml = '';
                if (item.replies && item.replies.length > 0) {
                    repliesHtml = `<div class="mt-3 space-y-2 pl-2 sm:pl-4 border-l-2 border-skin-border/40">` +
                        item.replies.map(r => `
                            <div class="text-xs text-skin-muted bg-skin-base/50 p-2 rounded flex gap-2 items-start">
                                <span class="shrink-0 opacity-50 pt-0.5">>></span>
                                <div class="min-w-0">
                                    <div class="flex gap-2 mb-1 text-[10px] opacity-70">
                                        <span>${UI.meta(r.model, false).replace(/<div.*?>|<\/div>/g, '')}</span> 
                                    </div>
                                    <div class="truncate line-clamp-2">${r.model.content}</div>
                                </div>
                            </div>
                        `).join('') + `</div>`;
                }

                return `
                <div class="bg-skin-surface border border-skin-border rounded-lg p-4 mb-6 shadow-sm hover:shadow-md transition-shadow">
                    <div class="flex flex-col sm:flex-row gap-4">
                        <div class="shrink-0 max-w-full sm:max-w-[180px]">
                            ${UI.images(item.images, config.cdn)}
                        </div>
                        <div class="grow min-w-0">
                            <div class="text-xs text-skin-muted mb-2 flex flex-wrap items-center gap-2">
                                <a href="/${t.board_slug}/thread/${t.id}" class="font-bold text-skin-accent text-sm hover:underline">/${t.board_slug}/${t.id}</a>
                                <span class="font-bold text-[#15803d]">Анонім</span>
                                <a href="/${t.board_slug}/thread/${t.id}" class="bg-skin-primary/10 text-skin-primary px-2 py-0.5 rounded text-[10px] font-bold hover:bg-skin-primary hover:text-white transition-colors">ВІДПОВІСТИ</a>
                            </div>
                            <h3 class="font-bold text-skin-text text-base mb-1 break-words">${t.subject || ''}</h3>
                            ${UI.content(t.content)}
                            ${repliesHtml}
                        </div>
                    </div>
                </div>`;
            }).join('');

            container.classList.remove('opacity-0');
        }
    };

    // --- Anti-Bot Protection (Fix for 403) ---
    // Reverses Session Key and Base64 encodes it.
    document.body.addEventListener('htmx:configRequest', (evt) => {
        // Only run for POST requests (forms)
        if (evt.detail.verb !== 'post') return;

        const key = getSessionKey();

        if (!key) {
            console.warn("KR_WARN: No client_key cookie found. Form submission might fail.");
            return;
        }

        // Algo: Reverse Key -> Base64
        try {
            const reversed = key.split('').reverse().join('');
            const proof = btoa(reversed);
            evt.detail.headers['X-K-Proof'] = proof;
        } catch (e) {
            console.error("KR_ERR: Proof generation failed", e);
        }
    });

    // --- Auto-Refresh Handling ---
    // When HTMX swaps the content (polling or reply), we must re-hydrate the new data.
    document.body.addEventListener('htmx:afterSwap', (evt) => {
        // Ensure the config exists
        if (window.__kr_config) {
            window.__kr_hydrate(window.__kr_config);
        }
    });

    // --- Lightbox (Full Screen Image Viewer) ---
    window.openLightbox = function(url) {
        const lb = document.getElementById('lightbox');
        const img = document.getElementById('lightbox-img');
        if(!lb || !img) return true; // Fallback to normal link

        img.src = url;
        lb.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Lock scroll
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
