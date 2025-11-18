// auth/ui.js
import { Tab } from "bootstrap";
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
import { state, now } from "../app.js";

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

  // Initialize task sort mode + button UI once we're authed.
  state.sortMode = state.sortMode || "priority";
  updateTaskSortButtons();

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

/* -------------------- Settings / actions -------------------- */
export function attachSettingsActions(signOut, auth) {
  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("[AUTH] signOut failed:", err);
    }
  });

  document.getElementById("delaccBtn")?.addEventListener("click", async () => {
    try {
      await deleteAllUserData();
      alert("Your account info has been deleted.");
    } catch (err) {
      console.error("[DATA] delete failed:", err);
      alert("Failed to delete account info.");
    }
  });
}

// ---------- Task sort controls ----------

// Keep everything reading from the same place: state.sortMode.
// We treat "priority" as the default when not set.
function updateTaskSortButtons() {
  const currentMode = state.sortMode || "priority";

  const configs = [
    { id: "sortDueDate", mode: "dueDate" },
    { id: "sortTimeRequired", mode: "time" },
  ];

  configs.forEach(({ id, mode }) => {
    const button = document.getElementById(id);
    if (!button) return;

    const isActive = currentMode === mode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function applySortMode(mode) {
  const currentMode = state.sortMode || "priority";

  // Click same mode again → back to default ("priority")
  // Click different mode → switch to that mode.
  const nextMode = currentMode === mode ? "priority" : mode;
  state.sortMode = nextMode;

  updateTaskSortButtons();
  renderTasks(state, now);
}


// Wire up listeners once at module load.
// If the buttons don't exist on the current tab, this quietly does nothing.

const sortDueDateButton = document.getElementById("sortDueDate");
if (sortDueDateButton) {
  sortDueDateButton.addEventListener("click", (event) => {
    event.preventDefault();
    applySortMode("dueDate");
  });
}

const sortTimeRequiredButton = document.getElementById("sortTimeRequired");
if (sortTimeRequiredButton) {
  sortTimeRequiredButton.addEventListener("click", (event) => {
    event.preventDefault();
    applySortMode("time");
  });
}
