/**
 * TV SMART DASHBOARD ENGINE
 * Антикафе «Атмосфера» — Visual World: Deep Navy / Broadcast HUD
 */

let ACTIVE_TABLES = {};
let WAKE_LOCK = null;

if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("DOMContentLoaded", () => {
    initClock();
    initWakeLock();
    initFullscreenShortcut();
    initDataSource();
    
    // Регулярная перерисовка каждые 250 мс
    setInterval(renderTables, 250);
  });
}

// Часы в шапке
function initClock() {
  const clockEl = document.getElementById("header-clock");
  if (!clockEl) return;
  const update = () => {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };
  update();
  setInterval(update, 1000);
}

// Защита от засыпания экрана (Samsung Smart TV)
async function initWakeLock() {
  try {
    if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
      WAKE_LOCK = await navigator.wakeLock.request("screen");
    }
  } catch (err) {
    console.warn("WakeLock:", err.message);
  }
}

// Горячие клавиши (F / Enter = Fullscreen)
function initFullscreenShortcut() {
  if (typeof document === "undefined") return;
  document.addEventListener("keydown", (e) => {
    if (e.key === "f" || e.key === "F" || e.key === "Enter") {
      toggleFullscreen();
    }
  });
  
  const header = document.querySelector(".tv-header");
  if (header) {
    header.addEventListener("dblclick", toggleFullscreen);
  }
}

function toggleFullscreen() {
  if (typeof document === "undefined") return;
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => console.log(err));
  } else {
    document.exitFullscreen().catch(err => console.log(err));
  }
}

// Источник данных (Firebase + LocalStorage fallback)
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
        ACTIVE_TABLES = snapshot.val() || {};
        renderTables();
      });
      console.log("⚡ ТВ подключен к Firebase Realtime DB (europe-west1)");
      return;
    } catch (err) {
      console.warn("Ошибка подключения к Firebase, переключение на локальный fallback:", err);
    }
  }

  // Fallback на LocalStorage для локальной разработки / оффлайна
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key === "atmosphere_tables") {
        ACTIVE_TABLES = JSON.parse(e.newValue || "{}");
        renderTables();
      }
    });
    
    const saved = localStorage.getItem("atmosphere_tables");
    if (saved) {
      ACTIVE_TABLES = JSON.parse(saved);
    }
  }
}

// Определение структуры уровней стола
function getTableStructure(table) {
  const cfg = (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG.BLIND_STRUCTURES)
    ? POKER_CONFIG.BLIND_STRUCTURES
    : {};

  if (table && table.structKey && cfg[table.structKey]) {
    return cfg[table.structKey].levels;
  }

  if (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG.SNG_STRUCTURE) {
    return POKER_CONFIG.SNG_STRUCTURE.levels;
  }

  return [
    { level: 1, sb: 25, bb: 50, ante: 0, durationSec: 420, label: "25 / 50" },
    { level: 2, sb: 50, bb: 100, ante: 0, durationSec: 420, label: "50 / 100" }
  ];
}

