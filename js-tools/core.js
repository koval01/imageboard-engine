(function () {
    'use strict';

    const DRAFT_PREFIX = 'kr_draft_';

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
                // We assume structure: <input> <button> <div id="file-list">
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

    // --- Form Submission & HTMX Hooks ---
    function initFormHandling() {
        // Clear forms on success
        document.body.addEventListener('htmx:afterRequest', (evt) => {
            if (evt.detail.successful && evt.detail.verb === 'post') {
                const form = evt.detail.elt.closest('form');
                if (form) {
                    form.reset();
                    // Clear file display
                    const listDisplay = form.querySelector('.file-list-display');
                    if(listDisplay) listDisplay.innerHTML = '';

                    // Clear drafts
                    const key = DRAFT_PREFIX + window.location.pathname;
                    localStorage.removeItem(key);

                    // Optional: Scroll to bottom if in thread mode
                    if(window.location.pathname.includes('/thread/')) {
                        const newPosts = document.getElementById('new-posts');
                        if(newPosts) newPosts.scrollIntoView({ behavior: 'smooth' });
                    }
                }
            }
        });

        // Error handling
        document.body.addEventListener('htmx:responseError', (evt) => {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: `Server responded with ${evt.detail.xhr.status}`,
                toast: true, position: 'top-end', showConfirmButton: false, timer: 3000
            });
        });
    }

    // --- Initialization ---
    document.addEventListener('DOMContentLoaded', () => {
        initTheme();
        initFileInputs();
        initFormHandling();

        // Drafts
        const replyBox = document.getElementById('reply-box');
        if (replyBox) {
            const key = DRAFT_PREFIX + window.location.pathname;
            replyBox.value = localStorage.getItem(key) || '';
            replyBox.addEventListener('input', (e) => localStorage.setItem(key, e.target.value));
        }

        // Global Click Handler
        document.addEventListener('click', (e) => {
            const imgLink = e.target.closest('.file-link');
            if (imgLink) {
                e.preventDefault();
                toggleImage(imgLink);
            }

            const replyRef = e.target.closest('.reply-btn');
            if (replyRef) {
                e.preventDefault();
                const id = replyRef.getAttribute('data-id');
                const box = document.getElementById('reply-box');
                const qr = document.getElementById('quick-reply');
                const formDetails = document.getElementById('post-form-details');

                // If on board index, scroll to top form
                if (formDetails) {
                    formDetails.open = true;
                    formDetails.scrollIntoView();
                }
                // If on thread view, check for quick reply or bottom form
                else if (qr && qr.classList.contains('hidden')) {
                    qr.classList.remove('hidden');
                }

                if (box) {
                    const ref = '>>' + id + '\n';
                    box.value += ref;
                    box.focus();
                }
            }
        });
    });
})();
