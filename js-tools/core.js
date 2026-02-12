(function () {
    'use strict';

    // --- Configuration ---
    const POW_DIFFICULTY = 2; // Matches Rust: result[0]==0 && result[1]==0 (16 bits)
    const DRAFT_PREFIX = 'kr_draft_';

    // --- Utilities ---

    function getCookie(name) {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? decodeURIComponent(match[2]) : null;
    }

    // --- Security: Proof of Work ---

    async function solvePoW(sessionId) {
        const encoder = new TextEncoder();
        let nonce = 0;

        // Brute force until hash starts with 0x00 0x00
        while (true) {
            const input = encoder.encode(sessionId + nonce.toString());
            const hashBuffer = await crypto.subtle.digest('SHA-256', input);
            const hashArray = new Uint8Array(hashBuffer);

            // Check difficulty (First 2 bytes must be 0)
            if (hashArray[0] === 0 && hashArray[1] === 0) {
                return nonce.toString();
            }
            nonce++;
        }
    }

    // Intercept HTMX requests to inject PoW
    document.body.addEventListener('htmx:configRequest', function(evt) {
        // Only guard POST requests (Write actions)
        if (evt.detail.verb !== 'post') return;

        const key = getCookie("client_key");
        if (!key) {
            console.error("KR: Session key missing.");
            evt.preventDefault();
            return;
        }

        // If nonce is already calculated, let it pass
        if (evt.detail.headers['X-PoW-Nonce']) return;

        // Otherwise, stop request, solve puzzle, then retry
        evt.preventDefault();

        // Update UI to show work is being done (optional, but good UX)
        const btn = evt.detail.elt;
        const originalText = btn.innerText;
        if(btn.tagName === 'BUTTON') btn.innerText = '🛡️...';

        console.time("PoW");
        solvePoW(key).then(nonce => {
            console.timeEnd("PoW");
            if(btn.tagName === 'BUTTON') btn.innerText = originalText;

            // Clone detail to preserve parameters
            const newReq = evt.detail;
            newReq.headers['X-PoW-Nonce'] = nonce;

            // Re-trigger the request manually via HTMX
            htmx.ajax('POST', newReq.path, {
                source: newReq.elt,
                target: newReq.target,
                headers: newReq.headers,
                values: newReq.parameters,
                swap: newReq.swapOverride
            });
        });
    });

    // --- Theme Manager ---

    function initTheme() {
        const html = document.documentElement;
        const toggleBtn = document.getElementById('theme-toggle');
        const iconLight = document.getElementById('icon-light');
        const iconDark = document.getElementById('icon-dark');

        function applyTheme(theme) {
            html.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
            if (theme === 'dark') {
                iconLight?.classList.remove('hidden');
                iconDark?.classList.add('hidden');
            } else {
                iconLight?.classList.add('hidden');
                iconDark?.classList.remove('hidden');
            }
        }

        // Load saved or preference
        const saved = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        applyTheme(saved);

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const current = html.getAttribute('data-theme');
                applyTheme(current === 'dark' ? 'light' : 'dark');
            });
        }
    }

    // --- UI Generators (Hydration) ---

    const UI = {
        images: (images, cdn) => {
            if (!images || images.length === 0) return '';
            let html = `<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 select-none">`;
            images.forEach(i => {
                html += `
                <a href="${cdn}/${i.url}" class="lightbox-trigger block relative aspect-square bg-skin-base border border-skin-border rounded overflow-hidden group">
                    <img src="${cdn}/${i.thumbnail_url}" class="w-full h-full object-cover transition-opacity duration-200 group-hover:opacity-90" loading="lazy" alt="img">
                    <div class="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity truncate">
                        ${Math.round(i.size/1024)}KB
                    </div>
                </a>`;
            });
            html += `</div>`;
            return html;
        },
        meta: (p, isOp) => {
            const d = new Date(p.created_at + "Z"); // UTC
            const dateStr = d.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
            const flag = p.country_code ? `<span class="fi fi-${p.country_code.toLowerCase()} rounded-[2px] shadow-sm mr-1"></span>` : '';
            return `
            <div class="flex items-center justify-between text-xs text-skin-muted mb-2 border-b border-skin-border/40 pb-1">
                <div class="flex items-center gap-2">
                    <div class="flex items-center">${flag} <span class="font-bold text-[#15803d]">Анонім</span></div>
                    <span class="opacity-70">${dateStr}</span>
                </div>
                <div class="flex items-center gap-2">
                    <a href="#p${p.id}" class="hover:text-skin-accent hover:underline font-mono reply-ref" data-id="${p.id}">№${p.id}</a>
                    ${!isOp ? `<span class="cursor-pointer hover:text-skin-text opacity-50 hover:opacity-100 reply-btn" data-id="${p.id}">↵</span>` : ''}
                </div>
            </div>`;
        },
        content: (text) => {
            if (!text) return '';
            // Basic escaping and greentexting
            const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            const processed = escaped.split('\n').map(line => {
                if (line.trim().startsWith('&gt;')) return `<span class="text-[#789922]">${line}</span>`;
                return line;
            }).join('<br>');
            return `<div class="text-sm text-skin-text leading-relaxed whitespace-pre-wrap break-words font-sans">${processed}</div>`;
        }
    };

    window.__kr_hydrate = function (config) {
        const payloadEl = document.getElementById('__KR_DATA');
        if (!payloadEl) return;

        let data;
        try {
            data = JSON.parse(payloadEl.textContent);
        } catch (e) {
            console.error("KR: JSON parse error", e);
            return;
        }

        if (config.mode === 'thread') {
            // Render OP Images
            const opAnchor = document.getElementById('op-images-anchor');
            if (opAnchor) {
                opAnchor.innerHTML = data.images?.length ? UI.images(data.images, config.cdn) : '';
                opAnchor.classList.toggle('hidden', !data.images?.length);
            }
            // Render Replies
            const container = document.getElementById(config.targetId);
            if (container && data.posts) {
                container.innerHTML = data.posts.map(item => `
                    <div class="flex gap-2 mb-1" id="p${item.model.id}">
                        <div class="shrink-0 w-6 text-center text-[10px] text-skin-muted/40 pt-2 select-none">&gt;&gt;</div>
                        <div class="grow bg-skin-surface border border-skin-border rounded shadow-sm p-3 min-w-0">
                            ${UI.meta(item.model, false)}
                            ${UI.images(item.images, config.cdn)}
                            ${UI.content(item.model.content)}
                        </div>
                    </div>`).join('');
                container.classList.remove('opacity-0');
            }
        } else if (config.mode === 'board') {
            const container = document.getElementById(config.targetId);
            if (container) {
                container.innerHTML = data.map(item => {
                    const t = item.model;
                    const repliesHtml = item.replies?.length ?
                        `<div class="mt-3 pl-3 border-l-2 border-skin-border/30 space-y-2">` +
                        item.replies.map(r => `
                            <div class="text-xs text-skin-muted bg-skin-base/60 p-2 rounded flex gap-2">
                                <span class="opacity-50">>></span>
                                <div class="truncate">${r.model.content}</div>
                            </div>`).join('') + `</div>` : '';

                    return `
                    <div class="bg-skin-surface border border-skin-border rounded-lg p-4 mb-6 shadow-sm hover:border-skin-accent/30 transition-colors">
                        <div class="flex flex-col sm:flex-row gap-4">
                            <div class="shrink-0 w-full sm:w-[150px]">${UI.images(item.images, config.cdn)}</div>
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
        }
    };

    // --- Event Listeners & Global Logic ---

    // 1. Thread Reply Logic (Event Delegation)
    document.addEventListener('click', (e) => {
        // A. Reply Buttons
        if (e.target.matches('.reply-btn') || e.target.matches('.reply-ref')) {
            e.preventDefault();
            const id = e.target.getAttribute('data-id');
            const box = document.getElementById('reply-box');
            const panel = document.getElementById('reply-panel');

            if (box && panel) {
                panel.classList.remove('translate-y-[120%]');
                const ref = '>>' + id + '\n';
                box.value += (box.value.length > 0 && box.value.slice(-1) !== '\n') ? '\n' + ref : ref;
                box.focus();
                box.scrollTop = box.scrollHeight;
                box.dispatchEvent(new Event('input')); // Trigger autosave
            }
        }

        // B. Lightbox Triggers
        const lbTrigger = e.target.closest('.lightbox-trigger');
        if (lbTrigger) {
            e.preventDefault();
            const url = lbTrigger.getAttribute('href');
            const lb = document.getElementById('lightbox');
            const img = document.getElementById('lightbox-img');
            if (lb && img) {
                img.src = url;
                lb.classList.remove('hidden');
                document.body.style.overflow = 'hidden';
            }
        }

        // C. Close Lightbox
        if (e.target.id === 'lightbox') {
            e.target.classList.add('hidden');
            document.body.style.overflow = '';
            document.getElementById('lightbox-img').src = '';
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.getElementById('lightbox')?.classList.add('hidden');
            document.body.style.overflow = '';
        }
    });

    // 2. Draft Saving & File Inputs
    document.addEventListener('DOMContentLoaded', () => {
        initTheme();

        // Disclaimer
        if (!localStorage.getItem('kryivka_disclaimer_accepted')) {
            Swal.fire({
                title: 'Ласкаво просимо',
                html: `<div class="text-left text-sm space-y-3"><p>Анонімний простір. Контент 18+.</p></div>`,
                icon: 'info',
                showCancelButton: true,
                confirmButtonText: 'Вхід',
                cancelButtonText: 'Вихід',
                confirmButtonColor: 'var(--color-primary)',
                cancelButtonColor: '#71717a',
                background: 'var(--color-bg-surface)',
                color: 'var(--color-text-base)',
                allowOutsideClick: false,
                allowEscapeKey: false
            }).then((res) => {
                if (res.isConfirmed) localStorage.setItem('kryivka_disclaimer_accepted', 'true');
                else window.location.href = "https://google.com";
            });
        }

        // Drafts
        const replyBox = document.getElementById('reply-box');
        if (replyBox) {
            const key = DRAFT_PREFIX + window.location.pathname;
            replyBox.value = localStorage.getItem(key) || '';
            replyBox.addEventListener('input', (e) => localStorage.setItem(key, e.target.value));

            document.body.addEventListener('htmx:afterRequest', (evt) => {
                if (evt.detail.successful && evt.target.id === 'reply-form') {
                    localStorage.removeItem(key);
                    replyBox.value = '';
                }
            });
        }

        // File Inputs (Delegated Change Handler)
        document.body.addEventListener('change', (e) => {
            if (e.target.type === 'file') {
                const label = e.target.parentNode.querySelector('span'); // Assuming standard layout
                if (label) {
                    const count = e.target.files.length;
                    label.innerText = count > 0 ? `${count} файл(ів)` : (label.getAttribute('data-default') || 'Файли');
                }
            }
        });
    });

    // 3. HTMX Hooks
    document.addEventListener('htmx:afterSwap', (evt) => {
        // Re-hydrate logic
        if (window.__kr_config && typeof window.__kr_hydrate === 'function') {
            window.__kr_hydrate(window.__kr_config);
        }

        // Reset Animation for circular timer
        const timer = document.getElementById('timer-circle');
        if (timer) {
            timer.classList.remove('timer-anim');
            void timer.offsetWidth; // Force Reflow
            timer.classList.add('timer-anim');
        }
    });

    // HTMX Error Toasts
    document.body.addEventListener('htmx:responseError', (evt) => {
        Swal.fire({
            icon: 'error',
            title: 'Помилка',
            text: `Код: ${evt.detail.xhr.status}`,
            toast: true, position: 'top-end', showConfirmButton: false, timer: 3000,
            background: 'var(--color-bg-surface)', color: 'var(--color-text-base)'
        });
    });

    document.body.addEventListener('htmx:sendError', () => {
        Swal.fire({
            icon: 'warning',
            title: 'Помилка мережі',
            toast: true, position: 'top-end', showConfirmButton: false, timer: 3000,
            background: 'var(--color-bg-surface)', color: 'var(--color-text-base)'
        });
    });

})();
