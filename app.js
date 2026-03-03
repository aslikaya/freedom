const STORAGE_KEY = "progress-tracker-data-v1";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const state = {
  viewYear: 0,
  viewMonth: 0,
  selectedDayKey: "",
  selectedWeekKey: "",
  authPanelOpen: false,
  entryModalOpen: false,
  dayModalOpen: false,
  weekModalOpen: false,
  monthModalOpen: false,
  workModalOpen: false,
  reminderModalOpen: false,
  auth: {
    authenticated: false,
    email: "",
  },
  syncTimer: null,
  data: loadData(),
};

const monthLabel = document.getElementById("monthLabel");
const boardGrid = document.getElementById("boardGrid");
const workBadge = document.getElementById("workBadge");
const selectedWeekLabel = document.getElementById("selectedWeekLabel");
const weekSummary = document.getElementById("weekSummary");
const weekDailyList = document.getElementById("weekDailyList");
const weeklyReflection = document.getElementById("weeklyReflection");
const openMonthly = document.getElementById("openMonthly");
const weekModal = document.getElementById("weekModal");
const monthModal = document.getElementById("monthModal");
const selectedMonthLabel = document.getElementById("selectedMonthLabel");
const monthSummary = document.getElementById("monthSummary");
const monthWeeklyList = document.getElementById("monthWeeklyList");
const monthlyReflection = document.getElementById("monthlyReflection");
const openWorkSetup = document.getElementById("openWorkSetup");
const workModal = document.getElementById("workModal");
const workInput = document.getElementById("workInput");
const openAccount = document.getElementById("openAccount");
const authSignedOut = document.getElementById("authSignedOut");
const authSignedIn = document.getElementById("authSignedIn");
const entryModal = document.getElementById("entryModal");
const entrySignIn = document.getElementById("entrySignIn");
const entryLocal = document.getElementById("entryLocal");
const authModal = document.getElementById("authModal");

const openReminders = document.getElementById("openReminders");
const reminderModal = document.getElementById("reminderModal");
const reminderEnabled = document.getElementById("reminderEnabled");
const reminderTime = document.getElementById("reminderTime");
const reminderStatus = document.getElementById("reminderStatus");

const authStatus = document.getElementById("authStatus");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const registerBtn = document.getElementById("registerBtn");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");

const dayModal = document.getElementById("dayModal");
const dayModalDate = document.getElementById("dayModalDate");
const modalMinus = document.getElementById("modalMinus");
const modalPlus = document.getElementById("modalPlus");
const modalScoreLabel = document.getElementById("modalScoreLabel");
const modalDailyReflection = document.getElementById("modalDailyReflection");

function defaultData() {
  return {
    days: {},
    weeks: {},
    months: {},
    work: "",
  };
}

function loadData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed || typeof parsed !== "object") {
      return defaultData();
    }
    return sanitizeTrackerData(parsed);
  } catch {
    return defaultData();
  }
}

function sanitizeTrackerData(input) {
  const safe = input && typeof input === "object" ? input : {};
  return {
    days: safe.days && typeof safe.days === "object" ? safe.days : {},
    weeks: safe.weeks && typeof safe.weeks === "object" ? safe.weeks : {},
    months: safe.months && typeof safe.months === "object" ? safe.months : {},
    work: typeof safe.work === "string" ? safe.work : "",
  };
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  scheduleRemoteSync();
}

function scheduleRemoteSync() {
  if (!state.auth.authenticated) {
    return;
  }
  if (state.syncTimer) {
    clearTimeout(state.syncTimer);
  }
  state.syncTimer = setTimeout(() => {
    state.syncTimer = null;
    pushDataToServer().catch((error) => {
      console.error("Failed to sync data:", error.message);
      authStatus.textContent = `Signed in as ${state.auth.email}. Sync failed; retrying on next save.`;
    });
  }, 250);
}

async function pushDataToServer() {
  if (!state.auth.authenticated) return;
  await apiRequest("/api/tracker", {
    method: "POST",
    body: JSON.stringify({
      trackerData: state.data,
    }),
  });
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const message = payload.error || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload;
}

function toDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toWeekKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return toDayKey(d);
}

