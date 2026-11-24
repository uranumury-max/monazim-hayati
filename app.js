
"use strict";

/* أثر يومي — التطبيق الرئيسي */

const STORAGE_KEY = "monazim_hayati_v1";
const TIMER_KEY = "athar_study_timer_v1";

const $ = (id) => document.getElementById(id);

const today = () => new Date().toISOString().slice(0, 10);

const makeId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const escapeHTML = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);

const defaultState = {
  profile: {
    name: "",
    age: ""
  },
  tasks: [],
  water: {
    date: today(),
    count: 0,
    goal: 2000,
    log: []
  },
  study: {
    sessions: []
  },
  finance: [],
  journal: [],
  dailyNotes: {},
  capsules: [],
  companion: {},
  settings: {
    theme: "system",
    accentColor: "#38bdf8",
    backgroundImage: "",
    remindersEnabled: false,
    reminderInterval: 60,
    pin: ""
  }
};

let state = loadState();
let activeTaskFilter = "all";
let studyInterval = null;
let studyTimer = loadTimer();
let mediaRecorder = null;
let recordedChunks = [];
let voiceRecordings = [];
let reminderInterval = null;

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return structuredClone(defaultState);
    }

    const parsed = JSON.parse(saved);

    return {
      ...structuredClone(defaultState),
      ...parsed,
      profile: {
        ...defaultState.profile,
        ...(parsed.profile || {})
      },
      water: {
        ...defaultState.water,
        ...(parsed.water || {})
      },
      study: {
        ...defaultState.study,
        ...(parsed.study || {})
      },
      settings: {
        ...defaultState.settings,
        ...(parsed.settings || {})
      },
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      finance: Array.isArray(parsed.finance) ? parsed.finance : [],
      journal: Array.isArray(parsed.journal) ? parsed.journal : [],
      capsules: Array.isArray(parsed.capsules) ? parsed.capsules : [],
      dailyNotes: parsed.dailyNotes || {}
    };
  } catch (error) {
    console.error("تعذر تحميل البيانات:", error);
    return structuredClone(defaultState);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error("تعذر حفظ البيانات:", error);
    showToast("تعذر الحفظ. قد تكون مساحة التخزين ممتلئة.");
    return false;
  }
}

function showToast(message) {
  const toast = $("app-toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

function formatDate(date) {
  if (!date) return "";

  try {
    return new Date(date + "T00:00:00").toLocaleDateString("ar", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  } catch {
    return date;
  }
}

function showEmpty(container, message = "لا توجد بيانات بعد.") {
  if (container) {
    container.innerHTML =
      `<div class="empty-state">${escapeHTML(message)}</div>`;
  }
}

/* التنقل بين الصفحات */

function showPage(pageName) {
  document.querySelectorAll(".page-section").forEach((page) => {
    page.classList.toggle("active", page.dataset.page === pageName);
  });

  document.querySelectorAll("[data-page-target]").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.pageTarget === pageName
    );
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindNavigation() {
  document.querySelectorAll("[data-page-target]").forEach((button) => {
    button.addEventListener("click", () => {
      showPage(button.dataset.pageTarget);
    });
  });

  $("header-profile-btn")?.addEventListener("click", () => {
    showPage("profile");
  });
}

/* الصفحة الرئيسية والملاحظات */

function renderHome() {
  const pending = state.tasks.filter((task) => !task.completed).length;

  if ($("home-tasks-count")) {
    $("home-tasks-count").textContent = pending;
  }

  if ($("home-water-count")) {
    $("home-water-count").textContent = state.water.count;
  }

  if ($("home-study-count")) {
    $("home-study-count").textContent = state.study.sessions.length;
  }

  const greeting = $("home-greeting");
  if (greeting) {
    greeting.textContent = state.profile.name
      ? `أهلاً ${state.profile.name} 🌱`
      : "أهلاً بك 🌱";
  }

  const noteInput = $("daily-note-input");
  if (noteInput) {
    noteInput.value = state.dailyNotes[today()] || "";
  }

  renderDailyNotesArchive();
}

function saveDailyNote() {
  const input = $("daily-note-input");
  if (!input) return;

  const value = input.value.trim();

  if (value) {
    state.dailyNotes[today()] = value;
  } else {
    delete state.dailyNotes[today()];
  }

  saveState();
  renderDailyNotesArchive();

  if ($("daily-note-status")) {
    $("daily-note-status").textContent = "تم حفظ ملاحظة اليوم.";
  }

  showToast("تم حفظ الملاحظة");
}

function renderDailyNotesArchive() {
  const container = $("daily-notes-archive-list");
  if (!container) return;

  const entries = Object.entries(state.dailyNotes)
    .filter(([date, note]) => date !== today() && note)
    .sort(([a], [b]) => b.localeCompare(a));

  if (!entries.length) {
    showEmpty(container, "ستظهر هنا ملاحظات الأيام السابقة.");
    return;
  }

  container.innerHTML = entries.map(([date, note]) => `
    <div class="list-item">
      <strong>${escapeHTML(formatDate(date))}</strong>
      <p>${escapeHTML(note)}</p>
    </div>
  `).join("");
}

/* المهام */

function bindTasks() {
  $("task-form")?.addEventListener("submit", (event) => {
    event.preventDefault();

    const title = $("task-title-input")?.value.trim();
    if (!title) return;

    state.tasks.unshift({
      id: makeId(),
      title,
      date: $("task-date-input")?.value || "",
      priority: $("task-priority-input")?.value || "medium",
      completed: false,
      createdAt: Date.now()
    });

    saveState();
    event.target.reset();
    renderTasks();
    renderHome();
    showToast("تمت إضافة المهمة");
  });

  document.querySelectorAll("[data-task-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeTaskFilter = button.dataset.taskFilter;
      renderTasks();
    });
  });
}

