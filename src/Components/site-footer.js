class SiteFooter extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <footer class="py-3 my-4 border-top text-center">
                <p class="mb-0 text-muted">&copy; 2025 Time Management</p>
            </footer>
        `;
    }
}

customElements.define('site-footer', SiteFooter);