(function () {
    // --- Configuration ---
    const MAGIC_OFFSET = 255;

    // --- Helpers ---

    function getSessionKey() {
        const name = "client_key=";
        const decodedCookie = decodeURIComponent(document.cookie);
        const ca = decodedCookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1);
            if (c.indexOf(name) === 0) return c.substring(name.length, c.length);
        }
        return "";
    }

    // Decryptor with UTF-8 Support
    function unpackData(payloadBase64) {
        if (!payloadBase64) return null;
        try {
            const key = getSessionKey();
            if (!key) throw new Error("No key found in cookies");

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
            console.error("KR_ERR: 0x01", e);
            return null;
        }
    }

    // HTML Generators
    const Gen = {
        // Improved Image Grid Layout
        imgGrid: (images, cdn) => {
            if (!images || images.length === 0) return '';
            const isSingle = images.length === 1;

            let html = `<div class="flex flex-wrap gap-2 mb-3">`;
            images.forEach(img => {
                html += `
                <figure class="group relative flex flex-col shrink-0">
                    <div class="text-[10px] text-skin-muted mb-0.5 flex gap-1 items-center">
                        <a href="${cdn}/${img.url}" target="_blank" class="hover:underline hover:text-skin-link font-medium truncate max-w-[120px]">${img.filename}</a>
                        <span class="opacity-70">(${Math.round(img.size / 1024)}KB, ${img.width}x${img.height})</span>
                    </div>
                    <a href="${cdn}/${img.url}" target="_blank" class="block border border-skin-border bg-black/5 rounded-sm overflow-hidden">
                        <img src="${cdn}/${img.thumbnail_url}" 
                             class="${isSingle ? 'max-w-[250px] max-h-[250px]' : 'w-24 h-24'} object-cover hover:opacity-90 transition-opacity" 
                             alt="${img.filename}" loading="lazy">
                    </a>
                </figure>`;
            });
            html += `</div>`;
            return html;
        },
        flag: (cc) => cc ? `<span class="fi fi-${cc.toLowerCase()} shadow-sm rounded-sm" title="${cc}"></span>` : '',
        date: (ts) => {
            const d = new Date(ts + "Z");
            return `<span class="opacity-80">${d.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>`;
        }
    };

    // --- Hydration Logic ---

    window.__kr_hydrate = function (config) {
        const payloadEl = document.getElementById('__KR_DATA');
        if (!payloadEl) return;

        const raw = payloadEl.textContent;
        const data = unpackData(raw);

        // 1. Handle OP Images (Thread Mode)
        if (config.mode === 'thread' && data.images) {
            const opContainer = document.getElementById('op-images-container');
            if (opContainer) {
                opContainer.innerHTML = Gen.imgGrid(data.images, config.cdn);
                opContainer.classList.remove('hidden');
            }
        }

        const container = document.getElementById(config.targetId);
        if (!container) return;

        // If no data, show error
        if (!data) {
            container.innerHTML = `<div class="p-4 text-center text-skin-red font-mono text-xs">NO_SIGNAL</div>`;
            return;
        }

        let html = '';

        // 2. Thread View (Replies)
        if (config.mode === 'thread' && data.posts) {
            if (data.posts.length === 0) {
                html = `<div class="text-skin-muted text-center italic text-sm py-10">Тред порожній. Будьте першим!</div>`;
            } else {
                data.posts.forEach(item => {
                    const p = item.model;
                    html += `
                    <div class="flex gap-0 group/post" id="p${p.id}">
                        <div class="w-6 sm:w-8 shrink-0 flex flex-col items-center pt-2 opacity-50 text-[10px] text-skin-muted font-mono select-none">
                            <span>&gt;&gt;</span>
                        </div>
                        <div class="grow bg-skin-surface border border-skin-border rounded mb-3 p-3 shadow-sm hover:border-skin-accent/30 transition-colors">
                            <div class="flex justify-between items-start border-b border-skin-border/40 pb-2 mb-2">
                                <div class="text-xs text-skin-muted flex flex-wrap items-center gap-2">
                                    ${Gen.flag(p.country_code)}
                                    <span class="font-bold text-skin-text">Анонім</span>
                                    ${Gen.date(p.created_at)}
                                    <a href="#p${p.id}" class="hover:text-skin-accent hover:underline cursor-pointer" onclick="replyTo(${p.id})">№${p.id}</a>
                                </div>
                                <button class="text-[10px] uppercase font-bold text-skin-muted opacity-0 group-hover/post:opacity-100 transition-opacity hover:text-skin-accent" onclick="replyTo(${p.id})">Відповісти</button>
                            </div>
                            
                            ${Gen.imgGrid(item.images, config.cdn)}
                            
                            <div class="text-sm text-skin-text whitespace-pre-wrap break-words leading-relaxed font-sans">${p.content}</div>
                        </div>
                    </div>`;
                });
            }
        }

        // 3. Board View
        else if (config.mode === 'board' && Array.isArray(data)) {
            data.forEach(item => {
                const t = item.model;

                // Replies Preview
                let repliesHtml = '';
                if (item.replies && item.replies.length > 0) {
                    repliesHtml = `<div class="mt-3 ml-2 sm:ml-6 space-y-2 border-l-2 border-skin-border/30 pl-3">`;
                    item.replies.forEach(r => {
                        const rp = r.model;
                        repliesHtml += `
                        <div class="bg-skin-base/50 border border-skin-border/50 rounded p-2 text-sm flex gap-3">
                            <div class="shrink-0 flex flex-col gap-1">
                                <div class="text-[10px] text-skin-muted whitespace-nowrap">${Gen.date(rp.created_at)}</div>
                                <a href="/${t.board_slug}/thread/${t.id}#p${rp.id}" class="text-[10px] hover:underline text-skin-link">>>${rp.id}</a>
                            </div>
                            <div class="grow min-w-0">
                                ${Gen.imgGrid(r.images, config.cdn)}
                                <div class="truncate text-skin-muted">${rp.content}</div>
                            </div>
                        </div>`;
                    });
                    repliesHtml += `</div>`;
                }

                html += `
                <div class="relative pl-3 hover:bg-skin-surface transition-colors p-4 rounded-lg border border-transparent hover:border-skin-border">
                    <div class="absolute left-0 top-0 bottom-0 w-1 bg-skin-border/30 rounded-l"></div>
                    <article class="flex flex-col sm:flex-row gap-4">
                        ${item.images.length ? `<div class="shrink-0">${Gen.imgGrid(item.images, config.cdn)}</div>` : ''}
                        <div class="grow min-w-0">
                            <div class="text-xs text-skin-muted mb-1 flex flex-wrap gap-2 items-center">
                                ${t.subject ? `<span class="font-bold text-skin-text text-sm">${t.subject}</span>` : ''}
                                ${Gen.flag(t.country_code)}
                                <span class="text-skin-green font-bold">Анонім</span>
                                ${Gen.date(t.created_at)}
                                <a href="/${t.board_slug}/thread/${t.id}" class="text-skin-text bg-skin-base border border-skin-border px-1 rounded text-[10px] hover:border-skin-accent transition-colors">№${t.id}</a>
                                <a href="/${t.board_slug}/thread/${t.id}" class="text-[10px] font-bold text-skin-link hover:underline">[ВІДПОВІСТИ]</a>
                            </div>
                            <div class="text-sm text-skin-text leading-relaxed whitespace-pre-wrap break-words max-h-40 overflow-hidden relative">
                                ${t.content}
                            </div>
                        </div>
                    </article>
                    ${repliesHtml}
                </div>
                <hr class="border-skin-border/30 my-4 last:hidden">`;
            });
        }

        // Inject & Animate
        container.innerHTML = html;
        container.classList.remove('opacity-0');
    };

    // --- Anti-Bot & Re-Hydration ---

    document.body.addEventListener('htmx:configRequest', function (evt) {
        if (evt.detail.verb === 'post') {
            const key = getSessionKey();
            if (!key) return;
            const reversed = key.split('').reverse().join('');
            const proof = btoa(reversed);
            evt.detail.headers['X-K-Proof'] = proof;
        }
    });

    // Re-hydrate when HTMX swaps content (e.g., polling or reply)
    document.body.addEventListener('htmx:afterSwap', function(evt) {
        // Re-run hydration if the swap included the data script
        if (window.__kr_config) {
            window.__kr_hydrate(window.__kr_config);
        }
    });

})();
