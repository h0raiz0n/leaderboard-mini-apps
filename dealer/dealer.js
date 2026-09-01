/**
 * DEALER CONTROLLER LOGIC (Telegram Mini App)
 * Антикафе «Атмосфера» — Dealer-First Architecture
 */

let DEALER_NAME = "Ведущий";
let DEALER_ID = "dealer_default";
let TABLES_STATE = {};

document.addEventListener("DOMContentLoaded", () => {
  initDealerIdentity();
  initDataSource();
  
  // Тикер обновления интерфейса пульта
  setInterval(renderDealerView, 500);
});

// Инициализация имени ведущего из Telegram
function initDealerIdentity() {
  if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.expand();
    
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
      const u = tg.initDataUnsafe.user;
      DEALER_NAME = u.first_name || u.username || "Ведущий";
    }
  }
  
  // Транслитерация / санитизация для ключа
  DEALER_ID = "dealer_" + encodeURIComponent(DEALER_NAME.toLowerCase().replace(/\s+/g, "_"));
  
  const badgeEl = document.getElementById("dealer-badge");
  const nameEl = document.getElementById("identity-name");
  if (badgeEl) badgeEl.textContent = DEALER_NAME;
  if (nameEl) nameEl.textContent = DEALER_NAME;
}

// Источник данных
function initDataSource() {
  if (typeof firebase !== "undefined" && firebase.apps.length > 0) {
    const db = firebase.database();
    db.ref("atmosphere/tables").on("value", (snapshot) => {
      TABLES_STATE = snapshot.val() || {};
      renderDealerView();
    });
  } else {
    window.addEventListener("storage", (e) => {
      if (e.key === "atmosphere_tables") {
        TABLES_STATE = JSON.parse(e.newValue || "{}");
        renderDealerView();
      }
    });
    
    const saved = localStorage.getItem("atmosphere_tables");
    if (saved) {
      TABLES_STATE = JSON.parse(saved);
    }
  }
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
      format: "SnG",
      status: "idle",
      levelIndex: 0,
      durationSec: 420,
      elapsedBeforePause: 0
    };
  }
  return TABLES_STATE[DEALER_ID];
}

// Управление столом ведущего
function startTable() {
  const table = getMyTable();
  table.dealerName = DEALER_NAME;
  table.status = "running";
  table.startedAt = Date.now();
  table.durationSec = POKER_CONFIG.SNG_STRUCTURE.levels[table.levelIndex || 0].durationSec;
  table.elapsedBeforePause = 0;
  table.isPostGameBreak = false;
  
  saveState();
  renderDealerView();
}

function pauseTable() {
  const table = getMyTable();
  if (table.status !== "running") return;
  
  const now = Date.now();
  table.status = "paused";
  table.elapsedBeforePause = (table.elapsedBeforePause || 0) + Math.floor((now - table.startedAt) / 1000);
  table.startedAt = null;
  
  saveState();
  renderDealerView();
}

function resumeTable() {
  const table = getMyTable();
  if (table.status !== "paused") return;
  
  table.status = "running";
  table.startedAt = Date.now();
  
  saveState();
  renderDealerView();
}

function nextLevel() {
  const table = getMyTable();
  const structure = POKER_CONFIG.SNG_STRUCTURE.levels;
  if (table.levelIndex < structure.length - 1) {
    table.levelIndex += 1;
    table.durationSec = structure[table.levelIndex].durationSec;
    table.elapsedBeforePause = 0;
    table.startedAt = Date.now();
    saveState();
    renderDealerView();
  }
}

function finishGame() {
  const table = getMyTable();
  table.isPostGameBreak = true;
  table.nextGameAt = Date.now() + 10 * 60 * 1000;
  table.status = "idle";
  saveState();
  
  openFinishModal(table);
}

// Генерация предзаполненной Google Form
function generatePreFilledFormUrl() {
  const today = new Date().toISOString().split("T")[0];
  const baseUrl = POKER_CONFIG.FORMS.SNG.viewUrl;
  const params = new URLSearchParams({
    "usp": "pp_url",
    "entry.date": today,
    "entry.dealer": DEALER_NAME
  });
  return `${baseUrl}?${params.toString()}`;
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
}

// Отрисовка
function renderDealerView() {
  const table = getMyTable();
  const structure = POKER_CONFIG.SNG_STRUCTURE.levels;
  const currentLevel = structure[table.levelIndex || 0] || structure[0];
  const nextLevelItem = structure[(table.levelIndex || 0) + 1] || null;
  
  const roundEl = document.getElementById("identity-round");
  const blindsValEl = document.getElementById("blinds-current");
  const nextBlindsValEl = document.getElementById("blinds-next");
  const digitsEl = document.getElementById("timer-digits");
  const statusEl = document.getElementById("timer-status");
  const startBtn = document.getElementById("btn-start");
  const pauseBtn = document.getElementById("btn-pause");
  
  if (roundEl) roundEl.textContent = currentLevel.isBreak ? "ПЕРЕРЫВ" : `РАУНД ${currentLevel.level}`;
  if (blindsValEl) blindsValEl.textContent = currentLevel.label;
  if (nextBlindsValEl) nextBlindsValEl.textContent = nextLevelItem ? nextLevelItem.label : "ФИНАЛ";
  
  // Расчет времени
  let remaining = currentLevel.durationSec;
  if (table.status === "running" && table.startedAt) {
    const elapsed = (table.elapsedBeforePause || 0) + Math.floor((Date.now() - table.startedAt) / 1000);
    remaining = Math.max(0, table.durationSec - elapsed);
  } else if (table.status === "paused") {
    remaining = Math.max(0, table.durationSec - (table.elapsedBeforePause || 0));
  }
  
  const min = Math.floor(remaining / 60);
  const sec = remaining % 60;
  if (digitsEl) digitsEl.textContent = `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  
  if (table.status === "running") {
    statusEl.textContent = "Идёт игра";
    startBtn.style.display = "none";
    pauseBtn.style.display = "flex";
    pauseBtn.textContent = "Пауза";
    pauseBtn.onclick = pauseTable;
  } else if (table.status === "paused") {
    statusEl.textContent = "На паузе";
    startBtn.style.display = "none";
    pauseBtn.style.display = "flex";
    pauseBtn.textContent = "Продолжить";
    pauseBtn.onclick = resumeTable;
  } else {
    statusEl.textContent = "Стол ожидает старта";
    startBtn.style.display = "flex";
    startBtn.textContent = "Старт игры";
    startBtn.onclick = startTable;
    pauseBtn.style.display = "none";
  }
}
