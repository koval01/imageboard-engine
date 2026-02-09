(function () {
    // --- Configuration ---
    const MAGIC_OFFSET = 255;

    // --- Helpers ---

    function getCookie(name) {
        try {
            // Simple robust regex
            const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
            if (match) return decodeURIComponent(match[2]);
        } catch (e) {
            console.error("KR: Cookie read error", e);
        }
        return null;
    }

    function unpackData(payloadBase64) {
        if (!payloadBase64) return null;
        try {
            const key = getCookie("client_key");
            if (!key) return null;

            const binaryString = atob(payloadBase64);
            const len = binaryString.length;
            const keyLen = key.length;
            const bytes = new Uint8Array(len);

            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i) ^ key.charCodeAt(i % keyLen) ^ (i % MAGIC_OFFSET);
            }

            const decoder = new TextDecoder('utf-8');
            return JSON.parse(decoder.decode(bytes));
        } catch (e) {
            console.error("KR: Decrypt fail", e);
            return null;
        }
    }

    // --- UI Generators ---

    const UI = {
        images: (images, cdn) => {
            if (!images || images.length === 0) return '';

            // Grid Container - Forces strict layout
            let html = `<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 select-none">`;

            images.forEach(i => {
                html += `
                <a href="${cdn}/${i.url}" onclick="return openLightbox(this.href)" 
                   class="block relative aspect-square bg-skin-base border border-skin-border rounded overflow-hidden group">
                    <img src="${cdn}/${i.thumbnail_url}" 
                         class="w-full h-full object-cover transition-opacity duration-200 group-hover:opacity-90" 
                         loading="lazy" alt="img">
                    <div class="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity truncate">
                        ${Math.round(i.size/1024)}KB
                    </div>
                </a>`;
            });

            html += `</div>`;
            return html;
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
            <div class="flex items-center justify-between text-xs text-skin-muted mb-2 border-b border-skin-border/40 pb-1">
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

    // 1. Anti-Bot Handler
    // We attach to the body. HTMX events bubble up.
    document.body.addEventListener('htmx:configRequest', function(evt) {
        // Only run for POST requests
        if (evt.detail.verb !== 'post') return;

        console.log("KR: Signing Request..."); // Debug log

        const key = getCookie("client_key");
        if (!key) {
            console.error("KR: Security key missing in cookies!");
            return;
        }

        try {
            const reversed = key.split('').reverse().join('');
            const proof = btoa(reversed);

            // Explicitly set the header using bracket notation
            evt.detail.headers['X-K-Proof'] = proof;
            console.log("KR: Signed.");
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
            // A. OP Images
            const opAnchor = document.getElementById('op-images-anchor');
            if (opAnchor) {
                if (data.images && data.images.length > 0) {
                    opAnchor.innerHTML = UI.images(data.images, config.cdn);
                    opAnchor.style.display = 'block';
                } else {
                    opAnchor.style.display = 'none';
                }
            }

            // B. Replies
            const container = document.getElementById(config.targetId);
            if (container && data.posts) {
                container.innerHTML = data.posts.map(item => {
                    const p = item.model;
                    return `
                    <div class="flex gap-2 mb-1" id="p${p.id}">
                        <div class="shrink-0 w-6 text-center text-[10px] text-skin-muted/40 pt-2 select-none">&gt;&gt;</div>
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
                    repliesHtml = `<div class="mt-3 pl-3 border-l-2 border-skin-border/30 space-y-2">` +
                        item.replies.map(r => `
                            <div class="text-xs text-skin-muted bg-skin-base/60 p-2 rounded flex gap-2">
                                <span class="opacity-50">>></span>
                                <div class="truncate">${r.model.content}</div>
                            </div>
                        `).join('') + `</div>`;
                }

                return `
                <div class="bg-skin-surface border border-skin-border rounded-lg p-4 mb-6 shadow-sm hover:border-skin-accent/30 transition-colors">
                    <div class="flex flex-col sm:flex-row gap-4">
                        <div class="shrink-0 w-full sm:w-[150px]">
                            ${UI.images(item.images, config.cdn)}
                        </div>
                        <div class="grow min-w-0">
                            <div class="text-xs text-skin-muted mb-2 flex flex-wrap items-center gap-2">
                                <a href="/${t.board_slug}/thread/${t.id}" class="font-bold text-skin-accent text-sm hover:underline">/${t.board_slug}/${t.id}</a>
                                ${UI.meta({id:t.id, created_at:t.created_at, country_code:t.country_code}, true).replace(/<div.*?>|<\/div>/g,'')}
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

    // 4. Lightbox
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