function renderTasks() {
  const container = $("tasks-list");
  if (!container) return;

  let tasks = [...state.tasks];

  if (activeTaskFilter === "active") {
    tasks = tasks.filter((task) => !task.completed);
  } else if (activeTaskFilter === "completed") {
    tasks = tasks.filter((task) => task.completed);
  }

  if (!tasks.length) {
    showEmpty(container, "لا توجد مهام في هذا القسم.");
    return;
  }

  container.innerHTML = tasks.map((task) => `
    <div class="task-item ${task.completed ? "completed" : ""}">
      <div class="task-title">${escapeHTML(task.title)}</div>
      <div class="task-meta">
        ${task.date ? escapeHTML(formatDate(task.date)) : ""}
        <span class="priority-badge priority-${escapeHTML(task.priority)}">
          ${task.priority === "high" ? "عالية" :
            task.priority === "low" ? "منخفضة" : "متوسطة"}
        </span>
      </div>
      <div class="task-actions">
        <button data-task-toggle="${escapeHTML(task.id)}">
          ${task.completed ? "إلغاء الإنجاز" : "إنجاز"}
        </button>
        <button data-task-delete="${escapeHTML(task.id)}">حذف</button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll("[data-task-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = state.tasks.find(
        (item) => item.id === button.dataset.taskToggle
      );
      if (!task) return;

      task.completed = !task.completed;
      saveState();
      renderTasks();
      renderHome();
    });
  });

  container.querySelectorAll("[data-task-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tasks = state.tasks.filter(
        (task) => task.id !== button.dataset.taskDelete
      );
      saveState();
      renderTasks();
      renderHome();
      showToast("تم حذف المهمة");
    });
  });
}

/* الماء */

function resetWaterIfNewDay() {
  if (state.water.date !== today()) {
    state.water.date = today();
    state.water.count = 0;
    state.water.log = [];
    saveState();
  }
}

function bindWater() {
  $("add-water-btn")?.addEventListener("click", () => {
    const amount = Number($("water-amount-input")?.value);

    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("أدخل كمية صحيحة");
      return;
    }

    state.water.count += amount;
    state.water.log.unshift({
      id: makeId(),
      amount,
      time: new Date().toLocaleTimeString("ar", {
        hour: "2-digit",
        minute: "2-digit"
      })
    });

    saveState();
    renderWater();
    renderHome();
    showToast("تمت إضافة الماء 💧");
  });

  $("water-goal-input")?.addEventListener("change", () => {
    const goal = Number($("water-goal-input").value);
    if (goal > 0) {
      state.water.goal = goal;
      saveState();
    }
  });

  $("reset-water-btn")?.addEventListener("click", () => {
    state.water.count = 0;
    state.water.log = [];
    saveState();
    renderWater();
    renderHome();
    showToast("تمت إعادة ضبط سجل الماء");
  });
}

function renderWater() {
  resetWaterIfNewDay();

  if ($("water-current-count")) {
    $("water-current-count").textContent = state.water.count;
  }

  if ($("water-goal-input")) {
    $("water-goal-input").value = state.water.goal;
  }

  const container = $("water-log-list");
  if (!container) return;

  if (!state.water.log.length) {
    showEmpty(container, "لم تسجل شرب الماء اليوم.");
    return;
  }

  container.innerHTML = state.water.log.map((item) => `
    <div class="water-log-item">
      <strong>${escapeHTML(item.amount)} مل</strong>
      <span>${escapeHTML(item.time || "")}</span>
    </div>
  `).join("");
}

/* مؤقت الدراسة */

function loadTimer() {
  try {
    return JSON.parse(localStorage.getItem(TIMER_KEY)) || {
      active: false,
      paused: false,
      endAt: 0,
      remaining: 0,
      total: 1500,
      sessionLogged: false
    };
  } catch {
    return {
      active: false,
      paused: false,
      endAt: 0,
      remaining: 0,
      total: 1500,
      sessionLogged: false
    };
  }
}

function saveTimer() {
  try {
    localStorage.setItem(TIMER_KEY, JSON.stringify(studyTimer));
  } catch (error) {
    console.error("تعذر حفظ المؤقت:", error);
  }
}

function timerRemaining() {
  if (studyTimer.active && !studyTimer.paused) {
    return Math.max(0, Math.ceil((studyTimer.endAt - Date.now()) / 1000));
  }

  return Math.max(0, studyTimer.remaining);
}

function renderTimer() {
  const seconds = timerRemaining();
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  if ($("study-timer-display")) {
    $("study-timer-display").textContent =
      `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
}

function startStudyTimer() {
  if (studyTimer.active && !studyTimer.paused) return;

  if (!studyTimer.remaining || studyTimer.remaining <= 0) {
    const minutes = Number($("study-minutes-input")?.value || 25);

    if (!Number.isFinite(minutes) || minutes <= 0) {
      showToast("أدخل مدة صحيحة");
      return;
    }

    studyTimer.total = Math.round(minutes * 60);
    studyTimer.remaining = studyTimer.total;
    studyTimer.sessionLogged = false;
  }

  studyTimer.active = true;
  studyTimer.paused = false;
  studyTimer.endAt = Date.now() + studyTimer.remaining * 1000;

  saveTimer();
  clearInterval(studyInterval);

  studyInterval = setInterval(tickStudyTimer, 250);
  renderTimer();
}

function pauseStudyTimer() {
  if (!studyTimer.active || studyTimer.paused) return;

  studyTimer.remaining = timerRemaining();
  studyTimer.active = false;
  studyTimer.paused = true;

  clearInterval(studyInterval);
  saveTimer();
  renderTimer();
  showToast("تم إيقاف الجلسة مؤقتاً");
}

function tickStudyTimer() {
  const remaining = timerRemaining();

  if (remaining <= 0) {
    finishStudyTimer();
    return;
  }

  renderTimer();
}

function finishStudyTimer() {
  clearInterval(studyInterval);

  if (!studyTimer.sessionLogged) {
    state.study.sessions.unshift({
      id: makeId(),
      minutes: Math.round(studyTimer.total / 60),
      date: today(),
      time: new Date().toLocaleTimeString("ar", {
        hour: "2-digit",
        minute: "2-digit"
      })
    });

    studyTimer.sessionLogged = true;
    saveState();
  }

  studyTimer.active = false;
  studyTimer.paused = false;
  studyTimer.remaining = 0;
  studyTimer.endAt = 0;

  saveTimer();
  renderStudy();
  renderHome();
  showToast("انتهت جلسة التركيز! 🎉");
}

function resetStudyTimer() {
  clearInterval(studyInterval);

  studyTimer = {
    active: false,
    paused: false,
    endAt: 0,
    remaining: 0,
    total: 1500,
    sessionLogged: false
  };

  saveTimer();
  renderTimer();
}

function bindStudy() {
  $("start-study-btn")?.addEventListener("click", startStudyTimer);
  $("pause-study-btn")?.addEventListener("click", pauseStudyTimer);
  $("reset-study-btn")?.addEventListener("click", resetStudyTimer);
}

function renderStudy() {
  renderTimer();

  const container = $("study-sessions-list");
  if (!container) return;

  if (!state.study.sessions.length) {
    showEmpty(container, "ستظهر جلساتك هنا بعد إكمالها.");
    return;
  }

  container.innerHTML = state.study.sessions.map((session) => `
    <div class="study-session-item">
      <strong>${escapeHTML(session.minutes)} دقيقة</strong>
      <p>${escapeHTML(formatDate(session.date))} ${escapeHTML(session.time || "")}</p>
    </div>
  `).join("");
}

/* المصروفات */

function bindFinance() {
  $("finance-form")?.addEventListener("submit", (event) => {
    event.preventDefault();

    const title = $("finance-title-input")?.value.trim();
    const amount = Number($("finance-amount-input")?.value);
    const type = $("finance-type-input")?.value || "expense";

    if (!title || !Number.isFinite(amount) || amount <= 0) {
      showToast("تأكد من البيانات");
      return;
    }

    state.finance.unshift({
      id: makeId(),
      title,
      amount,
      type,
      date: today()
    });

    saveState();
    event.target.reset();
    renderFinance();
    showToast("تم تسجيل العملية");
  });
}

function renderFinance() {
  const container = $("finance-list");
  if (!container) return;

  if (!state.finance.length) {
    showEmpty(container, "لا توجد عمليات مالية.");
    return;
  }

  container.innerHTML = state.finance.map((item) => `
    <div class="finance-item">
      <strong>${escapeHTML(item.title)}</strong>
      <p>
        ${item.type === "income" ? "دخل" : "مصروف"}:
        ${escapeHTML(item.amount)}
      </p>
      <small>${escapeHTML(formatDate(item.date))}</small>
      <button data-finance-delete="${escapeHTML(item.id)}">حذف</button>
    </div>
  `).join("");

  container.querySelectorAll("[data-finance-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.finance = state.finance.filter(
        (item) => item.id !== button.dataset.financeDelete
      );
      saveState();
      renderFinance();
    });
  });
}

