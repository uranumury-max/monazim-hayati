"use strict";

/* أثر يومي — التطبيق الرئيسي */

const STORAGE_KEY = "monazim_hayati_v1";
const $ = (id) => document.getElementById(id);

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function createDefaultState() {
  return {
    profile: {
      name: "",
      dob: "",
      height: "",
      weight: "",
      completed: false
    },
    tasks: [],
    waterLog: {},
    waterGoal: 0,
    waterServing: 250,
    studySessions: [],
    finance: [],
    journal: [],
    dailyNotes: {},
    capsules: [],
    companion: {
      name: "رفيقك الصغير",
      happiness: 50,
      energy: 50
    },
    settings: {
      theme: "dark",
      backgroundColor: "#101827",
      cardColor: "#1b2638",
      textColor: "#f1f5f9",
      accent: "#38bdf8",
      highlight: "#7dd3fc",
      backgroundImage: "",
      remindersEnabled: false,
      reminderInterval: 60,
      pin: ""
    }
  };
}

function loadState() {
  const base = createDefaultState();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;

    const old = JSON.parse(raw);
    const state = {
      ...base,
      ...old,
      profile: { ...base.profile, ...(old.profile || {}) },
      settings: { ...base.settings, ...(old.settings || {}) },
      companion: { ...base.companion, ...(old.companion || {}) }
    };

    // نقل بيانات الماء القديمة إلى سجل اليوم.
    if (!state.waterLog || typeof state.waterLog !== "object") {
      state.waterLog = {};
    }

    if (Number(old.waterMl) > 0 && !state.waterLog[localDateKey()]) {
      state.waterLog[localDateKey()] = [{
        id: makeId(),
        amount: Number(old.waterMl),
        time: new Date().toISOString()
      }];
    }

    // نقل المصروفات القديمة.
    if (!Array.isArray(state.finance)) {
      state.finance = [];
    }

    if (state.finance.length === 0 && Array.isArray(old.expenses)) {
      state.finance = old.expenses.map((item) => ({
        id: makeId(),
        title: String(item.item || "عملية قديمة"),
        amount: Number(item.cost) || 0,
        type: "expense",
        category: "عام",
        date: localDateKey()
      }));
    }

    // نقل المهام القديمة.
    state.tasks = Array.isArray(state.tasks) ? state.tasks : [];
    state.tasks = state.tasks.map((task) => ({
      id: task.id || makeId(),
      title: String(task.title || "مهمة"),
      date: task.date || localDateKey(),
      priority: task.priority || "normal",
      color: task.color || "#38bdf8",
      done: Boolean(task.done),
      createdAt: task.createdAt || new Date().toISOString()
    }));

    state.studySessions = Array.isArray(state.studySessions)
      ? state.studySessions : [];
    state.journal = Array.isArray(state.journal)
      ? state.journal : [];
    state.capsules = Array.isArray(state.capsules)
      ? state.capsules : [];
    state.dailyNotes = state.dailyNotes || {};

    return state;
  } catch (error) {
    console.error("تعذر تحميل البيانات:", error);
    return base;
  }
}

let state = loadState();
let currentTaskFilter = "all";
let studyTimer = null;
let studyEndTime = 0;
let studyDuration = 0;
let toastTimer = null;
let reminderTimer = null;

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("تعذر حفظ البيانات:", error);
    showToast("مساحة التخزين ممتلئة. جرّب إزالة صورة الخلفية.");
  }
}

