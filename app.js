const STORAGE_KEY = "monazim_hayati_v1";

const defaultState = {
  profile: {
    name: "",
    dob: "",
    weight: 70,
    height: 170,
    gender: "male",
    role: "student",
    completed: false
  },
  waterMl: 0,
  mood: "normal",
  tasks: [],
  voiceClips: [],
  blockedApps: ["تيك توك", "ألعاب"],
  focusActive: false,
  expenses: [],
  pets: ["قطة"],
  capsules: [],
  settings: {
    theme: "dark",
    cardStyle: "card-style-1",
    accent: "#38bdf8",
    bgImage: "",
    pin: "",
    banterTone: "funny"
  },
  unlocked: true
};

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(defaultState));
}

let state = loadState();
let mediaRecorder = null;
let audioChunks = [];
let gameTimer = null;
let gameScore = 0;
let gameTimeLeft = 10;
let studyTimerInterval = null;
let studyRemainingSec = 45 * 60;
const notifiedTasksToday = new Set();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const base = cloneDefaultState();
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    const mergedSettings = { ...base.settings, ...(parsed.settings || {}) };
    const mergedProfile = { ...base.profile, ...(parsed.profile || {}) };
    if (!mergedProfile.completed && (mergedProfile.name || mergedProfile.dob)) {
      mergedProfile.completed = true;
    }
    const shouldLockOnStart = Boolean(mergedSettings.pin);
    return {
      ...base,
      ...parsed,
      profile: mergedProfile,
      settings: mergedSettings,
      unlocked: shouldLockOnStart ? false : true
    };
  } catch {
    return cloneDefaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    alert("مساحة التخزين المحلية ممتلئة؛ يرجى اختيار صورة خلفية أصغر حجماً.");
  }
}

function calcExactAge(dobStr) {
  if (!dobStr) return null;
  const birth = new Date(dobStr + "T00:00:00");
  const now = new Date();
  if (isNaN(birth.getTime()) || birth > now) return null;

  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  let days = now.getDate() - birth.getDate();

  if (days < 0) {
    const prevMonthLastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    days += prevMonthLastDay;
    months -= 1;
  }
  if (months < 0) {
    months += 12;
    years -= 1;
  }
  return { years, months, days };
}

function calcWaterGoalMl() {
  const w = Number(state.profile.weight) || 70;
  const ageObj = calcExactAge(state.profile.dob);
  const ageYears = ageObj ? ageObj.years : 18;
  let ml = w * 35;
  if (state.profile.gender === "female") ml *= 0.92;
  if (ageYears < 14) ml *= 0.85;
  if (state.mood === "travel") ml += 350;
  return Math.round(ml);
}

function enforceSecurityGuards() {
  const lockScreen = document.getElementById("lock-screen");
  const onboardingScreen = document.getElementById("onboarding-screen");

  if (state.settings.pin && !state.unlocked) {
    lockScreen.classList.remove("hidden");
    onboardingScreen.classList.add("hidden");
    return;
  }

  lockScreen.classList.add("hidden");

  if (!state.profile.completed) {
    onboardingScreen.classList.remove("hidden");
  } else {
    onboardingScreen.classList.add("hidden");
  }
}

function applyAppearance() {
  const appEl = document.getElementById("app");
  const validStyles = ["card-style-1", "card-style-2", "card-style-3", "card-style-4", "card-style-5"];
  const chosenStyle = validStyles.includes(state.settings.cardStyle) ? state.settings.cardStyle : "card-style-1";
  const themeClass = state.settings.theme === "light" ? "theme-light" : "theme-dark";

  appEl.className = `${themeClass} ${chosenStyle}`;
  const accentVal = state.settings.accent || "#38bdf8";
  document.documentElement.style.setProperty("--accent", accentVal);
  appEl.style.setProperty("--accent", accentVal);
  appEl.style.backgroundImage = state.settings.bgImage ? `url(${state.settings.bgImage})` : "none";

  enforceSecurityGuards();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function playBeepAlert() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 780;
    gain.gain.value = 0.1;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, 400);
  } catch {
    // تجاهل في حال تعذر تشغيل الصوت تلقائياً
  }
}