/* اليوميات */

function bindJournal() {
  $("journal-form")?.addEventListener("submit", (event) => {
    event.preventDefault();

    const title = $("journal-title-input")?.value.trim() || "يومياتي";
    const content = $("journal-content-input")?.value.trim();

    if (!content) {
      showToast("اكتب شيئاً قبل الحفظ");
      return;
    }

    state.journal.unshift({
      id: makeId(),
      title,
      content,
      date: today(),
      createdAt: Date.now()
    });

    saveState();
    event.target.reset();
    renderJournal();
    showToast("تم حفظ يومياتك");
  });
}

function renderJournal() {
  const container = $("journal-list");
  if (!container) return;

  if (!state.journal.length) {
    showEmpty(container, "لم تكتب يوميات بعد.");
    return;
  }

  container.innerHTML = state.journal.map((entry) => `
    <div class="journal-item">
      <strong>${escapeHTML(entry.title)}</strong>
      <small>${escapeHTML(formatDate(entry.date))}</small>
      <p>${escapeHTML(entry.content)}</p>
      <button data-journal-delete="${escapeHTML(entry.id)}">حذف</button>
    </div>
  `).join("");

  container.querySelectorAll("[data-journal-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.journal = state.journal.filter(
        (entry) => entry.id !== button.dataset.journalDelete
      );
      saveState();
      renderJournal();
    });
  });
}