function showToast(message) {
  const toast = $("app-toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

function showModal(title, message) {
  const modal = $("app-modal");
  if (!modal) {
    alert(message);
    return;
  }

  $("modal-title").textContent = title;
  $("modal-body").textContent = message;
  modal.hidden = false;
}

function closeModal() {
  if ($("app-modal")) $("app-modal").hidden = true;
}

function formatNumber(value) {
  return new Intl.NumberFormat("ar").format(Number(value) || 0);
}

function formatMoney(value) {
  return formatNumber(Number(value).toFixed(2));
}

function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString("ar", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function calculateAge(dob) {
  if (!dob) return null;

  const birth = new Date(`${dob}T00:00:00`);
  const today = new Date();

  if (Number.isNaN(birth.getTime()) || birth > today) return null;

  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();
  let days = today.getDate() - birth.getDate();

  if (days < 0) {
    months--;
    days += new Date(
      today.getFullYear(),
      today.getMonth(),
      0
    ).getDate();
  }

  if (months < 0) {
    years--;
    months += 12;
  }

  return { years, months, days };
}

function getTodayWaterEntries() {
  const entries = state.waterLog[localDateKey()];
  return Array.isArray(entries) ? entries : [];
}

function getTodayWaterTotal() {
  return getTodayWaterEntries().reduce(
    (sum, entry) => sum + (Number(entry.amount) || 0),
    0
  );
}

function getTodayStudyMinutes() {
  return state.studySessions
    .filter((session) => session.date === localDateKey())
    .reduce((sum, session) => sum + (Number(session.minutes) || 0), 0);
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function applyAppearance() {
  const root = document.documentElement;
  const settings = state.settings;

  root.style.setProperty("--bg-main", settings.backgroundColor);
  root.style.setProperty("--bg-card", settings.cardColor);
  root.style.setProperty("--text-main", settings.textColor);
  root.style.setProperty("--accent", settings.accent);
  root.style.setProperty("--highlight", settings.highlight);

  const app = $("app");
  if (app) {
    app.classList.remove("theme-dark", "theme-light");
    app.classList.add(
      settings.theme === "light" ? "theme-light" : "theme-dark"
    );

    if (settings.backgroundImage) {
      app.style.setProperty(
        "--app-background-image",
        `url("${settings.backgroundImage}")`
      );
    } else {
      app.style.removeProperty("--app-background-image");
    }
  }

  document.documentElement.style.colorScheme =
    settings.theme === "light" ? "light" : "dark";
}

function navigateTo(pageName) {
  const page = document.querySelector(
    `.page-section[data-page="${pageName}"]`
  );

  if (!page) return;

  document.querySelectorAll(".page-section").forEach((section) => {
    section.classList.toggle("active", section === page);
  });

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.pageTarget === pageName
    );
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderHome() {
  const today = new Date();

  setText(
    "today-label",
    today.toLocaleDateString("ar", {
      weekday: "long",
      day: "numeric",
      month: "long"
    })
  );

  setText(
    "welcome-title",
    state.profile.name
      ? `أهلاً ${state.profile.name} 👋`
      : "أهلاً بك 👋"
  );

  const doneTasks = state.tasks.filter(
    (task) => task.done && task.date === localDateKey()
  ).length;

  setText("home-tasks-done", formatNumber(doneTasks));
  setText("home-study-time", `${formatNumber(getTodayStudyMinutes())} د`);
  setText("home-water-total", `${formatNumber(getTodayWaterTotal())} مل`);
  setText("home-achievements", formatNumber(doneTasks + state.studySessions.filter(
    (session) => session.date === localDateKey()
  ).length));

  const note = state.dailyNotes[localDateKey()] || "";
  if ($("daily-note-input") && $("daily-note-input") !== document.activeElement) {
    $("daily-note-input").value = note;
  }
}

function createItem(title, description, actions = []) {
  const item = document.createElement("article");
  item.className = "list-item";

  const content = document.createElement("div");
  content.className = "list-item-content";

  const heading = document.createElement("strong");
  heading.textContent = title;
  content.appendChild(heading);

  if (description) {
    const detail = document.createElement("p");
    detail.className = "muted-text";
    detail.textContent = description;
    content.appendChild(detail);
  }

  item.appendChild(content);

  if (actions.length) {
    const actionBox = document.createElement("div");
    actionBox.className = "row-actions";

    actions.forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = action.className || "secondary-button";
      button.textContent = action.label;
      button.addEventListener("click", action.onClick);
      actionBox.appendChild(button);
    });

    item.appendChild(actionBox);
  }

  return item;
}

function renderTasks() {
  const list = $("tasks-list");
  if (!list) return;

  list.replaceChildren();

  let tasks = [...state.tasks];

  if (currentTaskFilter === "today") {
    tasks = tasks.filter((task) => task.date === localDateKey());
  } else if (currentTaskFilter === "active") {
    tasks = tasks.filter((task) => !task.done);
  } else if (currentTaskFilter === "done") {
    tasks = tasks.filter((task) => task.done);
  }

  tasks.sort((a, b) => {
    if (a.done !== b.done) return Number(a.done) - Number(b.done);
    return a.date.localeCompare(b.date);
  });

  if (!tasks.length) {
    list.innerHTML = '<div class="empty-state">لا توجد مهام في هذا العرض.</div>';
    return;
  }

  tasks.forEach((task) => {
    const item = createItem(
      task.title,
      `${formatDate(task.date)} • ${
        task.priority === "high" ? "أولوية مهمة" :
        task.priority === "low" ? "أولوية منخفضة" : "أولوية عادية"
      }`
    );

    item.style.borderRight = `4px solid ${task.color}`;

    if (task.done) item.classList.add("is-complete");

    const actions = document.createElement("div");
    actions.className = "row-actions";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "secondary-button";
    toggle.textContent = task.done ? "إلغاء الإنجاز" : "إتمام";
    toggle.addEventListener("click", () => {
      task.done = !task.done;
      saveState();
      renderAll();
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "text-button";
    remove.textContent = "حذف";
    remove.addEventListener("click", () => {
      state.tasks = state.tasks.filter((entry) => entry.id !== task.id);
      saveState();
      renderAll();
      showToast("تم حذف المهمة.");
    });

    actions.append(toggle, remove);
    item.appendChild(actions);
    list.appendChild(item);
  });
}

function renderWater() {
  const total = getTodayWaterTotal();
  const goal = Number(state.waterGoal) || 0;
  const percentage = goal > 0
    ? Math.min(100, Math.round((total / goal) * 100))
    : 0;

  setText("water-total-display", formatNumber(total));
  setText(
    "water-progress-label",
    goal > 0
      ? `${formatNumber(percentage)}٪ من الهدف الاختياري`
      : "لم تحدد هدفاً يومياً. يمكنك المتابعة دون هدف."
  );

  if ($("water-progress-fill")) {
    $("water-progress-fill").style.width = `${percentage}%`;
  }

  if ($("water-serving-input")) {
    $("water-serving-input").value = state.waterServing || 250;
  }

  if ($("water-optional-goal-input")) {
    $("water-optional-goal-input").value = goal || "";
  }

  const list = $("water-history-list");
  list.replaceChildren();

  const entries = getTodayWaterEntries();

  if (!entries.length) {
    list.innerHTML = '<div class="empty-state">لم تسجل أي كمية اليوم.</div>';
    return;
  }

  [...entries].reverse().forEach((entry) => {
    const time = new Date(entry.time).toLocaleTimeString("ar", {
      hour: "2-digit",
      minute: "2-digit"
    });

    list.appendChild(
      createItem(
        `${formatNumber(entry.amount)} مل`,
        `وقت التسجيل: ${time}`,
        [{
          label: "حذف",
          className: "text-button",
          onClick: () => {
            state.waterLog[localDateKey()] =
              getTodayWaterEntries().filter((item) => item.id !== entry.id);
            saveState();
            renderAll();
          }
        }]
      )
    );
  });
}

function renderStudy() {
  setText("study-today-total", `${formatNumber(getTodayStudyMinutes())} دقيقة`);

  const list = $("study-sessions-list");
  list.replaceChildren();

  const sessions = state.studySessions
    .filter((session) => session.date === localDateKey())
    .slice()
    .reverse();

  if (!sessions.length) {
    list.innerHTML = '<div class="empty-state">ستظهر جلساتك هنا بعد إكمالها.</div>';
    return;
  }

  sessions.forEach((session) => {
    list.appendChild(
      createItem(
        `${formatNumber(session.minutes)} دقيقة`,
        session.time || "جلسة دراسة"
      )
    );
  });
}

function renderFinance() {
  const income = state.finance
    .filter((entry) => entry.type === "income")
    .reduce((sum, entry) => sum + entry.amount, 0);

  const expenses = state.finance
    .filter((entry) => entry.type === "expense")
    .reduce((sum, entry) => sum + entry.amount, 0);

  setText("finance-income-total", formatMoney(income));
  setText("finance-expense-total", formatMoney(expenses));
  setText("finance-balance-total", formatMoney(income - expenses));

  const list = $("finance-list");
  list.replaceChildren();

  if (!state.finance.length) {
    list.innerHTML = '<div class="empty-state">لا توجد عمليات مسجلة.</div>';
    return;
  }

  [...state.finance].reverse().forEach((entry) => {
    const sign = entry.type === "income" ? "+" : "−";
    const item = createItem(
      entry.title,
      `${entry.category} • ${formatDate(entry.date)} • ${sign}${formatMoney(entry.amount)}`,
      [{
        label: "حذف",
        className: "text-button",
        onClick: () => {
          state.finance = state.finance.filter((x) => x.id !== entry.id);
          saveState();
          renderAll();
        }
      }]
    );

    list.appendChild(item);
  });
}

function renderJournal() {
  const list = $("journal-list");
  list.replaceChildren();

  if (!state.journal.length) {
    list.innerHTML = '<div class="empty-state">لم تحفظ أي ذكرى بعد.</div>';
    return;
  }

  [...state.journal].reverse().forEach((entry) => {
    const item = createItem(
      entry.title,
      `${formatDate(entry.date)}${entry.mood ? ` • ${entry.mood}` : ""}`
    );

    if (entry.content) {
      const content = document.createElement("p");
      content.className = "journal-content";
      content.textContent = entry.content;
      item.appendChild(content);
    }

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "text-button";
    remove.textContent = "حذف الذكرى";
    remove.addEventListener("click", () => {
      state.journal = state.journal.filter((x) => x.id !== entry.id);
      saveState();
      renderAll();
    });

    item.appendChild(remove);
    list.appendChild(item);
  });
}

function renderCompanion() {
  setText("companion-name-display", state.companion.name);
  setText("companion-happiness", formatNumber(state.companion.happiness));
  setText("companion-energy", formatNumber(state.companion.energy));
  setText("companion-name-input", state.companion.name);

  if ($("companion-name-input")) {
    $("companion-name-input").value = state.companion.name;
  }

  setText(
    "companion-status",
    state.companion.energy < 20
      ? "رفيقك يحتاج إلى الراحة."
      : state.companion.happiness < 25
        ? "رفيقك يحتاج إلى بعض الاهتمام."
        : "رفيقك بخير، استمر بالاهتمام به."
  );
}

function renderCapsules() {
  const list = $("capsules-list");
  list.replaceChildren();

  if (!state.capsules.length) {
    list.innerHTML = '<div class="empty-state">لا توجد كبسولات محفوظة.</div>';
    return;
  }

  [...state.capsules].reverse().forEach((capsule) => {
    const unlocked = capsule.date <= localDateKey();
    const item = createItem(
      capsule.title,
      unlocked
        ? `متاحة للفتح • ${formatDate(capsule.date)}`
        : `ستُفتح في ${formatDate(capsule.date)}`
    );

    if (unlocked) {
      const open = document.createElement("button");
      open.type = "button";
      open.className = "secondary-button";
      open.textContent = "فتح الرسالة";
      open.addEventListener("click", () => {
        showModal(capsule.title, capsule.message || "رسالة فارغة.");
      });
      item.appendChild(open);
    }

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "text-button";
    remove.textContent = "حذف";
    remove.addEventListener("click", () => {
      state.capsules = state.capsules.filter((x) => x.id !== capsule.id);
      saveState();
      renderAll();
    });

    item.appendChild(remove);
    list.appendChild(item);
  });
}

function renderProfile() {
  const profile = state.profile;

  if ($("profile-name-input")) $("profile-name-input").value = profile.name || "";
  if ($("profile-birth-input")) $("profile-birth-input").value = profile.dob || "";
  if ($("profile-height-input")) $("profile-height-input").value = profile.height || "";
  if ($("profile-weight-input")) $("profile-weight-input").value = profile.weight || "";

  const age = calculateAge(profile.dob);
  setText(
    "profile-age-display",
    age ? `${age.years} سنة` : "غير محدد"
  );
}

function renderSettings() {
  const settings = state.settings;

  if ($("theme-select")) $("theme-select").value = settings.theme;
  if ($("background-color-input")) $("background-color-input").value = settings.backgroundColor;
  if ($("card-color-input")) $("card-color-input").value = settings.cardColor;
  if ($("text-color-input")) $("text-color-input").value = settings.textColor;
  if ($("accent-color-input")) $("accent-color-input").value = settings.accent;
  if ($("highlight-color-input")) $("highlight-color-input").value = settings.highlight;
  if ($("reminders-enabled-input")) $("reminders-enabled-input").checked = settings.remindersEnabled;
  if ($("reminder-interval-input")) $("reminder-interval-input").value = settings.reminderInterval;
}

function renderAll() {
  applyAppearance();
  renderHome();
  renderTasks();
  renderWater();
  renderStudy();
  renderFinance();
  renderJournal();
  renderCompanion();
  renderCapsules();
  renderProfile();
  renderSettings();
      }
/* الأحداث والتفاعلات */

function addWater(amount) {
  const value = Number(amount);

  if (!Number.isFinite(value) || value <= 0 || value > 5000) {
    showToast("أدخل كمية صحيحة.");
    return;
  }

  const key = localDateKey();

  if (!Array.isArray(state.waterLog[key])) {
    state.waterLog[key] = [];
  }

  state.waterLog[key].push({
    id: makeId(),
    amount: Math.round(value),
    time: new Date().toISOString()
  });

  saveState();
  renderAll();
  showToast("تم تسجيل كمية الماء.");
}

function startStudyTimer() {
  if (studyTimer) return;

  const minutes = Number($("study-minutes-input").value);

  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 240) {
    showToast("اختر مدة بين دقيقة و240 دقيقة.");
    return;
  }

  studyDuration = Math.round(minutes);
  studyEndTime = Date.now() + studyDuration * 60 * 1000;

  $("study-start-btn").disabled = true;
  $("study-pause-btn").disabled = false;
  $("study-minutes-input").disabled = true;

  setText("study-timer-status", "جلسة الدراسة جارية.");

  studyTimer = setInterval(updateStudyTimer, 500);
  updateStudyTimer();
}

function updateStudyTimer() {
  const remaining = Math.max(0, Math.ceil((studyEndTime - Date.now()) / 1000));
  const minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
  const seconds = String(remaining % 60).padStart(2, "0");

  setText("study-timer-display", `${minutes}:${seconds}`);

  if (remaining <= 0) {
    finishStudyTimer();
  }
}

function pauseStudyTimer() {
  if (!studyTimer) return;

  const remaining = Math.max(0, Math.ceil((studyEndTime - Date.now()) / 1000));
  const elapsed = Math.max(0, studyDuration * 60 - remaining);

  clearInterval(studyTimer);
  studyTimer = null;

  if (elapsed >= 60) {
    state.studySessions.push({
      id: makeId(),
      date: localDateKey(),
      minutes: Math.floor(elapsed / 60),
      time: new Date().toLocaleTimeString("ar", {
        hour: "2-digit",
        minute: "2-digit"
      })
    });
    saveState();
  }

  resetStudyDisplay();
  renderAll();
  showToast("تم إيقاف الجلسة وتسجيل وقتها.");
}

function finishStudyTimer() {
  if (studyTimer) {
    clearInterval(studyTimer);
    studyTimer = null;
  }

  state.studySessions.push({
    id: makeId(),
    date: localDateKey(),
    minutes: studyDuration,
    time: new Date().toLocaleTimeString("ar", {
      hour: "2-digit",
      minute: "2-digit"
    })
  });

  saveState();
  resetStudyDisplay();
  renderAll();
  showModal("أحسنت!", "انتهت جلسة الدراسة. خذ استراحة قصيرة إذا احتجت.");
}

function resetStudyDisplay() {
  const minutes = Number($("study-minutes-input").value) || 25;

  setText(
    "study-timer-display",
    `${String(minutes).padStart(2, "0")}:00`
  );

  setText("study-timer-status", "المؤقت متوقف.");

  $("study-start-btn").disabled = false;
  $("study-pause-btn").disabled = true;
  $("study-minutes-input").disabled = false;
}

function saveProfile(event) {
  event.preventDefault();

  const dob = $("profile-birth-input").value;

  if (dob && !calculateAge(dob)) {
    showToast("تحقق من تاريخ الميلاد.");
    return;
  }

  state.profile = {
    name: $("profile-name-input").value.trim(),
    dob,
    height: $("profile-height-input").value
      ? Number($("profile-height-input").value) : "",
    weight: $("profile-weight-input").value
      ? Number($("profile-weight-input").value) : "",
    completed: true
  };

  saveState();
  renderAll();
  showToast("تم حفظ الملف الشخصي.");
}

function saveAppearance() {
  state.settings.theme = $("theme-select").value;
  state.settings.backgroundColor = $("background-color-input").value;
  state.settings.cardColor = $("card-color-input").value;
  state.settings.textColor = $("text-color-input").value;
  state.settings.accent = $("accent-color-input").value;
  state.settings.highlight = $("highlight-color-input").value;

  saveState();
  renderAll();
  showToast("تم حفظ المظهر.");
}

function exportBackup() {
  const backup = {
    app: "أثر يومي",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: state
  };

  const blob = new Blob(
    [JSON.stringify(backup, null, 2)],
    { type: "application/json;charset=utf-8" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `athar-yawmi-backup-${localDateKey()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
  showToast("تم تجهيز النسخة الاحتياطية.");
}

function validateImportedState(imported) {
  if (!imported || typeof imported !== "object" || Array.isArray(imported)) {
    throw new Error("الملف غير صالح.");
  }

  const candidate = imported.data || imported;

  if (typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("بنية النسخة الاحتياطية غير صحيحة.");
  }

  const base = createDefaultState();

  return {
    ...base,
    ...candidate,
    profile: {
      ...base.profile,
      ...(candidate.profile || {})
    },
    settings: {
      ...base.settings,
      ...(candidate.settings || {})
    },
    companion: {
      ...base.companion,
      ...(candidate.companion || {})
    },
    tasks: Array.isArray(candidate.tasks) ? candidate.tasks : [],
    finance: Array.isArray(candidate.finance) ? candidate.finance : [],
    journal: Array.isArray(candidate.journal) ? candidate.journal : [],
    capsules: Array.isArray(candidate.capsules) ? candidate.capsules : [],
    studySessions: Array.isArray(candidate.studySessions)
      ? candidate.studySessions : [],
    waterLog: candidate.waterLog && typeof candidate.waterLog === "object"
      ? candidate.waterLog : {},
    dailyNotes: candidate.dailyNotes && typeof candidate.dailyNotes === "object"
      ? candidate.dailyNotes : {}
  };
}

async function importBackup(file) {
  if (!file) return;

  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    const confirmed = confirm(
      "سيتم استبدال البيانات الحالية بالبيانات الموجودة في النسخة الاحتياطية. هل تريد المتابعة؟"
    );

    if (!confirmed) return;

    state = validateImportedState(imported);
    saveState();
    renderAll();
    showToast("تم استيراد النسخة الاحتياطية.");
  } catch (error) {
    console.error(error);
    showToast("تعذر استيراد الملف. تأكد أنه نسخة احتياطية صحيحة.");
  } finally {
    $("import-backup-input").value = "";
  }
}

function saveDailyNote() {
  state.dailyNotes[localDateKey()] = $("daily-note-input").value.trim();
  saveState();
  setText("daily-note-status", "تم حفظ ملاحظة اليوم.");
  showToast("تم حفظ ملاحظتك.");
}

function saveFinanceEntry(event) {
  event.preventDefault();

  const title = $("finance-title-input").value.trim();
  const amount = Number($("finance-amount-input").value);

  if (!title || !Number.isFinite(amount) || amount <= 0) {
    showToast("أدخل وصفاً ومبلغاً صحيحاً.");
    return;
  }

  state.finance.push({
    id: makeId(),
    title,
    amount,
    type: $("finance-type-input").value,
    category: $("finance-category-input").value,
    date: localDateKey()
  });

  $("finance-form").reset();
  saveState();
  renderAll();
  showToast("تم تسجيل العملية.");
}

function saveJournalEntry(event) {
  event.preventDefault();

  const title = $("journal-title-input").value.trim();

  if (!title) {
    showToast("اكتب عنوان الذكرى أولاً.");
    return;
  }

  state.journal.push({
    id: makeId(),
    title,
    content: $("journal-content-input").value.trim(),
    mood: $("journal-mood-input").value,
    date: localDateKey()
  });

  $("journal-form").reset();
  saveState();
  renderAll();
  showToast("تم حفظ الذكرى.");
}

function saveCapsule(event) {
  event.preventDefault();

  const title = $("capsule-title-input").value.trim();
  const message = $("capsule-message-input").value.trim();
  const date = $("capsule-date-input").value;

  if (!title || !date) {
    showToast("أدخل عنوان الرسالة وتاريخ فتحها.");
    return;
  }

  if (date < localDateKey()) {
    showToast("اختر تاريخ اليوم أو تاريخاً مستقبلياً.");
    return;
  }

  state.capsules.push({
    id: makeId(),
    title,
    message,
    date,
    createdAt: new Date().toISOString()
  });

  $("capsule-form").reset();
  saveState();
  renderAll();
  showToast("تم حفظ كبسولة الزمن.");
}

function saveCompanionName(event) {
  event.preventDefault();

  const name = $("companion-name-input").value.trim();

  if (!name) {
    showToast("اكتب اسماً لرفيقك.");
    return;
  }

  state.companion.name = name;
  saveState();
  renderAll();
  showToast("تم تغيير اسم رفيقك.");
}

function interactWithCompanion(action) {
  if (action === "play") {
    if (state.companion.energy < 10) {
      showToast("رفيقك يحتاج إلى الراحة قبل اللعب.");
      return;
    }

    state.companion.energy = Math.max(0, state.companion.energy - 10);
    state.companion.happiness = Math.min(100, state.companion.happiness + 15);
    showToast("قضيت وقتاً ممتعاً مع رفيقك!");
  } else {
    state.companion.energy = Math.min(100, state.companion.energy + 15);
    state.companion.happiness = Math.min(100, state.companion.happiness + 5);
    showToast("اعتنيت برفيقك.");
  }

  saveState();
  renderCompanion();
}

function saveReminderSettings() {
  const interval = Number($("reminder-interval-input").value);

  if (!Number.isFinite(interval) || interval < 15 || interval > 360) {
    showToast("الفاصل يجب أن يكون بين 15 و360 دقيقة.");
    return;
  }

  state.settings.remindersEnabled = $("reminders-enabled-input").checked;
  state.settings.reminderInterval = interval;

  saveState();
  setupReminders();

  showToast(
    state.settings.remindersEnabled
      ? "تم تفعيل التذكير أثناء استخدام التطبيق."
      : "تم إيقاف التذكيرات."
  );
}

function setupReminders() {
  clearInterval(reminderTimer);
  reminderTimer = null;

  if (!state.settings.remindersEnabled) return;

  reminderTimer = setInterval(() => {
    if (document.visibilityState !== "visible") return;

    showToast("تذكير لطيف: خذ استراحة قصيرة وراجع ما تريد إنجازه.");
  }, state.settings.reminderInterval * 60 * 1000);
}

function saveBackgroundImage(file) {
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("اختر ملف صورة.");
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    showToast("الصورة كبيرة. اختر صورة حجمها أقل من 2 ميغابايت.");
    $("background-image-input").value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    state.settings.backgroundImage = reader.result;
    saveState();
    renderAll();
    showToast("تم تغيير صورة الخلفية.");
  };

  reader.onerror = () => showToast("تعذر قراءة الصورة.");
  reader.readAsDataURL(file);
}

function savePinNotice() {
  const pin = $("app-pin-input").value.trim();

  if (!pin) {
    showToast("أدخل رمزاً أولاً.");
    return;
  }

  showModal(
    "تنبيه بخصوص القفل",
    "قفل التطبيق الحقيقي يحتاج إلى تنفيذ خاص داخل أندرويد. حفظ رمز هنا وحده لا يمنع فتح التطبيق ولا يحمي بياناتك. لذلك لم نحفظ الرمز كأنه قفل فعلي."
  );

  $("app-pin-input").value = "";
}

/* ربط الأحداث */

function bindEvents() {
  document.querySelectorAll("[data-page-target]").forEach((button) => {
    button.addEventListener("click", () => {
      navigateTo(button.dataset.pageTarget);
    });
  });

  document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => {
      navigateTo(button.dataset.go);
    });
  });

  $("header-profile-btn").addEventListener("click", () => {
    navigateTo("profile");
  });

  $("modal-close-btn").addEventListener("click", closeModal);
  $("modal-confirm-btn").addEventListener("click", closeModal);

  $("app-modal").addEventListener("click", (event) => {
    if (event.target === $("app-modal")) closeModal();
  });

  $("save-daily-note-btn").addEventListener("click", saveDailyNote);

  $("task-form").addEventListener("submit", (event) => {
    event.preventDefault();

    const title = $("task-title-input").value.trim();
    if (!title) return;

    state.tasks.push({
      id: makeId(),
      title,
      date: $("task-date-input").value || localDateKey(),
      priority: $("task-priority-input").value,
      color: $("task-color-input").value,
      done: false,
      createdAt: new Date().toISOString()
    });

    $("task-form").reset();
    $("task-color-input").value = "#38bdf8";

    saveState();
    renderAll();
    showToast("تمت إضافة المهمة.");
  });

  $("task-filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;

    currentTaskFilter = button.dataset.filter;

    document.querySelectorAll("[data-filter]").forEach((item) => {
      item.classList.toggle("active", item === button);
    });

    renderTasks();
  });

  $("add-water-btn").addEventListener("click", () => {
    addWater(state.waterServing);
  });

  $("custom-water-btn").addEventListener("click", () => {
    const amount = prompt("أدخل كمية الماء بالملليلتر:");
    if (amount !== null) addWater(amount);
  });

  $("water-serving-input").addEventListener("change", () => {
    const value = Number($("water-serving-input").value);

    if (!Number.isFinite(value) || value < 1 || value > 2000) {
      showToast("أدخل كمية بين 1 و2000 مل.");
      $("water-serving-input").value = state.waterServing;
      return;
    }

    state.waterServing = Math.round(value);
    saveState();
  });

  $("water-optional-goal-input").addEventListener("change", () => {
    const value = Number($("water-optional-goal-input").value);

    if (!Number.isFinite(value) || value < 0 || value > 10000) {
      showToast("أدخل هدفاً صحيحاً أو اترك الحقل فارغاً.");
      return;
    }

    state.waterGoal = Math.round(value);
    saveState();
    renderWater();
  });

  $("study-start-btn").addEventListener("click", startStudyTimer);
  $("study-pause-btn").addEventListener("click", pauseStudyTimer);

  $("study-reset-btn").addEventListener("click", () => {
    if (studyTimer) {
      clearInterval(studyTimer);
      studyTimer = null;
    }

    resetStudyDisplay();
    showToast("تمت إعادة ضبط المؤقت.");
  });

  $("finance-form").addEventListener("submit", saveFinanceEntry);
  $("journal-form").addEventListener("submit", saveJournalEntry);
  $("capsule-form").addEventListener("submit", saveCapsule);
  $("profile-form").addEventListener("submit", saveProfile);
  $("companion-name-form").addEventListener("submit", saveCompanionName);

  $("companion-play-btn").addEventListener("click", () => {
    interactWithCompanion("play");
  });

  $("companion-care-btn").addEventListener("click", () => {
    interactWithCompanion("care");
  });

  $("save-appearance-btn").addEventListener("click", saveAppearance);

  $("background-image-input").addEventListener("change", (event) => {
    saveBackgroundImage(event.target.files[0]);
  });

  $("remove-background-image-btn").addEventListener("click", () => {
    state.settings.backgroundImage = "";
    $("background-image-input").value = "";
    saveState();
    renderAll();
    showToast("تمت إزالة صورة الخلفية.");
  });

  $("export-backup-btn").addEventListener("click", exportBackup);

  $("import-backup-input").addEventListener("change", (event) => {
    importBackup(event.target.files[0]);
  });

  $("save-reminders-btn").addEventListener("click", saveReminderSettings);
  $("save-pin-btn").addEventListener("click", savePinNotice);

  $("remove-pin-btn").addEventListener("click", () => {
    showToast("لا يوجد قفل فعلي مفعّل في هذه النسخة.");
  });

  $("profile-birth-input").addEventListener("change", () => {
    const age = calculateAge($("profile-birth-input").value);
    setText(
      "profile-age-display",
      age ? `${age.years} سنة` : "غير محدد"
    );
  });
}

/* بدء التطبيق */

function initializeApp() {
  bindEvents();
  renderAll();
  setupReminders();

  if ($("loading-screen")) $("loading-screen").hidden = true;
  if ($("app-content")) $("app-content").hidden = false;

  // تعيين تاريخ اليوم افتراضياً لحقل المهمة.
  if ($("task-date-input")) {
    $("task-date-input").value = localDateKey();
  }

  // تحديث المؤقت المعروض عند فتح صفحة الدراسة.
  resetStudyDisplay();

  console.log("أثر يومي جاهز للعمل.");
}

document.addEventListener("DOMContentLoaded", initializeApp);
