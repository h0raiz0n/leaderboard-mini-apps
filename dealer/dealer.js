/**
 * DEALER CONTROLLER LOGIC (Telegram Mini App)
 * Антикафе «Атмосфера» — Direct-to-Firebase Realtime Architecture
 */

let DEALER_NAME = "Ведущий";
let DEALER_ID = "dealer_vlad";
let SELECTED_FORMAT = "SnG";
let SELECTED_STRUCT = "SNG_STANDARD";
let TABLES_STATE = {};

if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("DOMContentLoaded", () => {
    initDealerIdentity();
    initPillSelectors();
    initButtonListeners();
    initDataSource();
    
    // Тикер обновления интерфейса пульта каждые 250 мс
    setInterval(renderDealerView, 250);
  });
}

// Инициализация имени ведущего из Telegram WebApp
function initDealerIdentity() {
  if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    try {
      tg.ready();
      tg.expand();
    } catch (e) {}
    
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
      const u = tg.initDataUnsafe.user;
      DEALER_NAME = u.first_name || u.username || "Ведущий";
    }
  }
  
  // Ключ стола в Firebase (латиница + кириллица)
  DEALER_ID = "dealer_" + String(DEALER_NAME).toLowerCase().replace(/[^a-zа-я0-9]/gi, "_");
  
  const badgeEl = document.getElementById("dealer-badge");
  const nameEl = document.getElementById("identity-name");
  if (badgeEl) badgeEl.textContent = DEALER_NAME;
  if (nameEl) nameEl.textContent = DEALER_NAME;
}

function triggerHaptic(type = "light") {
  if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
    try {
      if (type === "medium") window.Telegram.WebApp.HapticFeedback.impactOccurred("medium");
      else if (type === "heavy") window.Telegram.WebApp.HapticFeedback.impactOccurred("heavy");
      else if (type === "success") window.Telegram.WebApp.HapticFeedback.notificationOccurred("success");
      else window.Telegram.WebApp.HapticFeedback.impactOccurred("light");
    } catch (e) {}
  }
}

// Инициализация селекторов формата и структуры
function initPillSelectors() {
  const formatPills = document.querySelectorAll("#format-pills .pill");
  formatPills.forEach(pill => {
    pill.addEventListener("click", () => {
      formatPills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      SELECTED_FORMAT = pill.dataset.format;
      triggerHaptic("light");
    });
  });

  const structPills = document.querySelectorAll("#struct-pills .pill");
  structPills.forEach(pill => {
    pill.addEventListener("click", () => {
      structPills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      SELECTED_STRUCT = pill.dataset.struct;
      triggerHaptic("light");
    });
  });
}

function initButtonListeners() {
  document.getElementById("btn-start")?.addEventListener("click", startTable);
  document.getElementById("btn-pause")?.addEventListener("click", togglePause);
  document.getElementById("btn-step")?.addEventListener("click", nextLevel);
  document.getElementById("btn-reset")?.addEventListener("click", resetTable);
  document.getElementById("btn-finish")?.addEventListener("click", finishGame);
}

// Подключение к Firebase Realtime Database
function initDataSource() {
  if (typeof firebase !== "undefined") {
    try {
      if (firebase.apps.length === 0) {
        firebase.initializeApp({
          databaseURL: "https://atmosphere-poker-default-rtdb.europe-west1.firebasedatabase.app"
        });
      }
      const db = firebase.database();
      db.ref("atmosphere/tables").on("value", (snapshot) => {
        TABLES_STATE = snapshot.val() || {};
        renderDealerView();
      });
      console.log("⚡ Пульт подключен к Firebase Realtime DB (europe-west1)");
      return;
    } catch (err) {
      console.warn("Ошибка Firebase, переключение на локальный fallback:", err);
    }
  }

  // Fallback для оффлайн разработки
  window.addEventListener("storage", (e) => {
    if (e.key === "atmosphere_tables") {
      TABLES_STATE = JSON.parse(e.newValue || "{}");
      renderDealerView();
    }
  });
  const saved = localStorage.getItem("atmosphere_tables");
  if (saved) TABLES_STATE = JSON.parse(saved);
}

function saveState() {
  if (typeof firebase !== "undefined" && firebase.apps.length > 0) {
    firebase.database().ref("atmosphere/tables").set(TABLES_STATE);
  } else {
    localStorage.setItem("atmosphere_tables", JSON.stringify(TABLES_STATE));
  }
}