/* تسجيل الصوت */

function bindVoiceRecorder() {
  const startButton = $("voice-record-btn");
  const stopButton = $("voice-stop-btn");
  const status = $("voice-record-status");

  if (!startButton || !stopButton) return;

  startButton.addEventListener("click", async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      if (status) {
        status.textContent = "هذا المتصفح لا يدعم التسجيل الصوتي.";
      }
      showToast("التسجيل غير مدعوم في هذا المتصفح");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });

      recordedChunks = [];
      mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      });

      mediaRecorder.addEventListener("stop", () => {
        const blob = new Blob(recordedChunks, {
          type: mediaRecorder.mimeType || "audio/webm"
        });

        const url = URL.createObjectURL(blob);

        voiceRecordings.unshift({
          id: makeId(),
          url,
          blob,
          date: new Date().toLocaleString("ar")
        });

        renderVoiceRecordings();

        stream.getTracks().forEach((track) => track.stop());

        if (status) status.textContent = "تم إيقاف التسجيل.";
      });

      mediaRecorder.start();

      startButton.disabled = true;
      stopButton.disabled = false;

      if (status) status.textContent = "جاري التسجيل...";
    } catch (error) {
      console.error(error);
      if (status) status.textContent = "لم يتم السماح باستخدام الميكروفون.";
      showToast("تحقق من إذن الميكروفون");
    }
  });

  stopButton.addEventListener("click", () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      startButton.disabled = false;
      stopButton.disabled = true;
    }
  });
}