// Расчёт времени стола (с поддержкой алерта 30с и овертайма финала)
function calculateTableTime(table, isFinalLevel = false) {
  const now = Date.now();
  let elapsed = table.elapsedBeforePause || 0;
  
  if (table.status === "running" && table.startedAt) {
    elapsed += Math.floor((now - table.startedAt) / 1000);
  }
  
  const duration = table.durationSec || 420;
  const isOvertime = isFinalLevel && (elapsed >= duration) && (table.status === "running");
  
  let remaining = 0;
  let minutes = 0;
  let seconds = 0;
  let formatted = "00:00";
  let isAlert = false;
  
  if (isOvertime) {
    const overtimeSec = elapsed - duration;
    minutes = Math.floor(overtimeSec / 60);
    seconds = overtimeSec % 60;
    formatted = `+${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  } else {
    remaining = Math.max(0, duration - elapsed);
    minutes = Math.floor(remaining / 60);
    seconds = remaining % 60;
    formatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    // Предупреждающий алерт за 30 секунд (вместо 45)
    isAlert = table.status === "running" && remaining <= 30 && remaining > 0;
  }
  
  return {
    remaining,
    minutes,
    seconds,
    isOvertime,
    formatted,
    isAlert
  };
}

function getFormatLabel(formatKey) {
  if (formatKey === "Data" || formatKey === "SnG") return "SnG";
  if (formatKey === "Mystery" || formatKey === "Mystery Bounty") return "Mystery";
  if (formatKey === "MTT") return "MTT";
  return formatKey || "SnG";
}

// Отрисовка сетки столов
function renderTables() {
  if (typeof document === "undefined") return;
  const viewport = document.getElementById("tv-viewport");
  if (!viewport) return;
  
  const tableKeys = Object.keys(ACTIVE_TABLES).filter(k => {
    const t = ACTIVE_TABLES[k];
    if (!t) return false;
    if (t.status === "running" || t.status === "paused") return true;
    if (t.isBreakActive && t.breakEndsAt && (t.breakEndsAt > Date.now())) return true;
    if (t.isPostGameBreak && t.nextGameAt && (t.nextGameAt > Date.now())) return true;
    return false;
  });

  const count = tableKeys.length;
  viewport.dataset.tables = count === 0 ? "1" : String(Math.min(4, count));
  
  if (count === 0) {
    viewport.innerHTML = `
      <div class="lounge-container">
        <div class="lounge-brand">АТМОСФЕРА</div>
        <div class="lounge-status">Покерный клуб • Ожидание запуска столов</div>
      </div>
    `;
    return;
  }
  
  let html = "";
  tableKeys.slice(0, 4).forEach(key => {
    const table = ACTIVE_TABLES[key];
    const structure = getTableStructure(table);
    const isFinalLevel = (table.levelIndex >= structure.length - 1);
    const time = calculateTableTime(table, isFinalLevel);
    const currentLevel = structure[table.levelIndex] || structure[0];
    const nextLevel = structure[table.levelIndex + 1] || null;
    const formatLabel = getFormatLabel(table.format);
    
    // Состояние перерыва (ручного или послеигрового)
    const breakEndTime = (table.isBreakActive && table.breakEndsAt) ? table.breakEndsAt : (table.isPostGameBreak ? table.nextGameAt : null);
    if (breakEndTime && breakEndTime > Date.now()) {
      const breakRemaining = Math.max(0, Math.floor((breakEndTime - Date.now()) / 1000));
      const bMin = Math.floor(breakRemaining / 60);
      const bSec = breakRemaining % 60;
      const bFormatted = `${String(bMin).padStart(2, "0")}:${String(bSec).padStart(2, "0")}`;
      
      html += `
        <div class="table-card break-screen-card">
          <div class="break-screen-title">☕ ПЕРЕРЫВ</div>
          <div class="break-screen-dealer">Стол ведущего ${table.dealerName || "Ведущий"} (${formatLabel})</div>
          <div class="break-screen-digits">${bFormatted}</div>
          <div style="font-size: 15px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em;">До старта следующей игры</div>
        </div>
      `;
      return;
    }
    
    // Классы состояний
    let cardClass = "table-card";
    if (time.isAlert) cardClass += " state-alert";
    if (currentLevel.isBreak) cardClass += " state-break";
    if (table.status === "paused") cardClass += " state-paused";
    if (time.isOvertime) cardClass += " state-final-round";
    
    let subtext = "Идёт раунд";
    if (table.status === "paused") subtext = "Пауза";
    else if (time.isOvertime) subtext = "Финальный раунд • Блайнды зафиксированы";
    else if (currentLevel.isBreak) subtext = "Размен фишек $25 / $50";
    else if (time.isAlert) subtext = "Смена блайндов через 30 сек";
    else if (isFinalLevel) subtext = "Финальный раунд турнира";
    
    html += `
      <div class="${cardClass}" id="card-${table.id}">
        <!-- Шапка стола -->
        <div class="card-top">
          <div class="dealer-identity">
            <span class="dealer-label">Стол ведущего</span>
            <span class="dealer-name">${table.dealerName || "Ведущий"}</span>
          </div>
          <div class="pill-group">
            <span class="format-badge">${formatLabel}</span>
            <div class="round-pill">
              ${currentLevel.isBreak ? "ПЕРЕРЫВ" : `РАУНД ${currentLevel.level}`}
            </div>
          </div>
        </div>
        
        <!-- Центральный таймер -->
        <div class="timer-block">
          <div class="timer-digits">${time.formatted}</div>
          <div class="timer-subtext">${subtext}</div>
        </div>
        
        <!-- Блайнды -->
        <div class="blinds-grid">
          <div class="blinds-item">
            <span class="blinds-caption">Текущие блайнды</span>
            <div class="blinds-main-row">
              <span class="blinds-number current">${currentLevel.sb} / ${currentLevel.bb}</span>
              ${currentLevel.ante > 0 ? `<span class="ante-badge">АНТЕ ${currentLevel.ante}</span>` : ""}
            </div>
          </div>
          <div class="blinds-item">
            <span class="blinds-caption">Следующие</span>
            <span class="blinds-number upcoming">
              ${nextLevel ? `${nextLevel.sb} / ${nextLevel.bb}${nextLevel.ante > 0 ? ` (АНТЕ ${nextLevel.ante})` : ""}` : "ФИНАЛ"}
            </span>
          </div>
        </div>
      </div>
    `;
  });
  
  viewport.innerHTML = html;
}

function setActiveTables(tables) {
  ACTIVE_TABLES = tables || {};
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    setActiveTables,
    calculateTableTime,
    getTableStructure,
    getFormatLabel,
    renderTables
  };
}
