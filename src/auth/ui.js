// auth/ui.js
/**Imports
 * Modal -> a controller class for opening and closing bootstrap modals
 * Tab -> a controller class for switching tabbed navigation
 */
import { Tab, Modal } from "bootstrap";

/**
 * Imports Firestore functions
 */
import {
  deleteAllUserData,
  upsertUserMeta,
  watchTasks,
  watchStudyBlocks,
  watchBasePattern,
  watchBaseExclusions,
} from "../services/firestore.js";
/**
 * Imports calendar functions
 * Imports render tasks function
 * Imports state and now
 */
import { buildCalendarGrid, refilterVisibleWeek } from "../calendar/grid.js";
import { visibleWeekRange, isoWeekId } from "../calendar/range.js";
import { renderTasks } from "../features/tasks/render.js";
import { state, now } from "../app.js";

/* -------------------- Auth UI gating -------------------- */
/**
 *
 *
 */
export function setAuthUI(isAuthed) {
  /**
   * References tabs from index.html,
   * allows enabling and disabling, forcibly switching tabs and preventing access
   */
  const calendarTabBtn = document.querySelector("#calendar-tab");
  const settingsTabBtn = document.querySelector("#settings-tab");
  const homeTabBtn = document.querySelector("#home-tab");

  /**
   *
   */
  const setDisabled = (btn, disabled) => {
    if (!btn) return; // if no button, stop
    btn.classList.toggle("disabled", disabled); // toggle disabled class in order for bootstrap to disable or enable it
    btn.setAttribute("aria-disabled", String(disabled)); //Sets accessibilty attribute to disabled, so screen readers can interpret it as disabled
    btn.tabIndex = disabled ? -1 : 0; // Removes ability to select tab with keyboard
    /**
     * Blocks tab from being clicked to stop Bootstrap from trying to open it
     */
    const clickBlocker = (e) => e.preventDefault();
    if (disabled) btn.addEventListener("click", clickBlocker, { once: true });
  };

  /**
   * Ensures home tab is always enabled,
   * Enables calendar and settings if user is authenticated
   */
  setDisabled(calendarTabBtn, !isAuthed);
  setDisabled(settingsTabBtn, !isAuthed);
  setDisabled(homeTabBtn, false);

  /**
   * Switches user to home tab if the logout on calendar or settings
   */
  if (!isAuthed && homeTabBtn) {
    Tab.getOrCreateInstance(homeTabBtn).show();
  }
}

/* -------------------- Week exclusions watcher -------------------- */
let _unsubExcl = null; //Holds the unsubscribe function to stop the old listener before starting a new one
function watchCurrentWeekExclusions(state, now) {
  const { start } = visibleWeekRange(state.weekOffset); //Determines the correct Monday for the displayed week
  const weekId = isoWeekId(start); //Makes sure each week is individual and can have its own exclusions
  if (_unsubExcl) _unsubExcl(); //Stop Firestore listener if the week is switched
  _unsubExcl = watchBaseExclusions(weekId, (setForWeek) => {
    // start a new watcher for the new week
    // Replace (don't merge) to avoid “revival” after snapshot races
    console.log("[SNAPSHOT] exclusions update", Array.from(setForWeek));

    state.baseExclusions = setForWeek; //Stores the current week's excusions
    /**
     * Memorizes excusions by week, to prevent long Firebase back and forth every time the user switches weeks
     */
    state.baseExclusionsByWeek ||= new Map();
    state.baseExclusionsByWeek.set(weekId, setForWeek);
    //Recomputes visible slots and re-renders UI
    refilterVisibleWeek(state, () => renderTasks(state, now));
  });
}