function renderVoiceRecordings() {
  const container = $("voice-recordings-list");
  if (!container) return;

  if (!voiceRecordings.length) {
    showEmpty(container, "لا توجد تسجيلات في هذه الجلسة.");
    return;
  }

  container.innerHTML = voiceRecordings.map((recording) => `
    <div class="list-item">
      <p>${escapeHTML(recording.date)}</p>
      <audio controls src="${recording.url}"></audio>
      <button data-voice-download="${escapeHTML(recording.id)}">حفظ التسجيل</button>
    </div>
  `).join("");

  container.querySelectorAll("[data-voice-download]").forEach((button) => {
    button.addEventListener("click", () => {
      const recording = voiceRecordings.find(
        (item) => item.id === button.dataset.voiceDownload
      );

      if (!recording) return;

      const link = document.createElement("a");
      link.href = recording.url;
      link.download = `athar-recording-${recording.id}.webm`;
      link.click();
    });
  });
}

/* كبسولة الزمن */

function bindCapsules() {
  $("capsule-form")?.addEventListener("submit", (event) => {
    event.preventDefault();

    const title = $("capsule-title-input")?.value.trim();
    const content = $("capsule-content-input")?.value.trim();
    const date = $("capsule-date-input")?.value;

    if (!title || !content || !date) {
      showToast("أكمل بيانات الكبسولة");
      return;
    }

    state.capsules.unshift({
      id: makeId(),
      title,
      content,
      date,
      createdAt: Date.now()
    });

    saveState();
    event.target.reset();
    renderCapsules();
    showToast("تم حفظ كبسولة الزمن");
  });
}

function renderCapsules() {
  const container = $("capsules-list");
  if (!container) return;

  if (!state.capsules.length) {
    showEmpty(container, "لم تنشئ كبسولات بعد.");
    return;
  }

  container.innerHTML = state.capsules.map((capsule) => {
    const unlocked = capsule.date <= today();

    return `
      <div class="capsule-item">
        <strong>${escapeHTML(capsule.title)}</strong>
        <p>موعد الفتح: ${escapeHTML(formatDate(capsule.date))}</p>
        ${unlocked
          ? `<p>${escapeHTML(capsule.content)}</p>`
          : "<p>🔒 لم يحن موعد فتح هذه الكبسولة بعد.</p>"}
        <button data-capsule-delete="${escapeHTML(capsule.id)}">حذف</button>
      </div>
    `;
  }).join("");

  container.querySelectorAll("[data-capsule-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.capsules = state.capsules.filter(
        (item) => item.id !== button.dataset.capsuleDelete
      );
      saveState();
      renderCapsules();
    });
  });
}

/* الملف الشخصي */

function bindProfile() {
  $("profile-form")?.addEventListener("submit", (event) => {
    event.preventDefault();

    state.profile.name = $("profile-name-input")?.value.trim() || "";
    state.profile.age = $("profile-age-input")?.value || "";

    saveState();
    renderHome();
    showToast("تم حفظ الملف الشخصي");
  });
}

function renderProfile() {
  if ($("profile-name-input")) {
    $("profile-name-input").value = state.profile.name || "";
  }

  if ($("profile-age-input")) {
    $("profile-age-input").value = state.profile.age || "";
  }
}

/* الإعدادات والمظهر */

function applyAppearance() {
  const app = $("app");
  if (!app) return;

  app.classList.toggle("theme-light", state.settings.theme === "light");

  if (state.settings.theme === "system") {
    app.classList.toggle(
      "theme-light",
      window.matchMedia("(prefers-color-scheme: light)").matches
    );
  }

  document.documentElement.style.setProperty(
    "--accent",
    state.settings.accentColor || "#38bdf8"
  );

  if (state.settings.backgroundImage) {
    document.documentElement.style.setProperty(
      "--app-background-image",
      `url("${state.settings.backgroundImage}")`
    );
  } else {
    document.documentElement.style.setProperty(
      "--app-background-image",
      "none"
    );
  }

  if ($("theme-select")) {
    $("theme-select").value = state.settings.theme;
  }

  if ($("accent-color-input")) {
    $("accent-color-input").value = state.settings.accentColor;
  }
}