function weekRangeText(weekKey) {
  const start = new Date(`${weekKey}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} - ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

async function init() {
  const now = new Date();
  state.viewYear = now.getFullYear();
  state.viewMonth = now.getMonth();
  state.selectedDayKey = toDayKey(now);
  state.selectedWeekKey = toWeekKey(now);

  attachEvents();
  await refreshAuthState();
  if (!state.auth.authenticated) {
    openEntryModal();
  }
  render();
}

function attachEvents() {
  document.getElementById("prevMonth").addEventListener("click", () => {
    state.viewMonth -= 1;
    if (state.viewMonth < 0) {
      state.viewMonth = 11;
      state.viewYear -= 1;
    }
    render();
  });

  document.getElementById("nextMonth").addEventListener("click", () => {
    state.viewMonth += 1;
    if (state.viewMonth > 11) {
      state.viewMonth = 0;
      state.viewYear += 1;
    }
    render();
  });

  document.getElementById("saveWeekly").addEventListener("click", () => {
    if (!state.selectedWeekKey) return;
    state.data.weeks[state.selectedWeekKey] = weeklyReflection.value.trim();
    saveData();
    render();
    closeWeekModal();
  });

  document.getElementById("saveMonthly").addEventListener("click", () => {
    const key = monthKey(state.viewYear, state.viewMonth);
    state.data.months[key] = monthlyReflection.value.trim();
    saveData();
    renderMonthModal();
    closeMonthModal();
  });

  document.getElementById("saveWork").addEventListener("click", () => {
    state.data.work = workInput.value.trim();
    saveData();
    renderWorkInfo();
    closeWorkModal();
  });

  registerBtn.addEventListener("click", () => {
    void register();
  });

  loginBtn.addEventListener("click", () => {
    void login();
  });

  logoutBtn.addEventListener("click", () => {
    void logout();
  });

  openWorkSetup.addEventListener("click", () => {
    openWorkModal();
  });

  openAccount.addEventListener("click", () => {
    openAuthPanel();
  });

  entrySignIn.addEventListener("click", () => {
    closeEntryModal();
    openAuthPanel();
    authEmail.focus();
  });

  entryLocal.addEventListener("click", () => {
    closeEntryModal();
    closeAuthPanel();
    render();
  });

  openMonthly.addEventListener("click", () => {
    if (!state.selectedDayKey) {
      const now = new Date();
      state.selectedDayKey = toDayKey(now);
      state.selectedWeekKey = toWeekKey(now);
    }
    openMonthModal();
    render();
  });

  modalMinus.addEventListener("click", () => {
    adjustSelectedDay(-1);
  });

  modalPlus.addEventListener("click", () => {
    adjustSelectedDay(1);
  });

  document.getElementById("saveModalDaily").addEventListener("click", () => {
    if (!state.selectedDayKey) return;
    ensureDay(state.selectedDayKey);
    state.data.days[state.selectedDayKey].reflection = modalDailyReflection.value.trim();
    saveData();
    render();
    closeDayModal();
  });

  document.getElementById("dayModalClose").addEventListener("click", closeDayModal);
  document.getElementById("weekModalClose").addEventListener("click", closeWeekModal);
  document.getElementById("monthModalClose").addEventListener("click", closeMonthModal);
  document.getElementById("workModalClose").addEventListener("click", closeWorkModal);

  dayModal.addEventListener("click", (event) => {
    if (event.target === dayModal) {
      closeDayModal();
    }
  });

  weekModal.addEventListener("click", (event) => {
    if (event.target === weekModal) {
      closeWeekModal();
    }
  });

  monthModal.addEventListener("click", (event) => {
    if (event.target === monthModal) {
      closeMonthModal();
    }
  });

  workModal.addEventListener("click", (event) => {
    if (event.target === workModal) {
      closeWorkModal();
    }
  });

  authModal.addEventListener("click", (event) => {
    if (event.target === authModal) {
      closeAuthPanel();
    }
  });

  document.getElementById("authModalClose").addEventListener("click", closeAuthPanel);

  openReminders.addEventListener("click", () => {
    openReminderModal();
  });

  document.getElementById("saveReminders").addEventListener("click", async () => {
    const enabled = reminderEnabled.checked;
    const time = reminderTime.value || "20:00";

    if (enabled) {
      try {
        await subscribeToPush();
      } catch (error) {
        alert("Could not enable notifications: " + error.message);
        return;
      }
    }

    if (!state.auth.authenticated) {
      alert("Sign in to save reminder settings.");
      return;
    }

    try {
      await apiRequest("/api/reminders", {
        method: "POST",
        body: JSON.stringify({ enabled, time }),
      });
      closeReminderModal();
    } catch (error) {
      alert(error.message);
    }
  });

  document.getElementById("reminderModalClose").addEventListener("click", closeReminderModal);

  reminderModal.addEventListener("click", (event) => {
    if (event.target === reminderModal) {
      closeReminderModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.dayModalOpen) closeDayModal();
    if (event.key === "Escape" && state.weekModalOpen) closeWeekModal();
    if (event.key === "Escape" && state.monthModalOpen) closeMonthModal();
    if (event.key === "Escape" && state.workModalOpen) closeWorkModal();
    if (event.key === "Escape" && state.reminderModalOpen) closeReminderModal();
    if (event.key === "Escape" && state.authPanelOpen) closeAuthPanel();
  });
}

async function refreshAuthState() {
  try {
    const payload = await apiRequest("/api/auth/me", { method: "GET" });
    if (!payload.authenticated) {
      state.auth.authenticated = false;
      state.auth.email = "";
      renderAuthState();
      return;
    }

    state.auth.authenticated = true;
    state.auth.email = payload.user.email;
    closeEntryModal();

    const tracker = await apiRequest("/api/tracker", { method: "GET" });
    state.data = sanitizeTrackerData(tracker.trackerData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
    renderAuthState();
  } catch {
    state.auth.authenticated = false;
    state.auth.email = "";
    renderAuthState();
  }
}

function authInput() {
  return {
    email: authEmail.value.trim().toLowerCase(),
    password: authPassword.value,
  };
}

async function register() {
  const { email, password } = authInput();
  if (!email || !password) {
    alert("Enter email and password.");
    return;
  }
  try {
    await apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    authPassword.value = "";
    await refreshAuthState();
    closeEntryModal();
    closeAuthPanel();
    render();
  } catch (error) {
    alert(error.message);
  }
}

async function login() {
  const { email, password } = authInput();
  if (!email || !password) {
    alert("Enter email and password.");
    return;
  }
  try {
    await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    authPassword.value = "";
    await refreshAuthState();
    closeEntryModal();
    closeAuthPanel();
    render();
  } catch (error) {
    alert(error.message);
  }
}

async function logout() {
  try {
    await apiRequest("/api/auth/logout", { method: "POST" });
  } catch {
    // Ignore logout failures; local fallback still works.
  }

  state.auth.authenticated = false;
  state.auth.email = "";
  state.data = loadData();
  closeAuthPanel();
  renderAuthState();
  render();
}

function renderAuthState() {
  if (state.auth.authenticated) {
    authStatus.textContent = `Signed in as ${state.auth.email}.`;
    authSignedOut.classList.add("hidden");
    authSignedIn.classList.remove("hidden");
  } else {
    authStatus.textContent = "Not signed in. Data is local only.";
    authSignedOut.classList.remove("hidden");
    authSignedIn.classList.add("hidden");
  }
}

function openAuthPanel() {
  state.authPanelOpen = true;
  authModal.classList.remove("hidden");
  syncModalBodyState();
}

function closeAuthPanel() {
  state.authPanelOpen = false;
  authModal.classList.add("hidden");
  syncModalBodyState();
}

function openEntryModal() {
  state.entryModalOpen = true;
  entryModal.classList.remove("hidden");
  syncModalBodyState();
}

function closeEntryModal() {
  state.entryModalOpen = false;
  entryModal.classList.add("hidden");
  syncModalBodyState();
}

function ensureDay(dayKey) {
  if (!state.data.days[dayKey]) {
    state.data.days[dayKey] = { score: 0, reflection: "" };
  }
}

function monthCells(year, month) {
  const first = new Date(year, month, 1);
  const firstMondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - firstMondayOffset);
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    cells.push(date);
  }
  return cells;
}

function render() {
  const viewDate = new Date(state.viewYear, state.viewMonth, 1);
  monthLabel.textContent = viewDate.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  renderAuthState();
  renderWorkInfo();
  renderBoard();
  if (state.dayModalOpen) renderDayModal();
  if (state.weekModalOpen) renderWeekPanel();
  if (state.monthModalOpen) renderMonthModal();
  if (state.workModalOpen) renderWorkModal();
}

function renderBoard() {
  const cells = monthCells(state.viewYear, state.viewMonth);
  let html = `
    <div class="board-head week-col-head"></div>
    ${WEEKDAYS.map((d) => `<div class="board-head">${d}</div>`).join("")}
  `;

  for (let row = 0; row < 6; row += 1) {
    const weekStart = cells[row * 7];
    const weekKey = toWeekKey(weekStart);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const rowLabel = `${weekStart.toLocaleDateString(undefined, {
      day: "numeric",
    })} - ${weekEnd.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
    const weekClass = weekKey === state.selectedWeekKey ? "active-week" : "";

    html += `<button type="button" class="week-label ${weekClass}" data-open-week="${weekKey}">${rowLabel}</button>`;

    for (let col = 0; col < 7; col += 1) {
      const date = cells[row * 7 + col];
      const dayKey = toDayKey(date);
      const inMonth = date.getMonth() === state.viewMonth;
      const dayData = state.data.days[dayKey] || { score: 0, reflection: "" };
      const dayDots =
        dayData.score > 0
          ? new Array(dayData.score)
              .fill(0)
              .map(() => '<span class="dot active static-dot"></span>')
              .join("")
          : "";
      const dayClass = [
        "board-day",
        inMonth ? "" : "outside",
        state.selectedDayKey === dayKey ? "selected" : "",
      ]
        .filter(Boolean)
        .join(" ");
      html += `
        <button type="button" class="${dayClass}" data-day-cell="${dayKey}">
          <span class="cell-date">${date.getDate()}</span>
          <span class="dot-row">${dayDots}</span>
        </button>
      `;
    }
  }

  boardGrid.innerHTML = html;
  wireBoardInteractions();
}

function wireBoardInteractions() {
  boardGrid.querySelectorAll("[data-day-cell]").forEach((cell) => {
    cell.addEventListener("click", () => {
      const dayKey = cell.dataset.dayCell;
      state.selectedDayKey = dayKey;
      state.selectedWeekKey = toWeekKey(new Date(`${dayKey}T00:00:00`));
      openDayModal();
      render();
    });
  });

  boardGrid.querySelectorAll("[data-open-week]").forEach((button) => {
    button.addEventListener("click", () => {
      const weekKey = button.dataset.openWeek;
      state.selectedWeekKey = weekKey;
      state.selectedDayKey = weekKey;
      openWeekModal();
      render();
    });
  });
}

function adjustSelectedDay(delta) {
  if (!state.selectedDayKey) return;
  ensureDay(state.selectedDayKey);
  const current = state.data.days[state.selectedDayKey].score || 0;
  state.data.days[state.selectedDayKey].score = Math.max(0, current + delta);
  saveData();
  render();
}

function openDayModal() {
  state.dayModalOpen = true;
  dayModal.classList.remove("hidden");
  syncModalBodyState();
  renderDayModal();
}

function closeDayModal() {
  state.dayModalOpen = false;
  dayModal.classList.add("hidden");
  syncModalBodyState();
}

function openWeekModal() {
  state.weekModalOpen = true;
  weekModal.classList.remove("hidden");
  syncModalBodyState();
  renderWeekPanel();
}

function closeWeekModal() {
  state.weekModalOpen = false;
  weekModal.classList.add("hidden");
  syncModalBodyState();
}

function openMonthModal() {
  state.monthModalOpen = true;
  monthModal.classList.remove("hidden");
  syncModalBodyState();
  renderMonthModal();
}

function closeMonthModal() {
  state.monthModalOpen = false;
  monthModal.classList.add("hidden");
  syncModalBodyState();
}

function openWorkModal() {
  state.workModalOpen = true;
  workModal.classList.remove("hidden");
  syncModalBodyState();
  renderWorkModal();
}

function closeWorkModal() {
  state.workModalOpen = false;
  workModal.classList.add("hidden");
  syncModalBodyState();
}

function openReminderModal() {
  state.reminderModalOpen = true;
  reminderModal.classList.remove("hidden");
  syncModalBodyState();
  renderReminderModal();
}

function closeReminderModal() {
  state.reminderModalOpen = false;
  reminderModal.classList.add("hidden");
  syncModalBodyState();
}

async function renderReminderModal() {
  if (!("Notification" in window)) {
    reminderStatus.textContent = "Push notifications are not supported in this browser.";
    reminderEnabled.disabled = true;
    return;
  }

  if (Notification.permission === "denied") {
    reminderStatus.textContent = "Notifications are blocked. Enable them in your browser settings.";
    reminderEnabled.disabled = true;
    return;
  }

  reminderStatus.textContent = "";
  reminderEnabled.disabled = false;

  if (!state.auth.authenticated) {
    reminderStatus.textContent = "Sign in to enable push reminders.";
    reminderEnabled.disabled = true;
    return;
  }

  try {
    const settings = await apiRequest("/api/reminders", { method: "GET" });
    reminderEnabled.checked = settings.enabled;
    reminderTime.value = settings.time || "20:00";
  } catch {
    reminderEnabled.checked = false;
    reminderTime.value = "20:00";
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribeToPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push notifications are not supported in this browser.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was denied.");
  }

  const reg = await navigator.serviceWorker.ready;
  const { key } = await apiRequest("/api/push/vapid-key", { method: "GET" });
  if (!key) {
    throw new Error("Push notifications are not configured on the server.");
  }

  const applicationServerKey = urlBase64ToUint8Array(key);

  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }

  await apiRequest("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({ subscription }),
  });
}