/* -------------------- Scaffolding & week navigation -------------------- */
export function attachScaffolding(state, now) {
  /**
   * Force the UI to open the home tab
   */
  const homeTabBtn = document.querySelector("#home-tab");
  if (homeTabBtn) Tab.getOrCreateInstance(homeTabBtn).show();

  /**
   * Show authentication panel
   * Hide app UI
   */
  document.getElementById("authPanel")?.classList.remove("d-none");
  document.getElementById("homeApp")?.classList.add("d-none");

  // Single delegated listener for both mobile/desktop week-nav
  document.getElementById("calendarPage")?.addEventListener("click", (e) => {
    /**
     * Identify if the clicked element is a week navigation button,
     * if no, return
     */
    const btn = e.target.closest("[data-week-nav]");
    if (!btn) return;

    const dir = btn.dataset.weekNav === "prev" ? -1 : 1; //Determine week navigation (previous or next)
    state.weekOffset += dir; //Updates week offset, next increments it, prev decrements it
    buildCalendarGrid(state.weekOffset); //Rebuild the calendar grid
    refilterVisibleWeek(state, () => renderTasks(state, now)); //Filter study blocks and render tasks
    showCalendarSynced();
    watchCurrentWeekExclusions(state, now); //Refresh Firestore listener for the new week
  });

  buildCalendarGrid(state.weekOffset); //Initiallises the calendar
}

/* -------------------- Auth lifecycle -------------------- */
/**
 * Stores Firestore unsubscribe function
 */
let _unsubTasks = null;
let _unsubStudy = null;
let _unsubPattern = null;

export function onAuthed(user, state, now) {
  /**
   * Accesses elements from DOM
   */
  const authPanel = document.getElementById("authPanel");
  const homeApp = document.getElementById("homeApp");
  const userEmailEl = document.getElementById("currentUserEmail");

  /**
   *Saves user metadata and shows email
   */
  upsertUserMeta(user);
  if (userEmailEl) userEmailEl.textContent = user.email || "(no email)";

  /**
   * Hide authentication panel
   * Show app
   */
  authPanel?.classList.add("d-none");
  homeApp?.classList.remove("d-none");
  setAuthUI(true);

  // Live tasks
  _unsubTasks = watchTasks((arr) => {
    //Listener for changes in tasks Firestore collection
    state.tasks = arr;
    renderTasks(state, now); //Updates tasks in UI
  });

  // Live persisted study blocks
  _unsubStudy = watchStudyBlocks((arr) => {
    //Listener for changes in study blocks
    state.studyAll = arr;
    refilterVisibleWeek(state, () => renderTasks(state, now));
    showCalendarSynced();
  });

  // Live base pattern
  //Listener for weekly schedule
  _unsubPattern = watchBasePattern((pattern) => {
    state.baseStudyPattern = pattern || [];
    refilterVisibleWeek(state, () => renderTasks(state, now));
    showCalendarSynced();
  });

  // Live base exclusions for the visible week
  watchCurrentWeekExclusions(state, now);

  // Initialize task sort mode + button UI once we're authed.
  state.sortMode = state.sortMode || "priority";
  updateTaskSortButtons();

  // cleanup to call on sign-out
  //Stops all Firestore listeners when user logs out
  return () => {
    _unsubTasks?.();
    _unsubTasks = null;
    _unsubStudy?.();
    _unsubStudy = null;
    _unsubPattern?.();
    _unsubPattern = null;
    _unsubExcl?.();
    _unsubExcl = null;
  };
}

export function onLoggedOut() {
  /**
   * Reset the displayed email to '-'
   */
  const userEmailEl = document.getElementById("currentUserEmail");
  if (userEmailEl) userEmailEl.textContent = "—";
  /**
   * Show authentication panel
   * Hide main app
   * Disables tabs
   */
  document.getElementById("authPanel")?.classList.remove("d-none");
  document.getElementById("homeApp")?.classList.add("d-none");
  setAuthUI(false);

  // clear volatile state so UI paints empty safely
  //Clear state when user signs out
  state.tasks = [];
  state.studyAll = [];
  state.baseStudyPattern = [];
  state.baseExclusions = new Set();
  state.baseExclusionsByWeek = new Map();
  refilterVisibleWeek(state, () => { }); //Repaint empty calendar
}