function bindSettings() {
  $("theme-select")?.addEventListener("change", (event) => {
    state.settings.theme = event.target.value;
    saveState();
    applyAppearance();
  });

  $("accent-color-input")?.addEventListener("change", (event) => {
    state.settings.accentColor = event.target.value;
    saveState();
    applyAppearance();
  });

  $("background-image-input")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("اختر صورة");
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      showToast("الصورة كبيرة. اختر صورة أقل من 3 ميغابايت.");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();

      image.onload = () => {
        const canvas = document.createElement("canvas");
        const maxSize = 1200;
        const scale = Math.min(
          1,
          maxSize / Math.max(image.width, image.height)
        );

        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        state.settings.backgroundImage =
          canvas.toDataURL("image/jpeg", 0.72);

        if (saveState()) {
          applyAppearance();
          showToast("تم تغيير الخلفية");
        }
      };

      image.src = reader.result;
    };

    reader.readAsDataURL(file);
  });

  $("remove-background-btn")?.addEventListener("click", () => {
    state.settings.backgroundImage = "";
    saveState();
    applyAppearance();
    showToast("تمت إزالة الخلفية");
  });

  $("save-reminders-btn")?.addEventListener("click", () => {
    state.settings.remindersEnabled =
      Boolean($("reminders-enabled-input")?.checked);

    state.settings.reminderInterval =
      Math.max(1, Number($("reminder-interval-input")?.value || 60));

    saveState();
    setupInAppReminders();

    showToast("تم حفظ إعدادات التذكير داخل التطبيق");
  });

  $("save-app-pin-btn")?.addEventListener("click", () => {
    showToast("قفل التطبيق الحقيقي يحتاج إلى تطوير Android أصلي.");
  });

  $("remove-app-pin-btn")?.addEventListener("click", () => {
    showToast("لا يوجد قفل Android أصلي مفعّل في هذه النسخة.");
  });

  $("export-backup-btn")?.addEventListener("click", exportBackup);

  $("import-backup-input")?.addEventListener("change", importBackup);
}

function renderSettings() {
  if ($("reminders-enabled-input")) {
    $("reminders-enabled-input").checked =
      Boolean(state.settings.remindersEnabled);
  }

  if ($("reminder-interval-input")) {
    $("reminder-interval-input").value =
      state.settings.reminderInterval || 60;
  }
}

/* تذكيرات داخل التطبيق فقط */

function setupInAppReminders() {
  clearInterval(reminderInterval);

  if (!state.settings.remindersEnabled) return;

  const minutes = Math.max(
    1,
    Number(state.settings.reminderInterval || 60)
  );

  reminderInterval = setInterval(() => {
    if (document.visibilityState === "visible") {
      showToast("تذكير لطيف: خذ استراحة قصيرة أو اشرب ماء 💧");
    }
  }, minutes * 60 * 1000);
}

/* النسخ الاحتياطي */

function exportBackup() {
  const backup = {
    app: "أثر يومي",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: state
  };

  const blob = new Blob(
    [JSON.stringify(backup, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `athar-daily-backup-${today()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1500);
  showToast("تم تجهيز النسخة الاحتياطية");
}

function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const imported = parsed.data || parsed;

      if (!imported || typeof imported !== "object") {
        throw new Error("ملف غير صالح");
      }

      state = {
        ...structuredClone(defaultState),
        ...imported,
        settings: {
          ...defaultState.settings,
          ...(imported.settings || {})
        }
      };

      saveState();
      renderAll();
      applyAppearance();
      showToast("تمت استعادة البيانات");
    } catch (error) {
      console.error(error);
      showToast("الملف غير صالح أو لا يحتوي على نسخة احتياطية.");
    }
  };

  reader.readAsText(file);
}

/* عرض كل الأقسام */

function renderAll() {
  renderHome();
  renderTasks();
  renderWater();
  renderStudy();
  renderFinance();
  renderJournal();
  renderCapsules();
  renderProfile();
  renderSettings();
}

/* بدء التطبيق */

function initApp() {
  bindNavigation();
  bindTasks();
  bindWater();
  bindStudy();
  bindFinance();
  bindJournal();
  bindVoiceRecorder();
  bindCapsules();
  bindProfile();
  bindSettings();

  resetWaterIfNewDay();
  renderAll();
  applyAppearance();
  setupInAppReminders();

  if (studyTimer.active && !studyTimer.paused) {
    if (timerRemaining() <= 0) {
      finishStudyTimer();
    } else {
      studyInterval = setInterval(tickStudyTimer, 250);
    }
  }

  const loading = $("loading-screen");
  if (loading) {
    setTimeout(() => loading.classList.add("hidden"), 350);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