function syncModalBodyState() {
  const hasOpenModal =
    state.dayModalOpen ||
    state.weekModalOpen ||
    state.monthModalOpen ||
    state.workModalOpen ||
    state.reminderModalOpen ||
    state.authPanelOpen ||
    state.entryModalOpen;
  if (hasOpenModal) {
    document.body.classList.add("modal-open");
  } else {
    document.body.classList.remove("modal-open");
  }
}

function renderWorkInfo() {
  workBadge.textContent = state.data.work
    ? `Work to log: ${state.data.work}`
    : "Work to log: Not set yet";
}

function renderWorkModal() {
  workInput.value = state.data.work || "";
}

function renderDayModal() {
  if (!state.selectedDayKey) return;
  ensureDay(state.selectedDayKey);

  const selectedDate = new Date(`${state.selectedDayKey}T00:00:00`);
  dayModalDate.textContent = selectedDate.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const score = state.data.days[state.selectedDayKey].score || 0;
  modalScoreLabel.textContent = `${score} work item${score === 1 ? "" : "s"}`;
  modalMinus.disabled = score <= 0;
  modalPlus.disabled = false;
  modalDailyReflection.value = state.data.days[state.selectedDayKey].reflection || "";
}

function renderWeekPanel() {
  if (!state.selectedWeekKey) return;

  selectedWeekLabel.textContent = `Week of ${weekRangeText(state.selectedWeekKey)}`;
  weeklyReflection.value = state.data.weeks[state.selectedWeekKey] || "";

  const weekDays = new Array(7).fill(0).map((_, i) => {
    const d = new Date(`${state.selectedWeekKey}T00:00:00`);
    d.setDate(d.getDate() + i);
    return d;
  });

  const scores = weekDays.map((date) => {
    const key = toDayKey(date);
    return (state.data.days[key] && state.data.days[key].score) || 0;
  });

  const total = scores.reduce((sum, item) => sum + item, 0);
  const avg = total / 7;
  const activeDays = scores.filter((s) => s > 0).length;

  weekSummary.textContent = `Total work items: ${total} | Avg/day: ${avg.toFixed(1)} | Active days: ${activeDays}/7`;

  weekDailyList.innerHTML = weekDays
    .map((date) => {
      const key = toDayKey(date);
      const dayData = state.data.days[key] || { score: 0, reflection: "" };
      const weekday = date.toLocaleDateString(undefined, { weekday: "short" });
      const dateLabel = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const dots = dayData.score > 0 ? `Work items: ${"●".repeat(dayData.score)}` : "Work items: 0";
      const reflection = dayData.reflection || "No daily reflection yet.";
      return `
        <div class="week-day-note month-week-note">
          <p class="week-day-head">${weekday}, ${dateLabel} <span>${dots}</span></p>
          <p class="week-day-text">${reflection}</p>
        </div>
      `;
    })
    .join("");
}

