// auth/ui.js
import { Tab } from "bootstrap";
import {
  deleteAllUserData,
  upsertUserMeta,
  watchTasks,
  watchEvents,
  watchStudyBlocks,
} from "../services/firestore.js";
import { buildCalendarGrid, refilterVisibleWeek } from "../calendar/grid.js";
import { renderTasks } from "../features/tasks/render.js";
import { state } from "../app.js";

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

export function attachScaffolding(state, now) {
  const homeTabBtn = document.querySelector("#home-tab");
  if (homeTabBtn) Tab.getOrCreateInstance(homeTabBtn).show();

  document.getElementById("authPanel")?.classList.remove("d-none");
  document.getElementById("homeApp")?.classList.add("d-none");

  // ONE delegated listener for both mobile + desktop buttons
  document.getElementById("calendarPage")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-week-nav]");
    if (!btn) return;

    const dir = btn.dataset.weekNav === "prev" ? -1 : 1;
    state.weekOffset += dir; // update offset
    buildCalendarGrid(state.weekOffset); // rebuild header/cells
    refilterVisibleWeek(state, () => renderTasks(state, now)); // repaint data overlays
  });

  buildCalendarGrid(state.weekOffset);
}

export function onAuthed(user, state, now) {
  const authPanel = document.getElementById("authPanel");
  const homeApp = document.getElementById("homeApp");
  const userEmailEl = document.getElementById("currentUserEmail");

  upsertUserMeta(user);
  if (userEmailEl) userEmailEl.textContent = user.email || "(no email)";

  authPanel?.classList.add("d-none");
  homeApp?.classList.remove("d-none");
  setAuthUI(true);

  const unsubTasks = watchTasks((arr) => {
    state.tasks = arr;
    renderTasks(state, now);
  });
  const unsubEvents = watchEvents((arr) => {
    state.eventsAll = arr;
    refilterVisibleWeek(state, () => renderTasks(state, now));
  });
  const unsubStudy = watchStudyBlocks((arr) => {
    state.studyAll = arr;
    refilterVisibleWeek(state, () => renderTasks(state, now));
  });

  return () => {
    unsubTasks();
    unsubEvents();
    unsubStudy();
  };
}

export function onLoggedOut() {
  const userEmailEl = document.getElementById("currentUserEmail");
  if (userEmailEl) userEmailEl.textContent = "—";
  document.getElementById("authPanel")?.classList.remove("d-none");
  document.getElementById("homeApp")?.classList.add("d-none");
  setAuthUI(false);
}

export function attachSettingsActions(signOut, auth) {
  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("[AUTH] signOut failed:", err);
    }
  });

  document
    .getElementById("deleteInfoBtn")
    ?.addEventListener("click", async () => {
      try {
        await deleteAllUserData();
        alert("Your account info has been deleted.");
      } catch (err) {
        console.error("[DATA] delete failed:", err);
        alert("Failed to delete account info.");
      }
    });

  // Sort by due date
  document.getElementById("sortDueDate")?.addEventListener("click", () => {
    state.sortMode = "dueDate";
    renderTasks(state, () => new Date());
  });
  // Sort alphabetically (A to Z)
  document.getElementById("sortAlphabetic")?.addEventListener("click", () => {
    state.sortMode = "alpha";
    renderTasks(state, () => new Date());
  });
  // Sort by time required (low to high)
  document.getElementById("sortTimeRequired")?.addEventListener("click", () => {
    state.sortMode = "time";
    renderTasks(state, () => new Date());
  });
}