function getMyTable() {
  if (!TABLES_STATE[DEALER_ID]) {
    TABLES_STATE[DEALER_ID] = {
      id: DEALER_ID,
      dealerName: DEALER_NAME,
      format: SELECTED_FORMAT,
      structKey: SELECTED_STRUCT,
      status: "idle",
      levelIndex: 0,
      durationSec: 420,
      elapsedBeforePause: 0,
      isPostGameBreak: false
    };
  }
  return TABLES_STATE[DEALER_ID];
}

function getActiveStructure(structKey) {
  const cfg = (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG.BLIND_STRUCTURES)
    ? POKER_CONFIG.BLIND_STRUCTURES
    : {
        SNG_STANDARD: {
          name: "5 000 стек / 7 мин (Стандарт)",
          stack: 5000,
          levels: (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG.SNG_STRUCTURE) ? POKER_CONFIG.SNG_STRUCTURE.levels : []
        },
        SNG_TURBO: {
          name: "5 000 стек / 5 мин (Турбо)",
          stack: 5000,
          levels: [
            { level: 1, sb: 25, bb: 50, ante: 0, durationSec: 300, label: "25 / 50" },
            { level: 2, sb: 50, bb: 100, ante: 0, durationSec: 300, label: "50 / 100" },
            { level: 3, sb: 75, bb: 150, ante: 0, durationSec: 300, label: "75 / 150" },
            { level: 4, sb: 100, bb: 200, ante: 0, durationSec: 300, label: "100 / 200" },
            { level: 5, sb: 150, bb: 300, ante: 300, durationSec: 300, label: "150 / 300 (BBA 300)" },
            { level: 6, sb: 200, bb: 400, ante: 400, durationSec: 300, label: "200 / 400 (BBA 400)" },
            { level: 7, sb: 300, bb: 600, ante: 600, durationSec: 300, label: "300 / 600 (BBA 600)" },
            { level: 8, sb: 500, bb: 1000, ante: 1000, durationSec: 300, label: "500 / 1000 (BBA 1000)" }
          ]
        }
      };

  return cfg[structKey] || cfg.SNG_STANDARD;
}

// 1. Старт игры
function startTable() {
  triggerHaptic("heavy");
  const table = getMyTable();
  const structure = getActiveStructure(SELECTED_STRUCT);

  table.dealerName = DEALER_NAME;
  table.format = SELECTED_FORMAT;
  table.structKey = SELECTED_STRUCT;
  table.status = "running";
  table.levelIndex = 0;
  table.startedAt = Date.now();
  table.durationSec = structure.levels[0].durationSec;
  table.elapsedBeforePause = 0;
  table.isPostGameBreak = false;
  table.createdAt = Date.now();

  saveState();
  renderDealerView();
}

// 2. Пауза / Возобновление
function togglePause() {
  triggerHaptic("medium");
  const table = getMyTable();
  if (table.status === "running") {
    const now = Date.now();
    table.status = "paused";
    table.elapsedBeforePause = (table.elapsedBeforePause || 0) + Math.floor((now - table.startedAt) / 1000);
    table.startedAt = null;
  } else if (table.status === "paused") {
    table.status = "running";
    table.startedAt = Date.now();
  }
  saveState();
  renderDealerView();
}

// 3. Следующий раунд
function nextLevel() {
  triggerHaptic("medium");
  const table = getMyTable();
  const structure = getActiveStructure(table.structKey || SELECTED_STRUCT);
  
  if (table.levelIndex < structure.levels.length - 1) {
    table.levelIndex += 1;
    table.durationSec = structure.levels[table.levelIndex].durationSec;
    table.elapsedBeforePause = 0;
    table.startedAt = Date.now();
    saveState();
    renderDealerView();
  }
}

// 4. Сброс запуска (ошибка)
function resetTable() {
  triggerHaptic("heavy");
  const table = getMyTable();
  table.status = "idle";
  table.levelIndex = 0;
  table.startedAt = null;
  table.elapsedBeforePause = 0;
  saveState();
  renderDealerView();
}

// 5. Завершение игры
function finishGame() {
  triggerHaptic("success");
  const table = getMyTable();
  table.isPostGameBreak = true;
  table.nextGameAt = Date.now() + 10 * 60 * 1000; // 10 мин на ТВ
  table.status = "idle";
  table.startedAt = null;
  table.elapsedBeforePause = 0;
  saveState();

  openFinishModal(table);
}

