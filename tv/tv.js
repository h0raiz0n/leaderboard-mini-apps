/**
 * TV SMART DASHBOARD ENGINE
 * Антикафе «Атмосфера» — Visual World: Deep Navy / Broadcast HUD
 */

let ACTIVE_TABLES = {};
let WAKE_LOCK = null;

document.addEventListener("DOMContentLoaded", () => {
  initClock();
  initWakeLock();
  initFullscreenShortcut();
  initDataSource();
  
  // Регулярная перерисовка (каждые 500мс)
  setInterval(renderTables, 500);
});

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

// Защита от засыпания экрана
async function initWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      WAKE_LOCK = await navigator.wakeLock.request("screen");
    }
  } catch (err) {
    console.warn("WakeLock:", err.message);
  }
}

// Горячие клавиши (F / Enter = Fullscreen)
function initFullscreenShortcut() {
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
      console.log("⚡ Успешно подключено к Firebase Realtime DB (europe-west1)");
      return;
    } catch (err) {
      console.warn("Ошибка подключения к Firebase, переключение на локальный fallback:", err);
    }
  }

  // Fallback на LocalStorage для локальной разработки / оффлайна
  window.addEventListener("storage", (e) => {
      if (e.key === "atmosphere_tables") {
        ACTIVE_TABLES = JSON.parse(e.newValue || "{}");
        renderTables();
      }
    });
    
    const saved = localStorage.getItem("atmosphere_tables");
    if (saved) {
      ACTIVE_TABLES = JSON.parse(saved);
    } else {
      // Начальное демо-состояние с именами ведущих
      ACTIVE_TABLES = {
        dealer_vlad: {
          id: "dealer_vlad",
          dealerName: "Влад",
          format: "SnG",
          status: "running",
          levelIndex: 1, // Раунд 2 (50/100)
          startedAt: Date.now() - 180000,
          durationSec: 420,
          elapsedBeforePause: 0
        },
        dealer_arina: {
          id: "dealer_arina",
          dealerName: "Арина",
          format: "SnG",
          status: "running",
          levelIndex: 4, // Раунд 5 (150/300, алерт < 45 сек)
          startedAt: Date.now() - 390000,
          durationSec: 420,
          elapsedBeforePause: 0
        }
      };
      localStorage.setItem("atmosphere_tables", JSON.stringify(ACTIVE_TABLES));
    }
  }
}

// Расчёт времени стола
function calculateTableTime(table) {
  const now = Date.now();
  let elapsed = table.elapsedBeforePause || 0;
  
  if (table.status === "running" && table.startedAt) {
    elapsed += Math.floor((now - table.startedAt) / 1000);
  }
  
  const remaining = Math.max(0, table.durationSec - elapsed);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  
  const isAlert = table.status === "running" && remaining <= 45 && remaining > 0;
  
  return {
    remaining,
    minutes,
    seconds,
    formatted: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
    isAlert
  };
}

// Отрисовка сетки столов
function renderTables() {
  const viewport = document.getElementById("tv-viewport");
  if (!viewport) return;
  
  const tableKeys = Object.keys(ACTIVE_TABLES).filter(k => ACTIVE_TABLES[k] && (ACTIVE_TABLES[k].status !== "idle" || ACTIVE_TABLES[k].isPostGameBreak));
  const count = tableKeys.length;
  
  viewport.dataset.tables = count === 0 ? "1" : String(Math.min(4, count));
  
  if (count === 0) {
    viewport.innerHTML = `
      <div class="lounge-container">
        <div class="lounge-brand">АТМОСФЕРА</div>
        <div class="lounge-status">Ожидание запуска турниров</div>
      </div>
    `;
    return;
  }
  
  let html = "";
  tableKeys.slice(0, 4).forEach(key => {
    const table = ACTIVE_TABLES[key];
    const time = calculateTableTime(table);
    
    const structure = POKER_CONFIG.SNG_STRUCTURE.levels;
    const currentLevel = structure[table.levelIndex] || structure[0];
    const nextLevel = structure[table.levelIndex + 1] || null;
    
    // Состояние перерыва после игры (10 мин отсчет)
    if (table.isPostGameBreak) {
      const breakRemaining = Math.max(0, Math.floor((table.nextGameAt - Date.now()) / 1000));
      const bMin = Math.floor(breakRemaining / 60);
      const bSec = breakRemaining % 60;
      const bFormatted = `${String(bMin).padStart(2, "0")}:${String(bSec).padStart(2, "0")}`;
      
      html += `
        <div class="table-card break-screen-card">
          <div class="break-screen-title">Игра завершена</div>
          <div class="break-screen-dealer">Стол ведущего ${table.dealerName}</div>
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
    
    let subtext = "Идёт раунд";
    if (table.status === "paused") subtext = "Пауза";
    else if (currentLevel.isBreak) subtext = "Размен фишек $25 / $50";
    else if (time.isAlert) subtext = "Смена блайндов через 45 сек";
    
    html += `
      <div class="${cardClass}" id="card-${table.id}">
        <!-- Шапка стола -->
        <div class="card-top">
          <div class="dealer-identity">
            <span class="dealer-label">Стол ведущего</span>
            <span class="dealer-name">${table.dealerName}</span>
          </div>
          <div class="round-pill">
            ${currentLevel.isBreak ? "ПЕРЕРЫВ" : `РАУНД ${currentLevel.level}`}
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
            <span class="blinds-number">${currentLevel.label}</span>
          </div>
          <div class="blinds-item">
            <span class="blinds-caption">Следующие</span>
            <span class="blinds-number upcoming">${nextLevel ? nextLevel.label : "ФИНАЛ"}</span>
          </div>
        </div>
      </div>
    `;
  });
  
  viewport.innerHTML = html;
}
