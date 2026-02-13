(function () {
    'use strict';

    // --- Configuration ---
    const POW_DIFFICULTY = 2; // result[0]==0 && result[1]==0
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
            const input = encoder.encode(sessionId + nonce.toString());
            const hashBuffer = await crypto.subtle.digest('SHA-256', input);
            const hashArray = new Uint8Array(hashBuffer);
            if (hashArray[0] === 0 && hashArray[1] === 0) return nonce.toString();
            nonce++;
        }
    }

    document.body.addEventListener('htmx:configRequest', function(evt) {
        if (evt.detail.verb !== 'post') return;
        const key = getCookie("client_key");
        if (!key) return;
        if (evt.detail.headers['X-PoW-Nonce']) return;
        evt.preventDefault();
        const btn = evt.detail.elt;
        const originalText = btn.innerText;
        if(btn.tagName === 'BUTTON') btn.innerText = 'Wait...';

        solvePoW(key).then(nonce => {
            if(btn.tagName === 'BUTTON') btn.innerText = originalText;
            const newReq = evt.detail;
            newReq.headers['X-PoW-Nonce'] = nonce;
            htmx.ajax('POST', newReq.path, {
                source: newReq.elt, target: newReq.target, headers: newReq.headers,
                values: newReq.parameters, swap: newReq.swapOverride
            });
        });
    });

    // --- Theme Manager ---
    function initTheme() {
        const html = document.documentElement;
        const toggleBtn = document.getElementById('theme-toggle');

        function applyTheme(theme) {
            html.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
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

    // --- Image Expansion (Classic Style) ---
    function toggleImage(anchor) {
        const img = anchor.querySelector('img');
        if (!img) return;

        if (anchor.classList.contains('expanded')) {
            // Shrink
            img.src = img.getAttribute('data-thumb');
            img.classList.remove('file-expanded');
            img.classList.add('file-thumb');
            anchor.classList.remove('expanded');
            img.style.width = "";
            img.style.height = "";
        } else {
            // Expand
            // Save thumb source if not saved
            if(!img.getAttribute('data-thumb')) img.setAttribute('data-thumb', img.src);

            img.src = anchor.href; // Switch to full res
            img.classList.remove('file-thumb');
            img.classList.add('file-expanded');
            anchor.classList.add('expanded');
            // Remove w/h attributes to allow css resizing
            img.style.width = "auto";
            img.style.height = "auto";
        }
    }

    // --- Reply Logic ---
    function insertReply(id) {
        const box = document.getElementById('reply-box');
        const formDetails = document.getElementById('post-form-details');
        const quickReply = document.getElementById('quick-reply');

        // Use Quick Reply if available (not hidden) or scroll to form
        if (quickReply && !quickReply.classList.contains('hidden')) {
            // Logic for QR is simplified here
        } else if (formDetails) {
            if (!formDetails.open) formDetails.open = true;
        }

        if (box) {
            const ref = '>>' + id + '\n';
            box.value += (box.value.length > 0 && box.value.slice(-1) !== '\n') ? '\n' + ref : ref;
            box.focus();
        }
    }

    // --- Quote Preview (Hover) ---
    function initQuotePreviews() {
        let popup = document.getElementById('quote-preview');
        if (!popup) {
            popup = document.createElement('div');
            popup.id = 'quote-preview';
            document.body.appendChild(popup);
        }

        document.addEventListener('mouseover', (e) => {
            if (e.target.classList.contains('quote-link')) {
                const id = e.target.getAttribute('href').replace('#p', '');
                const post = document.getElementById('p' + id);

                if (post) {
                    const clone = post.cloneNode(true);
                    // Extract just the post content part
                    const inner = clone.querySelector('.post');
                    if(inner) {
                        popup.innerHTML = inner.innerHTML;
                        popup.style.display = 'block';
                        popup.style.top = (e.pageY + 20) + 'px';
                        popup.style.left = (e.pageX + 20) + 'px';
                    }
                }
            }
        });

        document.addEventListener('mouseout', (e) => {
            if (e.target.classList.contains('quote-link')) {
                popup.style.display = 'none';
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (popup.style.display === 'block') {
                popup.style.top = (e.pageY + 20) + 'px';
                popup.style.left = (e.pageX + 20) + 'px';
            }
        });
    }

    // --- Initialization ---
    document.addEventListener('DOMContentLoaded', () => {
        initTheme();
        initQuotePreviews();

        // Global Click Handler
        document.addEventListener('click', (e) => {
            // Image Expansion
            const imgLink = e.target.closest('.file-link');
            if (imgLink) {
                e.preventDefault();
                toggleImage(imgLink);
            }

            // Reply Reference (>>12345)
            const replyRef = e.target.closest('.reply-btn');
            if (replyRef) {
                e.preventDefault();
                insertReply(replyRef.getAttribute('data-id'));
            }
        });

        // Drafts
        const replyBox = document.getElementById('reply-box');
        if (replyBox) {
            const key = DRAFT_PREFIX + window.location.pathname;
            replyBox.value = localStorage.getItem(key) || '';
            replyBox.addEventListener('input', (e) => localStorage.setItem(key, e.target.value));
            document.body.addEventListener('htmx:afterRequest', (evt) => {
                if (evt.detail.successful && evt.detail.verb === 'post') {
                    localStorage.removeItem(key);
                    replyBox.value = '';
                }
            });
        }

        // File Input Label
        document.body.addEventListener('change', (e) => {
            if (e.target.type === 'file') {
                const btn = document.getElementById('file-btn-label');
                if(btn) btn.innerText = e.target.files.length > 0 ? e.target.files.length + ' files' : 'Choose File';
            }
        });
    });

})();