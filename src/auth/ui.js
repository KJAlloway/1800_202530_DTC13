// auth/ui.js
import { Tab, Modal } from "bootstrap";
import {
  deleteAllUserData,
  upsertUserMeta,
  watchTasks,
  watchStudyBlocks,
  watchBasePattern,
  watchBaseExclusions,
} from "../services/firestore.js";
import { buildCalendarGrid, refilterVisibleWeek } from "../calendar/grid.js";
import { visibleWeekRange, isoWeekId } from "../calendar/range.js";
import { renderTasks } from "../features/tasks/render.js";
import { state } from "../app.js";

/* -------------------- Auth UI gating -------------------- */
export function setAuthUI(isAuthed) {
  const calendarTabBtn = document.querySelector("#calendar-tab");
  const settingsTabBtn = document.querySelector("#settings-tab");
  const homeTabBtn = document.querySelector("#home-tab");

  const setDisabled = (btn, disabled) => {
    if (!btn) return;
    btn.classList.toggle("disabled", disabled);
    btn.setAttribute("aria-disabled", String(disabled));
    btn.tabIndex = disabled ? -1 : 0;
    const clickBlocker = (e) => e.preventDefault();
    if (disabled) btn.addEventListener("click", clickBlocker, { once: true });
  };

  setDisabled(calendarTabBtn, !isAuthed);
  setDisabled(settingsTabBtn, !isAuthed);
  setDisabled(homeTabBtn, false);

  if (!isAuthed && homeTabBtn) {
    Tab.getOrCreateInstance(homeTabBtn).show();
  }
}

/* -------------------- Week exclusions watcher -------------------- */
let _unsubExcl = null;
function watchCurrentWeekExclusions(state, now) {
  const { start } = visibleWeekRange(state.weekOffset);
  const weekId = isoWeekId(start);
  if (_unsubExcl) _unsubExcl();
  _unsubExcl = watchBaseExclusions(weekId, (setForWeek) => {
    // Replace (don't merge) to avoid “revival” after snapshot races
    console.log("[SNAPSHOT] exclusions update", Array.from(setForWeek));

    state.baseExclusions = setForWeek;
    state.baseExclusionsByWeek ||= new Map();
    state.baseExclusionsByWeek.set(weekId, setForWeek);
    refilterVisibleWeek(state, () => renderTasks(state, now));
  });
}

/* -------------------- Scaffolding & week navigation -------------------- */
export function attachScaffolding(state, now) {
  const homeTabBtn = document.querySelector("#home-tab");
  if (homeTabBtn) Tab.getOrCreateInstance(homeTabBtn).show();

  document.getElementById("authPanel")?.classList.remove("d-none");
  document.getElementById("homeApp")?.classList.add("d-none");

  // Single delegated listener for both mobile/desktop week-nav
  document.getElementById("calendarPage")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-week-nav]");
    if (!btn) return;

    const dir = btn.dataset.weekNav === "prev" ? -1 : 1;
    state.weekOffset += dir;
    buildCalendarGrid(state.weekOffset);
    refilterVisibleWeek(state, () => renderTasks(state, now));
    watchCurrentWeekExclusions(state, now);
  });

  buildCalendarGrid(state.weekOffset);
}

/* -------------------- Auth lifecycle -------------------- */
let _unsubTasks = null;
let _unsubStudy = null;
let _unsubPattern = null;

export function onAuthed(user, state, now) {
  const authPanel = document.getElementById("authPanel");
  const homeApp = document.getElementById("homeApp");
  const userEmailEl = document.getElementById("currentUserEmail");

  upsertUserMeta(user);
  if (userEmailEl) userEmailEl.textContent = user.email || "(no email)";

  authPanel?.classList.add("d-none");
  homeApp?.classList.remove("d-none");
  setAuthUI(true);

  // Live tasks
  _unsubTasks = watchTasks((arr) => {
    state.tasks = arr;
    renderTasks(state, now);
  });

  // Live persisted study blocks
  _unsubStudy = watchStudyBlocks((arr) => {
    state.studyAll = arr;
    refilterVisibleWeek(state, () => renderTasks(state, now));
  });

  // Live base pattern
  _unsubPattern = watchBasePattern((pattern) => {
    state.baseStudyPattern = pattern || [];
    refilterVisibleWeek(state, () => renderTasks(state, now));
  });

  // Live base exclusions for the visible week
  watchCurrentWeekExclusions(state, now);

  // cleanup to call on sign-out
  return () => {
    _unsubTasks?.(); _unsubTasks = null;
    _unsubStudy?.(); _unsubStudy = null;
    _unsubPattern?.(); _unsubPattern = null;
    _unsubExcl?.(); _unsubExcl = null;
  };
}

export function onLoggedOut() {
  const userEmailEl = document.getElementById("currentUserEmail");
  if (userEmailEl) userEmailEl.textContent = "—";
  document.getElementById("authPanel")?.classList.remove("d-none");
  document.getElementById("homeApp")?.classList.add("d-none");
  setAuthUI(false);

  // clear volatile state so UI paints empty safely
  state.tasks = [];
  state.studyAll = [];
  state.baseStudyPattern = [];
  state.baseExclusions = new Set();
  state.baseExclusionsByWeek = new Map();
  refilterVisibleWeek(state, () => { });
}

export function attachSettingsActions(signOut, auth) {
  /* -------- Logout button -------- */
  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("[AUTH] signOut failed:", err);
    }
  });

  /* -------- Connecting the Delete Account (Modal) (Or well... Setting it up.) -------- */
  const deleteBtn = document.getElementById("delaccBtn");
  const confirmBtn = document.getElementById("confirmDeleteBtn");
  const modalDelete = document.getElementById("confirmDelete");

  // If it isn't the modalDelete which is the actual confirmation of deleting the account.
  if (!modalDelete) {
    // It'll warn to the console that it is not there.
    console.warn("[SETTINGS] Delete modal missing from DOM.");
    return;
  }

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

  // Sort controls
  document.getElementById("sortDueDate")?.addEventListener("click", () => {
    state.sortMode = "dueDate";
    renderTasks(state, () => new Date());
  });
  document.getElementById("sortAlphabetic")?.addEventListener("click", () => {
    state.sortMode = "alpha";
    renderTasks(state, () => new Date());
  });
  document.getElementById("sortTimeRequired")?.addEventListener("click", () => {
    state.sortMode = "time";
    renderTasks(state, () => new Date());
  });
}