// Генерация предзаполненной Google Form
function generatePreFilledFormUrl() {
  const today = new Date().toISOString().split("T")[0];
  const baseUrl = "https://docs.google.com/forms/d/e/1FAIpQLSfCfnN2LS4mAmbQfPtBLZGxPoiYfSqNoaX5xLrmyBr3S5FiEg/viewform";
  
  return baseUrl + "?usp=pp_url&entry.1615126251=" + encodeURIComponent(today) +
    "&entry.1887911518=" + encodeURIComponent(DEALER_NAME);
}

function openFinishModal() {
  const modal = document.getElementById("finish-modal");
  const formBtn = document.getElementById("open-form-btn");
  
  const url = generatePreFilledFormUrl();
  formBtn.onclick = () => {
    window.open(url, "_blank");
    modal.style.display = "none";
  };
  
  modal.style.display = "flex";
}

function closeFinishModal() {
  document.getElementById("finish-modal").style.display = "none";
  renderDealerView();
}

// Отрисовка состояния пульта
function renderDealerView() {
  const table = getMyTable();
  const struct = getActiveStructure(table.structKey || SELECTED_STRUCT);
  const levels = struct.levels;
  const currentLvl = levels[table.levelIndex || 0] || levels[0];
  const nextLvl = levels[(table.levelIndex || 0) + 1] || null;

  const roundEl = document.getElementById("identity-round");
  const blindsValEl = document.getElementById("blinds-current");
  const nextBlindsValEl = document.getElementById("blinds-next");
  const digitsEl = document.getElementById("timer-digits");
  const statusEl = document.getElementById("timer-status");
  const setupPanel = document.getElementById("setup-panel");
  const startBtn = document.getElementById("btn-start");
  const runningRow = document.getElementById("running-btn-row");
  const pauseBtn = document.getElementById("btn-pause");
  const resetBtn = document.getElementById("btn-reset");
  const finishBtn = document.getElementById("btn-finish");

  if (roundEl) roundEl.textContent = currentLvl.isBreak ? "ПЕРЕРЫВ" : `РАУНД ${currentLvl.level}`;
  if (blindsValEl) blindsValEl.textContent = currentLvl.label;
  if (nextBlindsValEl) nextBlindsValEl.textContent = nextLvl ? nextLvl.label : "ФИНАЛ";

  // Расчет времени
  let remaining = currentLvl.durationSec;
  let totalElapsed = table.elapsedBeforePause || 0;
  if (table.status === "running" && table.startedAt) {
    const elapsedNow = Math.floor((Date.now() - table.startedAt) / 1000);
    totalElapsed += elapsedNow;
    remaining = Math.max(0, table.durationSec - totalElapsed);
  } else if (table.status === "paused") {
    remaining = Math.max(0, table.durationSec - (table.elapsedBeforePause || 0));
  }

  const min = Math.floor(remaining / 60);
  const sec = remaining % 60;
  if (digitsEl) digitsEl.textContent = `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;

  if (table.status === "running") {
    if (setupPanel) setupPanel.style.display = "none";
    if (statusEl) statusEl.textContent = "🟢 Идёт игра";
    if (startBtn) startBtn.style.display = "none";
    if (runningRow) runningRow.style.display = "grid";
    if (pauseBtn) pauseBtn.textContent = "⏸ Пауза";
    if (finishBtn) finishBtn.style.display = "flex";

    // Кнопка сброса (первые 3 минуты 1 раунда)
    if (resetBtn) {
      resetBtn.style.display = (table.levelIndex === 0 && totalElapsed <= 180) ? "flex" : "none";
    }
  } else if (table.status === "paused") {
    if (setupPanel) setupPanel.style.display = "none";
    if (statusEl) statusEl.textContent = "⏸ На паузе";
    if (startBtn) startBtn.style.display = "none";
    if (runningRow) runningRow.style.display = "grid";
    if (pauseBtn) pauseBtn.textContent = "▶️ Продолжить";
    if (finishBtn) finishBtn.style.display = "flex";

    if (resetBtn) {
      resetBtn.style.display = (table.levelIndex === 0 && totalElapsed <= 180) ? "flex" : "none";
    }
  } else {
    // idle
    if (setupPanel) setupPanel.style.display = "flex";
    if (statusEl) statusEl.textContent = "Стол ожидает старта";
    if (startBtn) startBtn.style.display = "flex";
    if (runningRow) runningRow.style.display = "none";
    if (resetBtn) resetBtn.style.display = "none";
    if (finishBtn) finishBtn.style.display = "none";
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    initDealerIdentity,
    getMyTable,
    startTable,
    togglePause,
    nextLevel,
    resetTable,
    finishGame,
    generatePreFilledFormUrl,
    getActiveStructure
  };
}