function renderMonthModal() {
  const viewDate = new Date(state.viewYear, state.viewMonth, 1);
  const key = monthKey(state.viewYear, state.viewMonth);
  selectedMonthLabel.textContent = `${viewDate.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  })} Review`;

  const cells = monthCells(state.viewYear, state.viewMonth);
  const weekKeys = [];
  for (let row = 0; row < 6; row += 1) {
    const rowDays = cells.slice(row * 7, row * 7 + 7);
    const hasCurrentMonthDay = rowDays.some((d) => d.getMonth() === state.viewMonth);
    if (hasCurrentMonthDay) {
      weekKeys.push(toWeekKey(rowDays[0]));
    }
  }

  const savedWeekly = weekKeys.filter((wk) => (state.data.weeks[wk] || "").trim().length > 0).length;
  monthSummary.textContent = `Weekly reflections saved: ${savedWeekly}/${weekKeys.length}`;

  monthWeeklyList.innerHTML = weekKeys
    .map((wk) => {
      const weekText = weekRangeText(wk);
      const value = (state.data.weeks[wk] || "").trim();
      const reflection = value || "No weekly reflection yet.";
      return `
        <div class="week-day-note month-week-note">
          <p class="week-day-head">Week of ${weekText}</p>
          <p class="week-day-text">${reflection}</p>
        </div>
      `;
    })
    .join("");

  monthlyReflection.value = state.data.months[key] || "";
}

init().catch((error) => {
  console.error("Init failed:", error);
  authStatus.textContent = "App failed to initialize.";
});

// Register service worker for PWA support
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js").catch((error) => {
    console.error("SW registration failed:", error);
  });
}
