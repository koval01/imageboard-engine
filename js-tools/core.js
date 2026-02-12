(function () {
    'use strict';

    // --- Configuration ---
    const POW_DIFFICULTY = 2; // Matches Rust: result[0]==0 && result[1]==0
    const DRAFT_PREFIX = 'kr_draft_';

    // --- Utilities ---

    function getCookie(name) {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? decodeURIComponent(match[2]) : null;
    }

    // --- Security: Proof of Work (Anti-Bot) ---

    async function solvePoW(sessionId) {
        const encoder = new TextEncoder();
        let nonce = 0;

        while (true) {
            // Hash: SHA256(session_id + nonce)
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

        // UI Feedback
        const btn = evt.detail.elt;
        const originalText = btn.innerText;
        // Don't change text if it's the auto-poller, only for submission buttons
        if(btn.tagName === 'BUTTON' && btn.getAttribute('type') === 'submit') {
            btn.innerText = '🛡️...';
        }

        solvePoW(key).then(nonce => {
            if(btn.tagName === 'BUTTON' && btn.getAttribute('type') === 'submit') {
                btn.innerText = originalText;
            }

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

        const saved = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        applyTheme(saved);

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const current = html.getAttribute('data-theme');
                applyTheme(current === 'dark' ? 'light' : 'dark');
            });
        }
    }

    // --- Event Listeners & Global Logic ---

    // 1. Thread Reply Logic (Event Delegation)
    document.addEventListener('click', (e) => {
        // A. Reply Buttons
        if (e.target.closest('.reply-btn') || e.target.closest('.reply-ref')) {
            const target = e.target.closest('.reply-btn') || e.target.closest('.reply-ref');
            if (target.hasAttribute('href') && target.getAttribute('href').startsWith('/')) return; // Allow normal links

            e.preventDefault();
            const id = target.getAttribute('data-id');
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
            // Unique key per thread/board url
            const key = DRAFT_PREFIX + window.location.pathname;
            replyBox.value = localStorage.getItem(key) || '';
            replyBox.addEventListener('input', (e) => localStorage.setItem(key, e.target.value));

            document.body.addEventListener('htmx:afterRequest', (evt) => {
                // Clear draft on successful POST
                if (evt.detail.successful && evt.detail.verb === 'post') {
                    localStorage.removeItem(key);
                    replyBox.value = '';
                }
            });
        }

        // File Inputs (Delegated Change Handler)
        document.body.addEventListener('change', (e) => {
            if (e.target.type === 'file') {
                const label = e.target.parentNode.querySelector('span');
                if (label) {
                    const count = e.target.files.length;
                    label.innerText = count > 0 ? `${count} файл(ів)` : (label.getAttribute('data-default') || 'Файли');
                }
            }
        });
    });

    // 3. HTMX Hooks for Animation Reset
    document.addEventListener('htmx:afterSwap', (evt) => {
        // Reset Animation for circular timer in thread view
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