function triggerTaskAlert(titleText) {
  playBeepAlert();
  alert(`تنبيه الموعد: ${titleText}`);
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification("منظم حياتي", { body: `حان موعد: ${titleText}` });
    } catch {
      // تجاهل في حال عدم دعم إشعارات النظام المباشرة
    }
  }
}

function formatClock(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function roleLabel(role) {
  if (role === "employee") return "موظف";
  if (role === "household") return "رب بيت";
  return "طالب";
}

function genderLabel(gender) {
  return gender === "female" ? "أنثى" : "ذكر";
}

function renderAll() {
  applyAppearance();

  // العمر الديناميكي والبطاقة الشخصية
  const ageObj = calcExactAge(state.profile.dob);
  const liveAgeEl = document.getElementById("live-age");
  const exactAgeEl = document.getElementById("exact-age-display");
  const summaryEl = document.getElementById("profile-summary-text");

  if (ageObj) {
    const ageText = `${ageObj.years} سنة، ${ageObj.months} شهر، ${ageObj.days} يوم`;
    liveAgeEl.textContent = `${state.profile.name ? state.profile.name + " • " : ""}${ageText}`;
    exactAgeEl.textContent = `العمر المحدث اليوم تلقائياً: ${ageText}`;
  } else {
    liveAgeEl.textContent = "يرجى تحديد تاريخ الميلاد لحساب العمر تلقائياً.";
    exactAgeEl.textContent = "";
  }

  if (state.profile.completed) {
    summaryEl.textContent =
      `الاسم: ${state.profile.name || "غير محدد"} • الجنس: ${genderLabel(state.profile.gender)} • الصفة: ${roleLabel(state.profile.role)} • الوزن: ${state.profile.weight} كغ • الطول: ${state.profile.height} سم`;
  } else {
    summaryEl.textContent = "لم يتم حفظ بيانات الملف الشخصي بعد.";
  }

  // تعبئة حقول التعديل والإعدادات
  document.getElementById("user-name").value = state.profile.name;
  document.getElementById("user-dob").value = state.profile.dob;
  document.getElementById("user-weight").value = state.profile.weight;
  document.getElementById("user-height").value = state.profile.height;
  document.getElementById("user-gender").value = state.profile.gender;
  document.getElementById("user-role").value = state.profile.role;

  document.getElementById("card-style-select").value = state.settings.cardStyle;
  document.getElementById("accent-color-picker").value = state.settings.accent;
  document.getElementById("banter-tone-select").value = state.settings.banterTone;

  // الماء
  const goalMl = calcWaterGoalMl();
  const cupsTarget = Math.max(1, Math.round(goalMl / 250));
  const cupsDrunk = (state.waterMl / 250).toFixed(1).replace(/\.0$/, "");
  const pct = Math.min(100, Math.round((state.waterMl / goalMl) * 100));
  document.getElementById("water-goal-text").textContent =
    `الهدف اليومي: ${(goalMl / 1000).toFixed(2)} لتر (${goalMl} مل ≈ ${cupsTarget} أكواب) • المتناول: ${cupsDrunk} كوب`;
  document.getElementById("water-fill").style.width = `${pct}%`;
  document.getElementById("water-percent").textContent = `${pct}%`;

  // المزاج والإنجازات
  const moodBox = document.getElementById("mood-advice");
  if (state.mood === "stressed") {
    moodBox.textContent = "يبدو أنك تشعر بالتوتر أو الإرهاق اليوم؛ خفف الضغط، خذ نفساً عميقاً، وركز على مهمة واحدة أساسية.";
  } else if (state.mood === "travel") {
    moodBox.textContent = "وضع السفر والتنقل مفعل: تم اعتماد جداول مرنة وزيادة التذكير بشرب الماء.";
  } else {
    moodBox.textContent = "الحالة طبيعية ومنظمة؛ التقدم خطوة بخطوة يحقق الهدف بثبات.";
  }

  const achList = document.getElementById("daily-achievements");
  achList.innerHTML = "";
  const doneTasks = state.tasks.filter((t) => t.done).length;
  [
    `الماء اليوم: ${pct}% من الهدف`,
    `المهام المنجزة: ${doneTasks} من ${state.tasks.length}`,
    `المصروفات المسجلة: ${state.expenses.length} عملية`
  ].forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    achList.appendChild(li);
  });

  // المهام
  const tasksList = document.getElementById("tasks-list");
  tasksList.innerHTML = "";
  state.tasks.forEach((t, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span>${t.done ? "مكتملة: " : "قيد التنفيذ: "}<strong>${escapeHtml(t.title)}</strong> ${t.time ? `(${t.time})` : ""}</span>
      <div class="row-actions" style="margin-bottom:0;">
        <button class="btn-secondary" data-toggle-task="${idx}" type="button">${t.done ? "إلغاء الإنجاز" : "إتمام"}</button>
        <button class="btn-secondary" data-del-task="${idx}" type="button">حذف</button>
      </div>
    `;
    tasksList.appendChild(li);
  });

  // مؤقت الجلسة
  document.getElementById("study-timer-display").textContent = `الوقت المتبقي: ${formatClock(studyRemainingSec)}`;

  // التسجيلات الصوتية
  const clipsBox = document.getElementById("voice-clips-list");
  clipsBox.innerHTML = "";
  state.voiceClips.forEach((clip, idx) => {
    const div = document.createElement("div");
    div.className = "clip-item";
    div.innerHTML = `
      <span>تسجيل رقم ${idx + 1} (${clip.date})</span>
      <audio controls src="${clip.dataUrl}" style="max-width:170px;height:32px;"></audio>
    `;
    clipsBox.appendChild(div);
  });

  // التطبيقات المحظورة ووضع التركيز
  const blockedList = document.getElementById("blocked-apps-list");
  blockedList.innerHTML = "";
  state.blockedApps.forEach((appName, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <button class="btn-secondary" data-test-app="${escapeHtml(appName)}" type="button">تجربة فتح: ${escapeHtml(appName)}</button>
      <button class="btn-secondary" data-del-app="${idx}" type="button">حذف</button>
    `;
    blockedList.appendChild(li);
  });
  document.getElementById("toggle-focus-btn").textContent =
    state.focusActive ? "إيقاف وضع التركيز (مفعل حالياً)" : "تفعيل وضع التركيز";

  // المصاريف
  const expList = document.getElementById("expenses-list");
  expList.innerHTML = "";
  let total = 0;
  state.expenses.forEach((e) => {
    total += Number(e.cost) || 0;
    const li = document.createElement("li");
    li.innerHTML = `<span>${escapeHtml(e.item)}</span><strong>${e.cost}</strong>`;
    expList.appendChild(li);
  });
  document.getElementById("total-spent").textContent = `إجمالي المصروف: ${total}`;

  // أصدقاء الشاشة
  const petsList = document.getElementById("pets-list");
  petsList.innerHTML = "";
  state.pets.forEach((pet, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span>الرفيق: ${escapeHtml(pet)}</span>
      <button class="btn-secondary" data-del-pet="${idx}" type="button">حذف</button>
    `;
    petsList.appendChild(li);
  });

  // كبسولة الزمن
  const capList = document.getElementById("capsules-list");
  capList.innerHTML = "";
  const todayStr = new Date().toISOString().slice(0, 10);
  state.capsules.forEach((c) => {
    const unlocked = !c.date || c.date <= todayStr;
    const li = document.createElement("li");
    li.innerHTML = `<span>${unlocked ? escapeHtml(c.text) : `مقفلة حتى تاريخ ${c.date}`}</span>`;
    capList.appendChild(li);
  });
}

function showFocusBanter(appName) {
  const box = document.getElementById("focus-banter-box");
  if (!state.focusActive) {
    box.classList.remove("hidden");
    box.textContent = `وضع التركيز غير مفعل حالياً؛ يمكنك فتح "${appName}" أو تفعيل وضع التركيز أولاً.`;
    return;
  }
  const tone = state.settings.banterTone;
  let msg = `أنت من حدد وقت التركيز بإرادتك؛ ما الذي يدفعك لفتح "${appName}" الآن؟ عد إلى عملك بإصرار.`;
  if (tone === "hype") {
    msg = `أنت قادر على إتمام هدفك الآن! "${appName}" لن يفوتك، استمر بتركيز كامل حتى النهاية.`;
  } else if (tone === "calm") {
    msg = `هذا التطبيق مقيد خلال جلسة التركيز الحالية (${appName}). أكمل جلستك ثم خذ قسطاً من الراحة.`;
  }
  box.classList.remove("hidden");
  box.textContent = msg;
}

// مراقبة مواعيد المهام كل 20 ثانية وحماية القفل
setInterval(() => {
  enforceSecurityGuards();

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const currentHM = `${hh}:${mm}`;
  const dayKey = now.toISOString().slice(0, 10);

  state.tasks.forEach((t, idx) => {
    if (!t.done && t.time === currentHM) {
      const uniqueKey = `${dayKey}-${idx}-${t.time}`;
      if (!notifiedTasksToday.has(uniqueKey)) {
        notifiedTasksToday.add(uniqueKey);
        triggerTaskAlert(t.title);
      }
    }
  });
}, 20000);

// حفظ الإعداد الأولي لمرة واحدة
document.getElementById("ob-save-btn").addEventListener("click", () => {
  state.profile = {
    name: document.getElementById("ob-name").value.trim(),
    dob: document.getElementById("ob-dob").value,
    weight: Number(document.getElementById("ob-weight").value) || 70,
    height: Number(document.getElementById("ob-height").value) || 170,
    gender: document.getElementById("ob-gender").value,
    role: document.getElementById("ob-role").value,
    completed: true
  };
  saveState();
  renderAll();
});

document.getElementById("open-profile-edit-btn").addEventListener("click", () => {
  document.getElementById("profile-edit-panel").classList.toggle("hidden");
});

// التنقل بين الأقسام
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (state.settings.pin && !state.unlocked) {
      enforceSecurityGuards();
      return;
    }
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

document.getElementById("theme-toggle-btn").addEventListener("click", () => {
  state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
  saveState();
  renderAll();
});

document.getElementById("lock-btn").addEventListener("click", () => {
  if (!state.settings.pin) {
    alert("يرجى تعيين رمز PIN أولاً من تبويب الإعدادات.");
    return;
  }
  state.unlocked = false;
  saveState();
  renderAll();
});

document.getElementById("unlock-btn").addEventListener("click", () => {
  const val = document.getElementById("pin-input").value.trim();
  if (val === state.settings.pin) {
    state.unlocked = true;
    document.getElementById("pin-input").value = "";
    document.getElementById("lock-msg").textContent = "أدخل الرمز السري للمتابعة إلى التطبيق";
    saveState();
    renderAll();
  } else {
    document.getElementById("lock-msg").textContent = "رمز المرور غير صحيح، يرجى المحاولة مرة أخرى.";
  }
});

document.getElementById("save-profile-btn").addEventListener("click", () => {
  state.profile = {
    name: document.getElementById("user-name").value.trim(),
    dob: document.getElementById("user-dob").value,
    weight: Number(document.getElementById("user-weight").value) || 70,
    height: Number(document.getElementById("user-height").value) || 170,
    gender: document.getElementById("user-gender").value,
    role: document.getElementById("user-role").value,
    completed: true
  };
  document.getElementById("profile-edit-panel").classList.add("hidden");
  saveState();
  renderAll();
});

document.getElementById("add-cup-btn").addEventListener("click", () => {
  state.waterMl += 250;
  saveState();
  renderAll();
});

document.getElementById("reset-water-btn").addEventListener("click", () => {
  state.waterMl = 0;
  saveState();
  renderAll();
});

document.querySelectorAll(".mood-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.mood = btn.dataset.mood;
    saveState();
    renderAll();
  });
});

document.getElementById("add-task-btn").addEventListener("click", () => {
  const title = document.getElementById("task-title").value.trim();
  if (!title) return;
  state.tasks.push({
    title,
    time: document.getElementById("task-time").value,
    type: document.getElementById("task-type").value,
    done: false
  });
  document.getElementById("task-title").value = "";
  saveState();
  renderAll();
});

document.getElementById("enable-notify-btn").addEventListener("click", async () => {
  const statusEl = document.getElementById("notify-status");
  if (!("Notification" in window)) {
    statusEl.textContent = "إشعارات النظام غير متاحة في هذه البيئة؛ التنبيه الصوتي والمرئي الداخلي يعملان عند حلول الموعد.";
    return;
  }
  const perm = await Notification.requestPermission();
  statusEl.textContent = perm === "granted"
    ? "تم تفعيل التنبيهات بنجاح."
    : "لم يتم منح إذن الإشعارات؛ سيبقى التنبيه الداخلي والصوتي فعالاً.";
});

document.getElementById("test-alert-btn").addEventListener("click", () => {
  triggerTaskAlert("اختبار تنبيه المواعيد من منظم حياتي");
});

document.getElementById("tasks-list").addEventListener("click", (e) => {
  if (e.target.dataset.toggleTask !== undefined) {
    const idx = Number(e.target.dataset.toggleTask);
    state.tasks[idx].done = !state.tasks[idx].done;
    saveState();
    renderAll();
  } else if (e.target.dataset.delTask !== undefined) {
    const idx = Number(e.target.dataset.delTask);
    state.tasks.splice(idx, 1);
    saveState();
    renderAll();
  }
});

// مؤقت الدراسة
document.getElementById("start-study-timer-btn").addEventListener("click", () => {
  clearInterval(studyTimerInterval);
  const mins = Math.max(1, Number(document.getElementById("study-minutes-input").value) || 45);
  studyRemainingSec = mins * 60;
  renderAll();

  studyTimerInterval = setInterval(() => {
    studyRemainingSec -= 1;
    if (studyRemainingSec <= 0) {
      studyRemainingSec = 0;
      clearInterval(studyTimerInterval);
      triggerTaskAlert("انتهت جلسة الدراسة، يمكنك أخذ استراحة قصيرة.");
    }
    renderAll();
  }, 1000);
});

document.getElementById("stop-study-timer-btn").addEventListener("click", () => {
  clearInterval(studyTimerInterval);
  const mins = Math.max(1, Number(document.getElementById("study-minutes-input").value) || 45);
  studyRemainingSec = mins * 60;
  renderAll();
});

// التسجيل الصوتي وتحويل النص
document.getElementById("voice-record-btn").addEventListener("click", async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert("تسجيل الصوت غير متاح في هذه البيئة؛ يمكنك استخدام تحويل الكلام إلى نص أو إضافة المهمة كتابياً.");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (ev) => audioChunks.push(ev.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunks, { type: "audio/webm" });
      const reader = new FileReader();
      reader.onloadend = () => {
        state.voiceClips.push({ dataUrl: reader.result, date: new Date().toLocaleTimeString("ar") });
        saveState();
        renderAll();
      };
      reader.readAsDataURL(blob);
      stream.getTracks().forEach((tr) => tr.stop());
    };
    mediaRecorder.start();
  } catch {
    alert("تعذر الوصول إلى الميكروفون؛ يرجى التحقق من منح الإذن.");
  }
});

document.getElementById("voice-stop-btn").addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
});

document.getElementById("voice-transcribe-btn").addEventListener("click", () => {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    alert("ميزة تحويل الكلام إلى نص غير مدعومة هنا؛ يمكنك كتابة النص مباشرة في الخانة.");
    return;
  }
  const rec = new SpeechRec();
  rec.lang = "ar-SA";
  rec.onresult = (ev) => {
    const transcript = ev.results[0][0].transcript;
    const box = document.getElementById("voice-note-text");
    box.value = box.value ? `${box.value} ${transcript}` : transcript;
  };
  rec.start();
});

document.getElementById("save-voice-task-btn").addEventListener("click", () => {
  const txt = document.getElementById("voice-note-text").value.trim();
  if (!txt) return;
  state.tasks.push({ title: txt, time: "", type: "task", done: false });
  document.getElementById("voice-note-text").value = "";
  saveState();
  renderAll();
});

// حظر التطبيقات والتركيز
document.getElementById("add-blocked-app-btn").addEventListener("click", () => {
  const val = document.getElementById("blocked-app-input").value.trim();
  if (!val) return;
  state.blockedApps.push(val);
  document.getElementById("blocked-app-input").value = "";
  saveState();
  renderAll();
});

document.getElementById("blocked-apps-list").addEventListener("click", (e) => {
  if (e.target.dataset.testApp) {
    showFocusBanter(e.target.dataset.testApp);
  } else if (e.target.dataset.delApp !== undefined) {
    state.blockedApps.splice(Number(e.target.dataset.delApp), 1);
    saveState();
    renderAll();
  }
});

document.getElementById("toggle-focus-btn").addEventListener("click", () => {
  state.focusActive = !state.focusActive;
  saveState();
  renderAll();
});

document.getElementById("android-perm-guide-btn").addEventListener("click", () => {
  const box = document.getElementById("focus-banter-box");
  box.classList.remove("hidden");
  box.textContent =
    "لحظر التطبيقات المثبتة على أندرويد ومنع فتحها فعلياً وقراءة قائمة التطبيقات، يلزم إضافة طبقة أصلية (Java/Kotlin) داخل مشروع Android وتفعيل صلاحية الوصول إلى بيانات الاستخدام أو إمكانية الوصول في إعدادات الهاتف.";
});

// المالية
document.getElementById("calc-split-btn").addEventListener("click", () => {
  const amt = Number(document.getElementById("income-amount").value) || 0;
  const h = Number(document.getElementById("split-home").value) || 0;
  const p = Number(document.getElementById("split-personal").value) || 0;
  const s = Number(document.getElementById("split-savings").value) || 0;
  document.getElementById("split-result").textContent =
    `للبيت: ${((amt * h) / 100).toFixed(2)} • شخصي: ${((amt * p) / 100).toFixed(2)} • ادخار: ${((amt * s) / 100).toFixed(2)}`;
});

document.getElementById("add-expense-btn").addEventListener("click", () => {
  const item = document.getElementById("expense-item").value.trim();
  const cost = Number(document.getElementById("expense-cost").value);
  if (!item || !cost) return;
  state.expenses.push({ item, cost });
  document.getElementById("expense-item").value = "";
  document.getElementById("expense-cost").value = "";
  saveState();
  renderAll();
});

document.getElementById("clear-expenses-btn").addEventListener("click", () => {
  state.expenses = [];
  saveState();
  renderAll();
});

// أصدقاء الشاشة واللعبة وكبسولة الزمن
document.getElementById("add-pet-btn").addEventListener("click", () => {
  const pet = document.getElementById("pet-select").value;
  state.pets.push(pet);
  saveState();
  renderAll();
});

document.getElementById("pets-list").addEventListener("click", (e) => {
  if (e.target.dataset.delPet !== undefined) {
    state.pets.splice(Number(e.target.dataset.delPet), 1);
    saveState();
    renderAll();
  }
});

document.getElementById("pet-remind-btn").addEventListener("click", () => {
  const activePet = state.pets[0] || "رفيقك";
  const reminders = [
    `يذكرك ${activePet} بشرب كوب من الماء وتحريك الجسم قليلاً.`,
    `يذكرك ${activePet} بمراجعة المهام المتبقية لليوم وإنجازها في وقتها.`,
    `يذكرك ${activePet} بإراحة العينين وأخذ قسط قصير من الهدوء.`
  ];
  document.getElementById("pet-message").textContent =
    reminders[Math.floor(Math.random() * reminders.length)];
});

document.getElementById("start-game-btn").addEventListener("click", () => {
  clearInterval(gameTimer);
  gameScore = 0;
  gameTimeLeft = 10;
  const target = document.getElementById("game-target");
  const arena = document.getElementById("game-arena");
  target.classList.remove("hidden");

  function moveTarget() {
    const maxX = Math.max(10, arena.clientWidth - 85);
    const maxY = Math.max(10, arena.clientHeight - 40);
    target.style.left = `${Math.floor(Math.random() * maxX)}px`;
    target.style.top = `${Math.floor(Math.random() * maxY)}px`;
  }

  moveTarget();
  document.getElementById("game-score").textContent = `النقاط: ${gameScore} | الوقت: ${gameTimeLeft}s`;

  target.onclick = () => {
    gameScore += 1;
    moveTarget();
    document.getElementById("game-score").textContent = `النقاط: ${gameScore} | الوقت: ${gameTimeLeft}s`;
  };

  gameTimer = setInterval(() => {
    gameTimeLeft -= 1;
    document.getElementById("game-score").textContent = `النقاط: ${gameScore} | الوقت: ${gameTimeLeft}s`;
    if (gameTimeLeft <= 0) {
      clearInterval(gameTimer);
      target.classList.add("hidden");
    }
  }, 1000);
});

document.getElementById("save-capsule-btn").addEventListener("click", () => {
  const text = document.getElementById("capsule-text").value.trim();
  const date = document.getElementById("capsule-date").value;
  if (!text) return;
  state.capsules.push({ text, date });
  document.getElementById("capsule-text").value = "";
  saveState();
  renderAll();
});

// الإعدادات والنسخ الاحتياطي
document.getElementById("bg-image-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.settings.bgImage = reader.result;
    saveState();
    renderAll();
  };
  reader.readAsDataURL(file);
});

document.getElementById("clear-bg-btn").addEventListener("click", () => {
  state.settings.bgImage = "";
  saveState();
  renderAll();
});

document.getElementById("remove-pin-btn").addEventListener("click", () => {
  state.settings.pin = "";
  state.unlocked = true;
  saveState();
  renderAll();
});

document.getElementById("save-settings-btn").addEventListener("click", () => {
  state.settings.cardStyle = document.getElementById("card-style-select").value;
  state.settings.accent = document.getElementById("accent-color-picker").value;
  state.settings.banterTone = document.getElementById("banter-tone-select").value;
  const newPin = document.getElementById("new-pin-input").value.trim();
  if (newPin) {
    state.settings.pin = newPin;
    state.unlocked = false;
    document.getElementById("new-pin-input").value = "";
  }
  saveState();
  renderAll();
});

function applyImportedBackup(rawText) {
  const imported = JSON.parse(rawText);
  const base = cloneDefaultState();
  state = {
    ...base,
    ...imported,
    profile: { ...base.profile, ...(imported.profile || {}) },
    settings: { ...base.settings, ...(imported.settings || {}) },
    unlocked: true
  };
  saveState();
  renderAll();
}

document.getElementById("export-backup-btn").addEventListener("click", () => {
  document.getElementById("backup-json-box").value = JSON.stringify(state);
});

document.getElementById("import-text-backup-btn").addEventListener("click", () => {
  const raw = document.getElementById("backup-json-box").value.trim();
  if (!raw) return;
  try {
    applyImportedBackup(raw);
  } catch {
    alert("النص المدخل ليس نسخة احتياطية صالحة.");
  }
});

document.getElementById("import-backup-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      applyImportedBackup(reader.result);
    } catch {
      alert("ملف النسخة الاحتياطية غير صالح.");
    }
  };
  reader.readAsText(file);
});

renderAll();