export function attachSettingsActions(signOut, auth) {
  /* -------- Logout button -------- */
  //Attach click listener to logout button, if it exists
  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    /**
     * Calls Firebase's signout function,
     * catches errors for debugging
     */
    try {
      await signOut(auth);
    } catch (err) {
      console.error("[AUTH] signOut failed:", err);
    }
  });

  /* -------- Connecting the Delete Account (Modal) (Or well... Setting it up.) -------- */
  /**
   * Get values from DOM elements (Delete account, confirm delete button, confirm delete modal)
   */
  const deleteBtn = document.getElementById("delaccBtn");
  const confirmBtn = document.getElementById("confirmDeleteBtn");
  const modalDelete = document.getElementById("confirmDelete");

  // If it isn't the modalDelete which is the actual confirmation of deleting the account.
  if (!modalDelete) {
    // It'll warn to the console that it is not there.
    console.warn("[SETTINGS] Delete modal missing from DOM.");
    return;
  }

  //Create Bootstrap modal instance
  const deleteModal = Modal.getOrCreateInstance(modalDelete);

  // Open the modal
  deleteBtn?.addEventListener("click", () => {
    deleteModal.show();
  });

  // Confirm deletion
  confirmBtn?.addEventListener("click", async () => {
    try {
      // Logging purposes, alert comes after.
      console.log("[DELETE] Wiping user data…");
      await deleteAllUserData();
      deleteModal.hide();
      await signOut(auth);
      // The main deletion right here to notify the user.
      alert("Your account data has been deleted.");
    } catch (err) {
      // If it doesn't work, it'll catch it and will alert them telling the user
      // To alert that there was an error and they couldn't delete the data.
      console.error("[DELETE] Failed to delete user data:", err);
      alert("Error deleting account data. See console.");
    }
  });
}

// ---------- Task sort controls ----------

// Keep everything reading from the same place: state.sortMode.
// We treat "priority" as the default when not set.
function updateTaskSortButtons() {
  const currentMode = state.sortMode || "priority"; //Determine the current sort mode, defaults to priority

  /**
   * Create configurations for sorting methods
   */
  const configs = [
    { id: "sortDueDate", mode: "dueDate" },
    { id: "sortTimeRequired", mode: "time" },
  ];

  //Update each button
  configs.forEach(({ id, mode }) => {
    const button = document.getElementById(id);
    if (!button) return;

    const isActive = currentMode === mode; //If button represents the current sort mode
    button.classList.toggle("active", isActive); //Toggle visial active class
    button.setAttribute("aria-pressed", isActive ? "true" : "false"); //Toggles accessibility ARIA attribute
  });
}

function applySortMode(mode) {
  const currentMode = state.sortMode || "priority"; //Determine the current sort mode, defaults to priority

  // Click same mode again → back to default ("priority")
  // Click different mode → switch to that mode.
  const nextMode = currentMode === mode ? "priority" : mode;
  state.sortMode = nextMode; //Save new mode to global state

  updateTaskSortButtons(); //Update sort button highlights
  renderTasks(state, now); //Re-render the tasks using new logic
}

// Wire up listeners once at module load.
// If the buttons don't exist on the current tab, this quietly does nothing.

const sortDueDateButton = document.getElementById("sortDueDate"); //Get value from DOM
//If button exists, add an event listener
if (sortDueDateButton) {
  sortDueDateButton.addEventListener("click", (event) => {
    event.preventDefault(); //Prevents default behaviour such as reloading from a form submission
    applySortMode("dueDate"); //Apply the sort mode
  });
}

const sortTimeRequiredButton = document.getElementById("sortTimeRequired"); //Get value from DOM
//If button exists, add an event listener
if (sortTimeRequiredButton) {
  sortTimeRequiredButton.addEventListener("click", (event) => {
    event.preventDefault(); //Prevents default behaviour such as reloading from a form submission
    applySortMode("time"); //Apply the sort mode
  });
}
