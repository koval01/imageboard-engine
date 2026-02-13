(function () {
    'use strict';

    const DRAFT_PREFIX = 'kr_draft_';

    // --- Helper: Cookies ---
    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }

    // --- Helper: PoW Solver (SHA-256) ---
    async function solvePoW(sessionId) {
        const encoder = new TextEncoder();
        let nonce = 0;
        while (true) {
            // Format: session_id + nonce
            // Target: Starts with 0x00 0x00 (approx 65k hashes, ~200ms on modern CPU)
            const input = sessionId + nonce.toString();
            const buffer = encoder.encode(input);
            const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
            const hashArray = new Uint8Array(hashBuffer);

            // Check if first 2 bytes are 0
            if (hashArray[0] === 0 && hashArray[1] === 0) {
                return nonce.toString();
            }
            nonce++;
        }
    }

    // --- Theme Manager ---
    function initTheme() {
        const html = document.documentElement;
        const toggleBtn = document.getElementById('theme-toggle');
        const themeLabel = document.getElementById('theme-label');

        function applyTheme(theme) {
            html.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
            if(themeLabel) themeLabel.innerText = theme === 'dark' ? 'Tomorrow' : 'Yotsuba B';
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

    // --- Image Expansion ---
    function toggleImage(anchor) {
        const img = anchor.querySelector('img');
        if (!img) return;
        if (anchor.classList.contains('expanded')) {
            img.src = img.getAttribute('data-thumb');
            img.classList.remove('file-expanded');
            img.classList.add('file-thumb');
            anchor.classList.remove('expanded');
            img.style.width = ""; img.style.height = "";
        } else {
            if(!img.getAttribute('data-thumb')) img.setAttribute('data-thumb', img.src);
            img.src = anchor.href;
            img.classList.remove('file-thumb');
            img.classList.add('file-expanded');
            anchor.classList.add('expanded');
            img.style.width = "auto"; img.style.height = "auto";
        }
    }

    // --- File Input Feedback ---
    function initFileInputs() {
        // Find all file inputs (main form and quick reply)
        const inputs = document.querySelectorAll('input[type="file"]');
        inputs.forEach(input => {
            input.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                // Look for a sibling container to show names
                // Structure: <input> <button> ... <div class="file-list-display">
                const container = e.target.parentElement.parentElement;
                const listDisplay = container.querySelector('.file-list-display');

                if (listDisplay) {
                    if (files.length > 0) {
                        listDisplay.innerHTML = files.map(f =>
                            `<span class="block text-skin-link">[File: ${f.name} (${(f.size/1024).toFixed(0)}KB)]</span>`
                        ).join('');
                        listDisplay.classList.remove('hidden');
                    } else {
                        listDisplay.innerHTML = '';
                        listDisplay.classList.add('hidden');
                    }
                }
            });
        });
    }

    // --- Form & HTMX Hooks (PoW Integration) ---
    function initFormHandling() {
        // 1. Intercept Confirmation to compute PoW
        document.body.addEventListener('htmx:confirm', async (evt) => {
            if (evt.detail.verb === 'post') {
                evt.preventDefault(); // Pause request execution

                const clientKey = getCookie('client_key');
                if (!clientKey) {
                    console.warn("No client key found, skipping PoW (middleware will likely block)");
                    evt.detail.issueRequest();
                    return;
                }

                // UI Feedback
                document.body.style.cursor = 'wait';
                const submitBtn = evt.target.querySelector('button[type="submit"]');
                if(submitBtn) submitBtn.disabled = true;

                try {
                    const nonce = await solvePoW(clientKey);

                    // Attach nonce to element attribute so configRequest can read it synchronously
                    evt.detail.elt.setAttribute('data-pow-nonce', nonce);

                    // Resume request
                    evt.detail.issueRequest();
                } catch (e) {
                    console.error("PoW Calculation Error", e);
                    Swal.fire({
                        icon: 'error',
                        title: 'Security Check Failed',
                        text: 'Could not compute Proof of Work. Reload the page.',
                        toast: true, position: 'top-end', showConfirmButton: false, timer: 3000
                    });
                } finally {
                    document.body.style.cursor = 'default';
                    if(submitBtn) submitBtn.disabled = false;
                }
            }
        });

        // 2. Inject Header just before sending
        document.body.addEventListener('htmx:configRequest', (evt) => {
            if (evt.detail.verb === 'post') {
                const nonce = evt.detail.elt.getAttribute('data-pow-nonce');
                if (nonce) {
                    evt.detail.headers['X-PoW-Nonce'] = nonce;
                    // Clean up
                    evt.detail.elt.removeAttribute('data-pow-nonce');
                }
            }
        });

        // 3. Handle Success (Clear form)
        document.body.addEventListener('htmx:afterRequest', (evt) => {
            if (evt.detail.successful && evt.detail.verb === 'post') {
                const form = evt.detail.elt.closest('form');
                if (form) {
                    form.reset();
                    // Clear file list display
                    const listDisplay = form.querySelector('.file-list-display');
                    if(listDisplay) {
                        listDisplay.innerHTML = '';
                        listDisplay.classList.add('hidden');
                    }

                    // Remove saved draft
                    const key = DRAFT_PREFIX + window.location.pathname;
                    localStorage.removeItem(key);

                    // Scroll to new posts if on thread page
                    if(window.location.pathname.includes('/thread/')) {
                        const newPosts = document.getElementById('new-posts');
                        if(newPosts) newPosts.scrollIntoView({ behavior: 'smooth' });
                    }
                }
            }
        });

        // 4. Handle Errors
        document.body.addEventListener('htmx:responseError', (evt) => {
            let msg = `Server responded with ${evt.detail.xhr.status}`;

            if (evt.detail.xhr.status === 429) {
                msg = "You are posting too fast. Please wait.";
            } else if (evt.detail.xhr.status === 403) {
                const resp = JSON.parse(evt.detail.xhr.responseText || "{}");
                msg = resp.error || "Security check failed. Please refresh.";
            }

            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: msg,
                toast: true, position: 'top-end', showConfirmButton: false, timer: 3000
            });
        });
    }

    // --- Initialization ---
    document.addEventListener('DOMContentLoaded', () => {
        initTheme();
        initFileInputs();
        initFormHandling();

        // Restore Drafts
        const replyBox = document.getElementById('reply-box');
        if (replyBox) {
            const key = DRAFT_PREFIX + window.location.pathname;
            replyBox.value = localStorage.getItem(key) || '';
            replyBox.addEventListener('input', (e) => localStorage.setItem(key, e.target.value));
        }

        // Global Click Delegations
        document.addEventListener('click', (e) => {
            // 1. Expand Images
            const imgLink = e.target.closest('.file-link');
            if (imgLink) {
                e.preventDefault();
                toggleImage(imgLink);
            }

            // 2. Reply to ID
            const replyRef = e.target.closest('.reply-btn');
            if (replyRef) {
                e.preventDefault();
                const id = replyRef.getAttribute('data-id');
                const box = document.getElementById('reply-box');
                const formDetails = document.getElementById('post-form-details');

                // Logic: If board index -> Scroll top form. If thread -> Scroll bottom form.
                if (formDetails) {
                    formDetails.open = true;
                    formDetails.scrollIntoView({ behavior: 'smooth' });
                } else if (box) {
                    box.scrollIntoView({ behavior: 'smooth' });
                }

                // Insert quote
                if (box) {
                    const ref = '>>' + id + '\n';
                    // Append text or focus
                    const startPos = box.selectionStart;
                    const endPos = box.selectionEnd;
                    const text = box.value;
                    // Append to end if not selected, or insert at cursor
                    box.value = text + ref;
                    box.focus();
                }
            }
        });
    });
})();
