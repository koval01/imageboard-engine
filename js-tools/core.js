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

    // --- Helper: UUID Generator ---
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // --- Helper: PoW Solver (SHA-256) ---
    async function solvePoW(sessionId) {
        const encoder = new TextEncoder();
        const salt = generateUUID();
        let nonce = 0;

        while (true) {
            const input = sessionId + salt + nonce.toString();
            const buffer = encoder.encode(input);
            const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
            const hashArray = new Uint8Array(hashBuffer);
            if (hashArray[0] === 0 && hashArray[1] === 0) {
                return { nonce: nonce.toString(), salt: salt };
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
            if(themeLabel) themeLabel.innerText = theme === 'dark' ? 'Ніч' : 'День';
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
        const inputs = document.querySelectorAll('input[type="file"]');
        inputs.forEach(input => {
            input.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                const container = e.target.parentElement.parentElement;
                const listDisplay = container.querySelector('.file-list-display');

                if (listDisplay) {
                    if (files.length > 0) {
                        listDisplay.innerHTML = files.map(f =>
                            `<span class="block text-skin-link">[Файл: ${f.name} (${(f.size/1024).toFixed(0)}KB)]</span>`
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

                // Handle Report Button Logic specifically
                if(evt.target.getAttribute('data-action') === 'report') {
                    evt.preventDefault();
                    const { value: reason } = await Swal.fire({
                        title: 'Поскаржитися',
                        input: 'select',
                        inputOptions: {
                            'spam': 'Спам / Вайп',
                            'illegal': 'Незаконний контент (ЦП)',
                            'violence': 'Насильство',
                            'other': 'Інше'
                        },
                        inputPlaceholder: 'Оберіть причину',
                        showCancelButton: true
                    });

                    if (reason) {
                        evt.target.querySelector('input[name="reason"]').value = reason;
                        // Continue to PoW...
                    } else {
                        return; // Cancelled
                    }
                }

                // Handle Ban Button Logic
                if(evt.target.getAttribute('data-action') === 'ban') {
                    evt.preventDefault();
                    const { value: formValues } = await Swal.fire({
                        title: 'Ban User',
                        html:
                            '<input id="swal-reason" class="swal2-input" placeholder="Причина">' +
                            '<select id="swal-duration" class="swal2-input">' +
                            '<option value="1">1 Година</option>' +
                            '<option value="24">24 Години</option>' +
                            '<option value="168">7 Днів</option>' +
                            '<option value="720">30 Днів</option>' +
                            '<option value="87600">Назавжди</option>' +
                            '</select>',
                        focusConfirm: false,
                        preConfirm: () => {
                            return [
                                document.getElementById('swal-reason').value,
                                document.getElementById('swal-duration').value
                            ]
                        }
                    });

                    if (formValues) {
                        evt.target.querySelector('input[name="reason"]').value = formValues[0] || 'Rule violation';
                        evt.target.querySelector('input[name="duration_hours"]').value = formValues[1];
                    } else {
                        return;
                    }
                }

                evt.preventDefault();

                const clientKey = getCookie('client_key');
                if (!clientKey) {
                    evt.detail.issueRequest();
                    return;
                }

                document.body.style.cursor = 'wait';
                const form = evt.detail.elt.tagName === 'FORM' ? evt.detail.elt : evt.detail.elt.closest('form');
                const submitBtn = form ? form.querySelector('button[type="submit"]') : null;

                if(submitBtn) {
                    submitBtn.disabled = true;
                    const txtSpan = submitBtn.querySelector('.btn-text');
                    if(txtSpan) {
                        txtSpan.setAttribute('data-original', txtSpan.innerText);
                        txtSpan.innerText = 'Verifying...';
                    }
                }

                try {
                    const powData = await solvePoW(clientKey);
                    evt.detail.elt.setAttribute('data-pow-nonce', powData.nonce);
                    evt.detail.elt.setAttribute('data-pow-salt', powData.salt);
                    evt.detail.issueRequest();
                } catch (e) {
                    console.error("PoW Error", e);
                } finally {
                    document.body.style.cursor = 'default';
                    if(submitBtn) {
                        submitBtn.disabled = false;
                        const txtSpan = submitBtn.querySelector('.btn-text');
                        if(txtSpan && txtSpan.getAttribute('data-original')) {
                            txtSpan.innerText = txtSpan.getAttribute('data-original');
                        }
                    }
                }
            }
        });

        document.body.addEventListener('htmx:configRequest', (evt) => {
            if (evt.detail.verb === 'post') {
                const nonce = evt.detail.elt.getAttribute('data-pow-nonce');
                const salt = evt.detail.elt.getAttribute('data-pow-salt');
                if (nonce && salt) {
                    evt.detail.headers['X-PoW-Nonce'] = nonce;
                    evt.detail.headers['X-PoW-Salt'] = salt;
                    evt.detail.elt.removeAttribute('data-pow-nonce');
                    evt.detail.elt.removeAttribute('data-pow-salt');
                }
            }
        });

        document.body.addEventListener('htmx:afterRequest', (evt) => {
            if (evt.detail.successful && evt.detail.verb === 'post') {
                const form = evt.detail.elt.closest('form');
                // Don't reset if it's an admin action form (ban/delete) which usually replaces itself or row
                if (form && !form.getAttribute('data-no-reset')) {
                    if(form.querySelector('textarea') || form.querySelector('input[type="text"]')) {
                        form.reset();
                        const listDisplay = form.querySelector('.file-list-display');
                        if(listDisplay) {
                            listDisplay.innerHTML = '';
                            listDisplay.classList.add('hidden');
                        }
                        const key = DRAFT_PREFIX + window.location.pathname;
                        localStorage.removeItem(key);
                    }
                }

                // Auto-scroll on new posts
                if(window.location.pathname.includes('/thread/') && evt.detail.target.id === 'new-posts') {
                    // Update polling trigger to latest ID
                    const newPosts = evt.detail.target.querySelectorAll('.post-container');
                    if(newPosts.length > 0) {
                        const lastId = newPosts[newPosts.length - 1].id.replace('p', '');
                        const pollDiv = document.getElementById('poll-trigger');
                        if(pollDiv) {
                            pollDiv.setAttribute('hx-vals', `{"after": ${lastId}}`);
                        }
                    }
                }
            }
        });

        document.body.addEventListener('htmx:responseError', (evt) => {
            let msg = `Server responded with ${evt.detail.xhr.status}`;
            if (evt.detail.xhr.status === 429) msg = "Занадто швидко. Зачекайте.";
            else if (evt.detail.xhr.status === 403) msg = "Помилка безпеки. Оновіть сторінку.";

            Swal.fire({
                icon: 'error',
                title: 'Помилка',
                text: msg,
                toast: true, position: 'top-end', showConfirmButton: false, timer: 3000
            });
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        initTheme();
        initFileInputs();
        initFormHandling();

        const replyBox = document.getElementById('reply-box');
        if (replyBox) {
            const key = DRAFT_PREFIX + window.location.pathname;
            replyBox.value = localStorage.getItem(key) || '';
            replyBox.addEventListener('input', (e) => localStorage.setItem(key, e.target.value));
        }

        document.addEventListener('click', (e) => {
            const imgLink = e.target.closest('.file-link');
            if (imgLink) {
                // If it's a link to the file on home page, do nothing (let it open new tab)
                // But if it has a toggle class (not implemented on home currently), toggle.
                // Request said: "on home page, clicking photo takes to post".
                // We handle that via HTML href change.
                // For thread view expansion:
                if(!imgLink.closest('.thread-container')) return; // Allow normal link behavior on home if needed

                e.preventDefault();
                toggleImage(imgLink);
            }

            const replyRef = e.target.closest('.reply-btn');
            if (replyRef) {
                e.preventDefault();
                const id = replyRef.getAttribute('data-id');
                const box = document.getElementById('reply-box');
                const formDetails = document.getElementById('post-form-details');

                if (formDetails) {
                    formDetails.open = true;
                    formDetails.scrollIntoView({ behavior: 'smooth' });
                } else if (box) {
                    box.scrollIntoView({ behavior: 'smooth' });
                }

                if (box) {
                    const ref = '>>' + id + '\n';
                    const text = box.value;
                    box.value = text + ref;
                    box.focus();
                }
            }
        });
    });
})();
