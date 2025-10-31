// auth/flows.js
import { Modal } from 'bootstrap';
import { auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from '../services/firebaseConfig.js';
import { attachTaskForm } from '../features/tasks/form.js';
import { attachScaffolding, onAuthed, onLoggedOut, attachSettingsActions } from './ui.js';
import { prettyAuthError } from './pretty.js';

export function attachAuthFlows(state, now) {
    attachScaffolding(state, now);
    attachTaskForm();
    attachSettingsActions(signOut, auth);

    // Inline Log In
    const authEmailEl = document.getElementById('authEmail');
    const pwEl = document.getElementById('authPassword');
    const errBox = document.getElementById('authError');
    const clearAuthError = () => { if (errBox) errBox.textContent = ''; };
    const showAuthError = (m) => { if (errBox) errBox.textContent = m || 'Authentication error. Please try again.'; };

    document.getElementById('doLogin')?.addEventListener('click', async () => {
        const email = authEmailEl?.value?.trim();
        const pw = pwEl?.value || '';
        if (!email || !pw) return;
        try {
            await signInWithEmailAndPassword(auth, email, pw);
            clearAuthError();
        } catch (err) {
            if (err?.code === 'auth/user-not-found') {
                try { await createUserWithEmailAndPassword(auth, email, pw); clearAuthError(); return; }
                catch (e2) { showAuthError(prettyAuthError(e2)); }
            } else {
                showAuthError(prettyAuthError(err));
            }
        }
    });

    // Sign Up
    const suEmailEl = document.getElementById('suEmail');
    const suPwEl = document.getElementById('suPassword');
    const suPw2El = document.getElementById('suPassword2');
    const suErrBox = document.getElementById('signupError');

    document.getElementById('signupForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = suEmailEl?.value?.trim();
        const pw = suPwEl?.value || '';
        const pw2 = suPw2El?.value || '';
        if (!email || !pw || !pw2) return;
        if (pw !== pw2) { if (suErrBox) suErrBox.textContent = 'Passwords do not match.'; return; }

        try {
            await createUserWithEmailAndPassword(auth, email, pw);
            if (suErrBox) suErrBox.textContent = '';
            const signupModalEl = document.getElementById('signupModal');
            if (signupModalEl) Modal.getOrCreateInstance(signupModalEl).hide();
            e.target.reset();
        } catch (err) {
            if (suErrBox) suErrBox.textContent = prettyAuthError(err);
        }
    });

    // Auth state
    let unsub = null;
    onAuthStateChanged(auth, async (user) => {
        if (unsub) { unsub(); unsub = null; }
        if (user) {
            unsub = onAuthed(user, state, now);
        } else {
            onLoggedOut();
            const homeTabBtn = document.querySelector('#home-tab');
            if (homeTabBtn) (await import('bootstrap')).Tab.getOrCreateInstance(homeTabBtn).show();
        }
    });
}
