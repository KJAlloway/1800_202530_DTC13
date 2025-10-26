import {
    onAuthStateChanged,
} from "firebase/auth";

import { auth } from '/src/Functionality/Firebase/firebaseConfig.js';
import { logoutUser } from '/src/Functionality/Firebase/authentication.js';

class SiteNavbar extends HTMLElement {
    constructor() {
        super();
        this.renderNavbar();
        this.renderAuthControls();
    }

    renderNavbar() {
        this.innerHTML = `
        <div class="d-flex justify-content-between align-items-center bg-dark text-white px-3 py-2">
            <ul class="nav nav-tabs mb-0" id="mainTabs" role="tablist">
                <li class="nav-item" role="presentation">
                    <button class="nav-link active d-flex align-items-center gap-2" id="calendar-tab" data-bs-toggle="tab"
                        data-bs-target="#calendar" type="button" role="tab" aria-controls="calendar" aria-selected="true">
                        <img src="../styles/calendar-month.svg" alt=""> Calendar
                    </button>
                </li>
                <li class="nav-item" role="presentation">
                    <button class="nav-link d-flex align-items-center gap-2" id="home-tab" data-bs-toggle="tab"
                        data-bs-target="#home" type="button" role="tab" aria-controls="home" aria-selected="false">
                        <img src="../styles/home.svg" alt=""> Home
                    </button>
                </li>
                <li class="nav-item" role="presentation">
                    <button class="nav-link d-flex align-items-center gap-2" id="settings-tab" data-bs-toggle="tab"
                        data-bs-target="#settings" type="button" role="tab" aria-controls="settings" aria-selected="false">
                        <img src="../styles/settings.svg" alt=""> Settings
                    </button>
                </li>
            </ul>
            <div id="authControls" class="ms-auto"></div>
        </div>
    `;
    }
    renderAuthControls() {
        const authControls = this.querySelector('#authControls');

        // Initialize with invisible placeholder to maintain layout space
        authControls.innerHTML = `<div class="btn btn-outline-light" style="visibility: hidden; min-width: 80px;">Log out</div>`;

        onAuthStateChanged(auth, (user) => {
            let updatedAuthControl;
            if (user) {
                updatedAuthControl = `<button class="btn btn-outline-light" id="signOutBtn" type="button" style="min-width: 80px;">Log out</button>`;
                authControls.innerHTML = updatedAuthControl;
                const signOutBtn = authControls.querySelector('#signOutBtn');
                signOutBtn?.addEventListener('click', logoutUser);
            } else {
                updatedAuthControl = `<a class="btn btn-outline-light" id="loginBtn" href="/login.html" style="min-width: 80px;">Log in</a>`;
                authControls.innerHTML = updatedAuthControl;
            }
        });
    }
}

customElements.define('site-navbar', SiteNavbar);