// src/auth/flows.js
/**Imports
 * Modal -> a controller class for opening and closing bootstrap modals
 * Tab -> a controller class for switching tabbed navigation
 */
import { Modal, Tab } from "bootstrap";
/**Imports
 * Firebase imports
 */
import {
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "../services/firebaseConfig.js";

import { attachTaskForm } from "../features/tasks/form.js";
/**Imports
 * Functions for conttrolling UI reactions to authentication changes
 */
import {
  attachScaffolding,
  onAuthed,
  onLoggedOut,
  attachSettingsActions,
} from "./ui.js";
/**Imports
 * imports error messages from pretty.js
 */
import { prettyAuthError } from "./pretty.js";

/** called to prepare UI, attach button listeners, set up login/sign up forms,
 * listen to Firebase for authentication, and connect the rest of the app to authentication
 */
export function attachAuthFlows(state, now) {
  // Initial UI scaffolding (hides app until authed, builds calendar shell)

  /**
   * Prepares the app before user logs in and hides components that require authentication
   * Initializes task creation form / prepares task UI
   * Wires up settigns tab actions
   */
  attachScaffolding(state, now);
  attachTaskForm();
  attachSettingsActions(signOut, auth);

  // ---------- Inline Log In ----------
  /** Login Form
   * Accesses input from email element
   * Accesses input from passsword element
   * Accesses the error message from errorBox element
   */
  const authEmailEl = document.getElementById("authEmail");
  const pwEl = document.getElementById("authPassword");
  const errBox = document.getElementById("authError");

  /**
   * Clears error message displayed in the login form
   * If a message is provided, display it, if not display default error message
   */
  const clearAuthError = () => {
    if (errBox) errBox.textContent = "";
  };
  const showAuthError = (m) => {
    if (errBox)
      errBox.textContent = m || "Authentication error. Please try again.";
  };

  /**
   * Attach login button listener
   */
  document.getElementById("doLogin")?.addEventListener("click", async () => {
    /**
     * Reads the value of email and password if they exist
     * Password defaults to an empty string
     */
    const email = authEmailEl?.value?.trim();
    const pw = pwEl?.value || "";
    // If either password or email are missing or empty, stop
    // Done to prevent useless events
    if (!email || !pw) return;

    /**
     * Try to sign in with retrieved email and password
     * Clear old error messages
     */
    try {
      await signInWithEmailAndPassword(auth, email, pw);
      clearAuthError();
    } catch (err) {
      /**
       * If login fails
       */
      /**
       * If user does not exist
       */
      if (err?.code === "auth/user-not-found") {
        /**
         * Firebase attempts to create a user
         * if succesful, they are logged in and errors are cleared
         */
        try {
          await createUserWithEmailAndPassword(auth, email, pw);
          clearAuthError();
          return;
        } catch (e2) {
          /**
           * If account creation fails,
           * Show assossiated error
           */
          showAuthError(prettyAuthError(e2));
        }
      } else {
        /**
         * Displays assosiated login error
         */
        showAuthError(prettyAuthError(err));
      }
    }
  });

  // ---------- Sign Up (modal form) ----------
  /**
   * Gets value of email input
   * Gets value of password input
   * Gets value of password confirmation input
   * Gets value of error box
   */
  const suEmailEl = document.getElementById("suEmail");
  const suPwEl = document.getElementById("suPassword");
  const suPw2El = document.getElementById("suPassword2");
  const suErrBox = document.getElementById("signupError");

  /**
   * Add submit handler if sighupForm exists
   */
  document
    .getElementById("signupForm")
    ?.addEventListener("submit", async (e) => {
      // Prevent page reload
      e.preventDefault();
      /**
       * Reads the value of email, password, and conf. password if they exist
       * Passwords default to an empty string
       */
      const email = suEmailEl?.value?.trim();
      const pw = suPwEl?.value || "";
      const pw2 = suPw2El?.value || "";
      /**
       * If either email or the one of the two passwords is empty, stop
       */
      if (!email || !pw || !pw2) return;
      /**
       * Ensure passwords match, if not stop
       */
      if (pw !== pw2) {
        if (suErrBox) suErrBox.textContent = "Passwords do not match.";
        return;
      }

      /**
       * Attempts to create an account
       * Clears erorrs on success
       * Closes the signup modal
       * Resets the form
       */
      try {
        await createUserWithEmailAndPassword(auth, email, pw);
        if (suErrBox) suErrBox.textContent = "";
        const signupModalEl = document.getElementById("signupModal");
        if (signupModalEl) Modal.getOrCreateInstance(signupModalEl).hide();
        e.target.reset();
      } catch (err) {
        //   Displays approriate error
        if (suErrBox) suErrBox.textContent = prettyAuthError(err);
      }
    });

  // ---------- Auth state wiring ----------
  let cleanup = null; // cleanup from onAuthed (unsubscribe watchers)
  /**
   * Runs when the user logs in, logs out, the page reloads and firebase restores a session
   */
  onAuthStateChanged(auth, (user) => {
    // clear previous listeners before handling new auth state
    if (cleanup) {
      try {
        cleanup();
      } catch {}
      cleanup = null;
    }

    /**
     * If user is logged in,
     * Sends a message to console confirming login
     * state.user stores user information
     * Runs onAuthed
     */
    if (user) {
      console.log("[AUTH] Signed in as:", user.email);
      state.user = user;
      // onAuthed sets up Firestore watchers (tasks, study, base pattern/exclusions)
      cleanup = onAuthed(user, state, now);
    } else {
      /**
       * If user is logged out,
       * Sends a message to console confirming not logged in
       * Resets state.user or the global user info
       * runs onLoggedOut()
       * Returns user to home tab
       */
      console.warn("[AUTH] User signed out");
      state.user = null;
      onLoggedOut();
      // return to Home tab
      const homeTabBtn = document.querySelector("#home-tab");
      if (homeTabBtn) Tab.getOrCreateInstance(homeTabBtn).show();
    }
  });
}
