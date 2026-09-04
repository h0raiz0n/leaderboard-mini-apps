/**
 * TV SMART DASHBOARD ENGINE
 * Антикафе «Атмосфера» — Visual World: Deep Navy / Broadcast HUD
 * 
 * Включает:
 * 1. DOM-Patching (нулевая нагрузка на процессор Smart TV при непрерывной работе).
 * 2. Web Audio API 5-секундный процедурный отсчет (5..4..3..2..1) и турнирный гонг.
 * 3. Авторазблокировка звука (AudioContext Unlock Guard).
 * 4. МТТ средний стек в Больших Блайндах (BB).
 * 5. Горячие клавиши управления на ТВ (Space, N, P, +, -).
 * 6. Сетевой пинг-индикатор (Firebase WS / REST).
 * 7. Встроенный автоматический Color-Up после уровня 100/200.
 */

let ACTIVE_TABLES = {};
let WAKE_LOCK = null;
let LAST_RENDERED_SIGNATURE = "";
let LAST_RENDERED_MODE = "";
let LAST_TICK_SECONDS = {};
let AUDIO_CTX = null;
let CURRENT_MTT_SESSION = null;

let LAST_FIREBASE_SYNC_TS = 0;
let REST_POLL_INTERVAL = null;

if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("DOMContentLoaded", () => {
    initClock();
    initWakeLock();
    initTvHotkeys();
    initDataSource();
    
    // Регулярная перерисовка каждые 250 мс
    setInterval(renderTables, 250);
  });
}

// Часы в шапке
function initClock() {
  const clockEl = document.getElementById("header-clock");
  const update = () => {
    const now = new Date();
    if (clockEl) clockEl.textContent = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const loungeTimeEl = document.getElementById("lounge-time");
    if (loungeTimeEl) {
      loungeTimeEl.textContent = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    }
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

// ==========================================
// WEB AUDIO API: ПРОЦЕДУРНЫЙ ЗВУКОВОЙ ДВИЖОК
// ==========================================

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtxClass) return null;
  if (!AUDIO_CTX) {
    AUDIO_CTX = new AudioCtxClass();
  }
  return AUDIO_CTX;
}

function unlockAudioContext() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().then(() => {
      hideAudioUnlockOverlay();
    }).catch(() => {});
  } else {
    hideAudioUnlockOverlay();
  }
}

function hideAudioUnlockOverlay() {
  if (typeof document === "undefined") return;
  const overlay = document.getElementById("audio-unlock-overlay");
  if (overlay) overlay.style.display = "none";
}

function showAudioUnlockOverlay() {
  if (typeof document === "undefined") return;
  const overlay = document.getElementById("audio-unlock-overlay");
  if (overlay) overlay.style.display = "block";
}

// 5-секундный предупредительный звуковой отсчет (5..4..3..2..1)
function playCountdownTick(second) {
  try {
    const ctx = getAudioContext();
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    // Частота повышается от 600 Гц на 5c до 720 Гц на 1c
    const freq = 600 + Math.max(0, (5 - second)) * 30;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.075);
  } catch (e) {}
}

// Финальный двухтональный гонг смены уровней блайндов
function playTournamentChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.18);

    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(440, now);
    osc2.frequency.exponentialRampToValueAtTime(660, now + 0.18);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.85);
    osc2.stop(now + 0.85);
  } catch (e) {}
}

// ==========================================
// ГОРЯЧИЕ КЛАВИШИ УПРАВЛЕНИЯ НА ТВ
// ==========================================

function initTvHotkeys() {
  if (typeof document === "undefined") return;

  const handleUserGesture = () => unlockAudioContext();
  if (typeof document.addEventListener === "function") {
    document.addEventListener("click", handleUserGesture);
    document.addEventListener("touchstart", handleUserGesture);

    document.addEventListener("keydown", (e) => {
      unlockAudioContext();

      // 1. Полноэкранный режим
      if (e.key === "f" || e.key === "F" || e.key === "Enter") {
        toggleFullscreen();
        return;
      }

      // Поиск активного стола на экране
      const activeKeys = Object.keys(ACTIVE_TABLES).filter(k => {
        const t = ACTIVE_TABLES[k];
        return t && (t.status === "running" || t.status === "paused");
      });
      if (activeKeys.length === 0) return;
      const targetKey = activeKeys[0];
      const table = ACTIVE_TABLES[targetKey];
      if (!table) return;

      // 2. Пробел: Пауза / Возобновление
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        const now = Date.now();
        if (table.status === "running") {
          table.status = "paused";
          table.remainingMs = table.levelEndsAt ? Math.max(0, table.levelEndsAt - now) : ((table.durationSec || 420) * 1000);
          table.levelEndsAt = null;
        } else if (table.status === "paused") {
          table.status = "running";
          const rem = (table.remainingMs !== undefined && table.remainingMs !== null)
            ? table.remainingMs
            : ((table.durationSec || 420) * 1000);
          table.levelEndsAt = now + rem;
        }
        syncTableAutoProgression(targetKey, table);
        renderTables();
        return;
      }

      // 3. N / n: Следующий раунд
      if (e.key === "n" || e.key === "N") {
        const structure = getTableStructure(table);
        if (table.levelIndex < structure.length - 1) {
          table.levelIndex += 1;
          const nextLvl = structure[table.levelIndex];
          table.durationSec = nextLvl.durationSec;
          table.remainingMs = nextLvl.durationSec * 1000;
          table.levelEndsAt = Date.now() + table.remainingMs;
          playTournamentChime();
          syncTableAutoProgression(targetKey, table);
          renderTables();
        }
        return;
      }

      // 4. P / p: Предыдущий раунд (коррекция)
      if (e.key === "p" || e.key === "P") {
        const structure = getTableStructure(table);
        if (table.levelIndex > 0) {
          table.levelIndex -= 1;
          const prevLvl = structure[table.levelIndex];
          table.durationSec = prevLvl.durationSec;
          table.remainingMs = prevLvl.durationSec * 1000;
          table.levelEndsAt = Date.now() + table.remainingMs;
          syncTableAutoProgression(targetKey, table);
          renderTables();
        }
        return;
      }

      // 5. Стрелка вправо / +: Добавить 1 минуту
      if (e.key === "ArrowRight" || e.key === "+") {
        e.preventDefault();
        if (table.status === "running" && table.levelEndsAt) {
          table.levelEndsAt += 60000;
        } else if (table.remainingMs) {
          table.remainingMs += 60000;
        }
        syncTableAutoProgression(targetKey, table);
        renderTables();
        return;
      }

      // 6. Стрелка влево / -: Убавить 1 минуту
      if (e.key === "ArrowLeft" || e.key === "-") {
        e.preventDefault();
        if (table.status === "running" && table.levelEndsAt) {
          table.levelEndsAt = Math.max(Date.now() + 5000, table.levelEndsAt - 60000);
        } else if (table.remainingMs) {
          table.remainingMs = Math.max(5000, table.remainingMs - 60000);
        }
        syncTableAutoProgression(targetKey, table);
        renderTables();
        return;
      }
    });
  }

  const header = document.querySelector(".tv-header");
  if (header && typeof header.addEventListener === "function") {
    header.addEventListener("dblclick", toggleFullscreen);
  }
}

function toggleFullscreen() {
  if (typeof document === "undefined") return;
  if (!document.fullscreenElement) {
    if (document.documentElement && typeof document.documentElement.requestFullscreen === "function") {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  } else {
    if (typeof document.exitFullscreen === "function") {
      document.exitFullscreen().catch(() => {});
    }
  }
}

// ==========================================
// СЕТЕВОЙ ПИНГ И ИСТОЧНИК ДАННЫХ
// ==========================================

function updateNetPingDisplay(latencyMs, source = "WS") {
  if (typeof document === "undefined") return;
  const valEl = document.getElementById("net-ping-val");
  const badge = document.getElementById("net-status-badge");
  if (!valEl || !badge) return;

  valEl.textContent = `${latencyMs} ms (${source})`;
  badge.className = "net-status-badge " + (latencyMs < 150 ? "fast" : (latencyMs < 500 ? "medium" : "slow"));
}

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
        const arrivalTime = Date.now();
        const latency = LAST_FIREBASE_SYNC_TS > 0 ? Math.min(60, Math.max(8, arrivalTime - LAST_FIREBASE_SYNC_TS)) : 12;
        LAST_FIREBASE_SYNC_TS = arrivalTime;
        ACTIVE_TABLES = snapshot.val() || {};
        updateNetPingDisplay(latency, "WS");
        renderTables();
      });

      // Слушаем активную турнирную сессию МТТ
      db.ref("atmosphere/mtt_session").on("value", (snapshot) => {
        CURRENT_MTT_SESSION = snapshot.val() || null;
        renderTables();
      });

      console.log("⚡ ТВ подключен к Firebase Realtime DB (WebSocket)");
    } catch (err) {
      console.warn("Ошибка подключения к Firebase WebSocket:", err);
    }
  }

  startRestPollingFallback();

  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key === "atmosphere_tables") {
        ACTIVE_TABLES = JSON.parse(e.newValue || "{}");
        renderTables();
      }
      if (e.key === "atmosphere_mtt_session") {
        try {
          CURRENT_MTT_SESSION = JSON.parse(e.newValue || "null");
          renderTables();
        } catch (err) {}
      }
    });
    
    const saved = localStorage.getItem("atmosphere_tables");
    if (saved) {
      ACTIVE_TABLES = JSON.parse(saved);
    }
    const savedSession = localStorage.getItem("atmosphere_mtt_session");
    if (savedSession) {
      try { CURRENT_MTT_SESSION = JSON.parse(savedSession); } catch (e) {}
    }
  }
}

async function fetchTablesRest() {
  try {
    const start = Date.now();
    const dbUrl = (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG.FIREBASE_DB_URL)
      ? POKER_CONFIG.FIREBASE_DB_URL
      : "https://atmosphere-poker-default-rtdb.europe-west1.firebasedatabase.app";
    const res = await fetch(`${dbUrl}/atmosphere/tables.json`);
    if (res.ok) {
      const latency = Date.now() - start;
      const data = await res.json();
      if (data) {
        ACTIVE_TABLES = data;
        LAST_FIREBASE_SYNC_TS = Date.now();
        updateNetPingDisplay(latency, "REST");
        renderTables();
      }
    }

    const sessionRes = await fetch(`${dbUrl}/atmosphere/mtt_session.json`);
    if (sessionRes.ok) {
      CURRENT_MTT_SESSION = await sessionRes.json();
      renderTables();
    }
  } catch (e) {}
}

function startRestPollingFallback() {
  if (REST_POLL_INTERVAL) return;
  REST_POLL_INTERVAL = setInterval(() => {
    if (Date.now() - LAST_FIREBASE_SYNC_TS > 3000) {
      fetchTablesRest();
    }
  }, 1500);
  if (REST_POLL_INTERVAL && typeof REST_POLL_INTERVAL.unref === "function") {
    REST_POLL_INTERVAL.unref();
  }
}

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

// Расчёт времени стола
function calculateTableTime(table, isFinalLevel = false) {
  const now = Date.now();
  const duration = table.durationSec || 420;
  let elapsed = table.elapsedBeforePause || 0;
  let isOvertime = false;
  let remaining = 0;

  if (table.status === "running") {
    if (table.levelEndsAt) {
      if (now <= table.levelEndsAt) {
        remaining = Math.max(0, Math.ceil((table.levelEndsAt - now) / 1000));
        elapsed = duration - remaining;
      } else {
        const overtimeSec = Math.floor((now - table.levelEndsAt) / 1000);
        remaining = 0;
        elapsed = duration + overtimeSec;
        isOvertime = true;
      }
    } else if (table.startedAt) {
      elapsed += Math.floor((now - table.startedAt) / 1000);
      if (elapsed >= duration) {
        isOvertime = true;
        remaining = 0;
      } else {
        remaining = Math.max(0, duration - elapsed);
      }
    }
  } else if (table.status === "paused") {
    if (table.remainingMs !== undefined && table.remainingMs !== null) {
      remaining = Math.max(0, Math.ceil(table.remainingMs / 1000));
      elapsed = Math.max(0, duration - remaining);
    } else {
      remaining = Math.max(0, duration - elapsed);
    }
  }
  
  let minutes = 0;
  let seconds = 0;
  let formatted = "00:00";
  let isAlert = false;
  
  if (isOvertime) {
    const overtimeSec = Math.max(0, elapsed - duration);
    minutes = Math.floor(overtimeSec / 60);
    seconds = overtimeSec % 60;
    formatted = `+${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  } else {
    minutes = Math.floor(remaining / 60);
    seconds = remaining % 60;
    formatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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

function getTournamentMilestone(table, structure, safeIndex, isFinalLevel, isTimedPause) {
  if (table && table.breakReason === "consolidation") {
    return "Перерыв 15 мин • Объединение столов";
  }
  if (isTimedPause) {
    if (table && table.isColorUpActive) return "Размен фишек <100";
    return "Перерыв";
  }
  if (table && table.status === "paused") {
    return "Пауза";
  }
  if (isFinalLevel) {
    return "Блайнды зафиксированы";
  }

  const levels = Array.isArray(structure) ? structure : [];
  let colorUpLevelIdx = -1;

  // Для MTT_PRO_5000: color-up строго после 150/300 (уровень 5, safeIndex 4)
  if (table && (table.structKey === "MTT_PRO_5000" || (table.format === "MTT" && levels.length >= 17))) {
    for (let i = 0; i < levels.length; i++) {
      if (levels[i].sb === 150 && levels[i].bb === 300) {
        colorUpLevelIdx = i;
        break;
      }
    }
  } else {
    for (let i = 0; i < levels.length; i++) {
      if (levels[i].sb === 100 && levels[i].bb === 200) {
        colorUpLevelIdx = i;
        break;
      }
    }
  }

  if (colorUpLevelIdx !== -1 && (!table || !table.colorUpDone) && safeIndex <= colorUpLevelIdx) {
    const diff = colorUpLevelIdx - safeIndex;
    if (diff === 0) {
      return "Color-Up в конце уровня";
    } else if (diff === 1) {
      return "Color-Up через 1 ур.";
    } else {
      return `Color-Up через ${diff} ур.`;
    }
  }

  if (table && table.colorUpDone) {
    return "Фишки <100 выведены";
  }

  return "Турнир продолжается";
}

function syncTableAutoProgression(tableKey, table) {
  if (typeof firebase !== "undefined" && firebase.apps && firebase.apps.length > 0) {
    try {
      firebase.database().ref("atmosphere/tables/" + encodeURIComponent(tableKey)).update({
        levelIndex: table.levelIndex,
        durationSec: table.durationSec,
        remainingMs: table.remainingMs,
        levelEndsAt: table.levelEndsAt,
        status: table.status,
        colorUpDone: table.colorUpDone || false,
        isColorUpActive: table.isColorUpActive || false,
        pauseEndsAt: table.pauseEndsAt || null,
        pauseTotalSec: table.pauseTotalSec || null
      });
    } catch (e) {}
  }
}

// Генерация полного HTML представления (для первого рендера и тестовых окружений)
function buildFullTablesHtml(tableKeys, activeMttTables) {
  let mttHeaderHtml = "";
  if (activeMttTables.length > 0) {
    let totalPlayers = 0;
    let totalStarting = 0;
    activeMttTables.forEach(t => {
      totalPlayers += (t.playersCount !== undefined ? t.playersCount : 9);
      totalStarting += (t.initialPlayers !== undefined ? t.initialPlayers : 9);
    });

    const stack = 5000;
    const totalChips = (totalStarting || 9) * stack;
    const avgStack = totalPlayers > 0 ? Math.round(totalChips / totalPlayers) : stack;
    const firstT = activeMttTables.find(t => t.isMttMaster) || activeMttTables[0];
    const mttStructure = getTableStructure(firstT);
    const currentMttLvl = mttStructure[firstT ? (firstT.levelIndex || 0) : 0] || { bb: 50 };
    const currentBb = currentMttLvl.bb || 50;
    const avgStackBb = Math.round(avgStack / currentBb);

    let rebalanceBanner = "";
    const hasConsolidationBreak = activeMttTables.some(t => t.isBreakActive && t.breakReason === "consolidation" && t.breakEndsAt > Date.now());
    if (hasConsolidationBreak) {
      rebalanceBanner = `
        <div class="mtt-break-ticker">
          ☕ <b>ПЕРЕРЫВ 15 МИНУТ:</b> Объединение столов. Пересадка игроков.
        </div>
      `;
    } else if (activeMttTables.length >= 2) {
      let maxT = activeMttTables[0];
      let minT = activeMttTables[0];
      activeMttTables.forEach(t => {
        const c = t.playersCount !== undefined ? t.playersCount : 9;
        if (c > (maxT.playersCount !== undefined ? maxT.playersCount : 9)) maxT = t;
        if (c < (minT.playersCount !== undefined ? minT.playersCount : 9)) minT = t;
      });
      const delta = (maxT.playersCount !== undefined ? maxT.playersCount : 9) - (minT.playersCount !== undefined ? minT.playersCount : 9);
      if (delta >= 2) {
        rebalanceBanner = `
          <div class="mtt-rebalance-ticker">
            ⚠️ <b>РЕБАЛАНС СТОЛОВ:</b> Пересадка игрока со стола ${maxT.dealerName || "Стол 1"} за стол ${minT.dealerName || "Стол 2"}
          </div>
        `;
      }
    }

    if (!rebalanceBanner && totalPlayers <= 10 && activeMttTables.length > 1) {
      rebalanceBanner = `
        <div class="mtt-final-ticker">
          🔥 <b>ФИНАЛЬНЫЙ СТОЛ СФОРМИРОВАН:</b> Объединение всех участников за столом ${firstT.dealerName || "Стол 1"}!
        </div>
      `;
    }

    mttHeaderHtml = `
      <div class="mtt-top-bar">
        <div class="mtt-stat-box">
          <span class="mtt-stat-lbl">Осталось игроков</span>
          <span class="mtt-stat-num" id="mtt-val-players">${totalPlayers} <span class="mtt-stat-sub">/ ${totalStarting}</span></span>
        </div>
        <div class="mtt-bar-divider"></div>
        <div class="mtt-stat-box">
          <span class="mtt-stat-lbl">Банк фишек</span>
          <span class="mtt-stat-num cyan" id="mtt-val-chips">${totalChips.toLocaleString("ru-RU")}</span>
        </div>
        <div class="mtt-bar-divider"></div>
        <div class="mtt-stat-box">
          <span class="mtt-stat-lbl">Средний стек</span>
          <span class="mtt-stat-num gold" id="mtt-val-avg">${avgStack.toLocaleString("ru-RU")} <span class="mtt-stat-sub">(${avgStackBb} BB)</span></span>
        </div>
        <div class="mtt-bar-divider"></div>
        <div class="mtt-stat-box">
          <span class="mtt-stat-lbl">Столов в игре</span>
          <span class="mtt-stat-num" id="mtt-val-tables">${activeMttTables.length}</span>
        </div>
      </div>
      <div id="mtt-banner-box">${rebalanceBanner}</div>
    `;
  }

  const masterMttTable = activeMttTables.find(t => t.isMttMaster) || activeMttTables[0];
  let cardsHtml = "";
  tableKeys.slice(0, 4).forEach(key => {
    const table = ACTIVE_TABLES[key];
    const isThisTableMtt = Boolean(activeMttTables.length > 0 && table && table.format === "MTT");
    const timingTable = isThisTableMtt ? (masterMttTable || table) : table;

    const structure = getTableStructure(timingTable);
    const maxIdx = structure.length ? structure.length - 1 : 0;
    const safeIndex = Math.min(Math.max(0, timingTable.levelIndex || 0), maxIdx);
    timingTable.levelIndex = safeIndex;
    const isFinalLevel = (safeIndex >= maxIdx);
    const time = calculateTableTime(timingTable, isFinalLevel);
    const currentLevel = structure[safeIndex] || structure[0];
    const nextLevel = isFinalLevel ? null : (structure[safeIndex + 1] || null);
    const formatLabel = getFormatLabel(table.format);
    const now = Date.now();

    // Состояние перерыва (ручного или послеигрового)
    const isPostGame = Boolean(timingTable.isPostGameBreak && timingTable.nextGameAt);
    const breakEndTime = (timingTable.isBreakActive && timingTable.breakEndsAt) ? timingTable.breakEndsAt : (isPostGame ? timingTable.nextGameAt : null);

    if (breakEndTime) {
      const isOvertime = now >= breakEndTime;
      const isWithinOneHour = (now - breakEndTime < 3600 * 1000);

      if (!isOvertime) {
        const breakRemaining = Math.max(0, Math.floor((breakEndTime - now) / 1000));
        const bMin = Math.floor(breakRemaining / 60);
        const bSec = breakRemaining % 60;
        const bFormatted = `${String(bMin).padStart(2, "0")}:${String(bSec).padStart(2, "0")}`;
        const breakTotalSec = (timingTable.breakDurationSec || (isPostGame ? Math.round((breakEndTime - (timingTable.finishedAt || (breakEndTime - 600000))) / 1000) : 600)) || 600;
        const progressPercent = Math.max(0, Math.min(100, (breakRemaining / breakTotalSec) * 100));

        cardsHtml += `
          <div class="table-card break-screen-card state-break" id="card-${table.id || key}">
            <!-- Шапка стола -->
            <div class="card-top">
              <div class="dealer-identity dealer-brand-box">
                <svg class="dealer-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
                  <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
                  <path d="M4 22h16"/>
                  <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
                  <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
                  <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
                </svg>
                <div class="dealer-meta">
                  <span class="dealer-label">ВЕДУЩИЙ</span>
                  <span class="dealer-name">${table.dealerName || "Ведущий"}</span>
                </div>
                <div class="break-screen-dealer" style="display: none;">Стол ведущего ${table.dealerName || "Ведущий"} (${formatLabel})</div>
              </div>
              <div class="pill-group">
                <span class="format-badge">${formatLabel}</span>
                <div class="round-pill state-break-pill">☕ ПЕРЕРЫВ</div>
              </div>
            </div>

            <!-- Центральный таймер и лазерный Time Rail -->
            <div class="timer-block">
              <div class="timer-digits state-break-digits">${bFormatted}</div>
              <div class="time-rail-track">
                <div class="time-rail-fill state-break-rail" style="transform: scaleX(${(progressPercent / 100).toFixed(4)}); width: ${progressPercent.toFixed(1)}%;"></div>
              </div>
              <div class="timer-subtext">До старта следующей игры</div>
            </div>

            <!-- Монолит следующей игры (EPT Style) -->
            <div class="blinds-grid blinds-monolith break-monolith">
              <div class="blinds-item current-blinds-box">
                <span class="blinds-caption">Старт следующей игры</span>
                <div class="blinds-main-row">
                  <span class="blinds-number current">25 / 50</span>
                  <span class="ante-badge ante-strip">РЕГИСТРАЦИЯ</span>
                </div>
              </div>
              <div class="blinds-item next-blinds-box">
                <span class="blinds-caption">Статус стола</span>
                <div class="next-blinds-value break-status-val">Подготовка к игре</div>
              </div>
            </div>
          </div>
        `;
        return;
      } else if (isPostGame && isWithinOneHour) {
        // Овертайм перерыва (+MM:SS)
        const overdueSec = Math.floor((now - breakEndTime) / 1000);
        const oMin = Math.floor(overdueSec / 60);
        const oSec = overdueSec % 60;
        const oFormatted = `+${String(oMin).padStart(2, "0")}:${String(oSec).padStart(2, "0")}`;

        cardsHtml += `
          <div class="table-card break-screen-card state-break state-overtime" id="card-${table.id || key}">
            <!-- Шапка стола -->
            <div class="card-top">
              <div class="dealer-identity dealer-brand-box">
                <svg class="dealer-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
                  <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
                  <path d="M4 22h16"/>
                  <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
                  <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
                  <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
                </svg>
                <div class="dealer-meta">
                  <span class="dealer-label">ВЕДУЩИЙ</span>
                  <span class="dealer-name">${table.dealerName || "Ведущий"}</span>
                </div>
                <div class="break-screen-dealer" style="display: none;">Стол ведущего ${table.dealerName || "Ведущий"} (${formatLabel})</div>
              </div>
              <div class="pill-group">
                <span class="format-badge">${formatLabel}</span>
                <div class="round-pill state-break-pill" style="color: #f59e0b; border-color: rgba(245, 158, 11, 0.4);">☕ ЗАДЕРЖКА</div>
              </div>
            </div>

            <!-- Центральный таймер и лазерный Time Rail -->
            <div class="timer-block">
              <div class="timer-digits state-break-digits state-overtime">${oFormatted}</div>
              <div class="time-rail-track">
                <div class="time-rail-fill is-warning" style="transform: scaleX(1); width: 100%;"></div>
              </div>
              <div class="timer-subtext" style="color: #f59e0b;">Задержка старта: +${oMin} мин</div>
            </div>

            <!-- Монолит следующей игры (EPT Style) -->
            <div class="blinds-grid blinds-monolith break-monolith">
              <div class="blinds-item current-blinds-box">
                <span class="blinds-caption">Старт следующей игры</span>
                <div class="blinds-main-row">
                  <span class="blinds-number current">25 / 50</span>
                  <span class="ante-badge ante-strip" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border-color: rgba(245, 158, 11, 0.4);">ОЖИДАНИЕ</span>
                </div>
              </div>
              <div class="blinds-item next-blinds-box">
                <span class="blinds-caption">Статус стола</span>
                <div class="next-blinds-value break-status-val" style="color: #fbbf24;">Задержка старта (+${oMin} мин)</div>
              </div>
            </div>
          </div>
        `;
        return;
      }
    }

    const isTimedPause = (timingTable.status === "paused" && timingTable.pauseEndsAt && timingTable.pauseEndsAt > now);
    let displayFormattedTime = time.formatted;
    let cardClass = "table-card";

    // Расчет прогресса для Time Rail
    const duration = timingTable.durationSec || 420;
    let progressPercent = 100;
    if (isTimedPause) {
      const pRem = Math.max(0, Math.floor((timingTable.pauseEndsAt - now) / 1000));
      const pMin = Math.floor(pRem / 60);
      const pSec = pRem % 60;
      displayFormattedTime = `${String(pMin).padStart(2, "0")}:${String(pSec).padStart(2, "0")}`;
      cardClass += " state-break";
      const pTotal = timingTable.pauseTotalSec || 120;
      progressPercent = Math.max(0, Math.min(100, (pRem / pTotal) * 100));
    } else {
      if (time.isAlert) cardClass += " state-alert";
      if (currentLevel.isBreak) cardClass += " state-break";
      if (timingTable.status === "paused") cardClass += " state-paused";
      if (time.isOvertime) cardClass += " state-final-round";
      progressPercent = Math.max(0, Math.min(100, (time.remaining / duration) * 100));
    }

    let subtext = "Идёт уровень";
    if (timingTable.isColorUpActive && isTimedPause) subtext = "☕ Color-Up • Размен мелких фишек <100 (2 мин)";
    else if (isTimedPause) subtext = (timingTable.pauseTotalSec === 120 ? "☕ Перерыв • Размен фишек (Color-Up)" : `☕ Перерыв (${Math.round(timingTable.pauseTotalSec / 60)} мин)`);
    else if (timingTable.status === "paused") subtext = "Пауза";
    else if (isFinalLevel) subtext = "Блайнды зафиксированы";
    else if (currentLevel.isBreak) subtext = "Перерыв 5 минут";
    else if (time.isAlert) subtext = "Смена блайндов через 30 сек";

    const roundText = (timingTable.isColorUpActive && isTimedPause) ? "COLOR-UP" : (isTimedPause ? "ПЕРЕРЫВ" : (isFinalLevel ? "ФИНАЛЬНЫЙ УРОВЕНЬ" : (currentLevel.isBreak ? "ПЕРЕРЫВ" : `УРОВЕНЬ ${currentLevel.level}`)));
    const milestoneText = getTournamentMilestone(timingTable, structure, safeIndex, isFinalLevel, isTimedPause);
    const railWarningClass = (time.isAlert && !isTimedPause) ? " is-warning" : "";
    const upcomingStr = nextLevel ? `${nextLevel.sb} / ${nextLevel.bb}${nextLevel.ante > 0 ? ` (АНТЕ ${nextLevel.ante})` : ""}` : "—";

    let rebalanceFlagHtml = "";
    if (activeMttTables.length >= 2 && table.format === "MTT") {
      let maxCount = -1;
      let minCount = 999;
      activeMttTables.forEach(t => {
        const c = t.playersCount !== undefined ? t.playersCount : 9;
        if (c > maxCount) maxCount = c;
        if (c < minCount) minCount = c;
      });
      const delta = maxCount - minCount;
      const count = table.playersCount !== undefined ? table.playersCount : 9;
      if (delta >= 2) {
        if (count === maxCount) {
          rebalanceFlagHtml = `<span class="table-rebalance-flag donor">Отдает игрока</span>`;
        } else if (count === minCount) {
          rebalanceFlagHtml = `<span class="table-rebalance-flag receiver">Принимает игрока</span>`;
        }
      }
    }

    cardsHtml += `
      <div class="${cardClass}" id="card-${table.id || key}">
        <!-- Шапка стола -->
        <div class="card-top">
          <div class="dealer-identity dealer-brand-box">
            <svg class="dealer-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
              <path d="M4 22h16"/>
              <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
            </svg>
            <div class="dealer-meta">
              <span class="dealer-label">ВЕДУЩИЙ</span>
              <span class="dealer-name">${table.dealerName || "Ведущий"}</span>
            </div>
          </div>
          <div class="pill-group">
            ${table.format === "MTT" ? `<div class="players-pill">👥 ${table.playersCount || 9}</div>` : ""}
            ${table.format === "MTT" ? (table.isMttMaster ? `<span class="mtt-role-pill master">Главный</span>` : `<span class="mtt-role-pill satellite">Сателлит</span>`) : ""}
            <span class="format-badge${table.format === "MTT" ? " mtt-badge" : ""}">${formatLabel}</span>
            <div class="round-pill">${roundText}</div>
            ${rebalanceFlagHtml}
          </div>
        </div>
        
        <!-- Центральный таймер и лазерный Time Rail -->
        <div class="timer-block">
          <div class="timer-digits">${displayFormattedTime}</div>
          <div class="time-rail-track">
            <div class="time-rail-fill${railWarningClass}" style="transform: scaleX(${(progressPercent / 100).toFixed(4)}); width: ${progressPercent.toFixed(1)}%;"></div>
          </div>
          <div class="timer-subtext">${subtext}</div>
        </div>
        
        <!-- Монолит блайндов (EPT Style) -->
        <div class="blinds-grid blinds-monolith">
          <div class="blinds-item current-blinds-box">
            <span class="blinds-caption">Текущие блайнды</span>
            <div class="blinds-main-row">
              <span class="blinds-number current">${currentLevel.sb} / ${currentLevel.bb}</span>
              ${currentLevel.ante > 0 ? `<span class="ante-badge ante-strip">АНТЕ ${currentLevel.ante}</span>` : `<span class="ante-badge ante-strip" style="display: none;"></span>`}
            </div>
          </div>
        </div>

        <!-- Нижний Floor Bar -->
        <div class="card-floor-bar">
          <div class="floor-upcoming">
            <span class="floor-caption">Следующие:</span>
            <span class="blinds-number upcoming">${upcomingStr}</span>
          </div>
          <div class="floor-milestone">
            <span class="floor-milestone-badge">${milestoneText}</span>
          </div>
        </div>
      </div>
    `;
  });

  if (activeMttTables.length > 0) {
    return `
      ${mttHeaderHtml}
      <div class="mtt-tables-deck" data-deck-tables="${Math.min(4, activeMttTables.length)}">
        ${cardsHtml}
      </div>
    `;
  }

  return cardsHtml;
}

// Генерация HTML экрана сбора столов МТТ (Lobby Assembly Board)
function buildMttLobbyHtml(lobbyTables, session) {
  let totalStarting = 0;
  lobbyTables.forEach(t => {
    totalStarting += (t.initialPlayers !== undefined ? t.initialPlayers : (t.playersCount !== undefined ? t.playersCount : 9));
  });
  const stack = 5000;
  const totalChips = totalStarting * stack;
  const masterName = (session && session.masterName) ? session.masterName : (lobbyTables.find(t => t.isMttMaster)?.dealerName || "Головной ведущий");

  let tablesHtml = "";
  lobbyTables.forEach(t => {
    const isMaster = Boolean(t.isMttMaster || (session && t.id === session.masterId));
    const isReady = t.status === "ready" || isMaster;
    const count = t.playersCount !== undefined ? t.playersCount : 9;
    const dealerName = t.dealerName || (isMaster ? "Головной стол" : "Сателлит");

    tablesHtml += `
      <div class="mtt-lobby-table-card ${isReady ? "ready" : "waiting"}">
        <div class="mtt-lobby-card-head">
          <span class="mtt-lobby-card-name">${dealerName}</span>
          <span class="mtt-role-pill ${isMaster ? "master" : "satellite"}">${isMaster ? "Главный" : "Сателлит"}</span>
        </div>
        <div class="mtt-lobby-card-body">
          <span class="mtt-lobby-card-players">👥 Игроков: <b>${count}</b></span>
          <span class="badge ${isReady ? "badge-success" : "badge-warning"}">${isReady ? "Готов к игре" : "Сбор..."}</span>
        </div>
      </div>
    `;
  });

  return `
    <div class="mtt-lobby-screen">
      <div class="mtt-lobby-header-box">
        <div class="mtt-lobby-headline">АТМОСФЕРА МТТ PRO • СБОР СТОЛОВ</div>
        <div class="mtt-lobby-subline">Головной стол: ${masterName} • Подключение столов ведущих в реальном времени</div>
      </div>
      <div class="mtt-lobby-stats-row">
        <div class="mtt-lobby-stat-item">
          <span class="mtt-lobby-stat-lbl">Подключено столов</span>
          <span class="mtt-lobby-stat-val cyan">${lobbyTables.length}</span>
        </div>
        <div class="mtt-lobby-stat-item">
          <span class="mtt-lobby-stat-lbl">Игроков на старте</span>
          <span class="mtt-lobby-stat-val">${totalStarting}</span>
        </div>
        <div class="mtt-lobby-stat-item">
          <span class="mtt-lobby-stat-lbl">Стартовый банк</span>
          <span class="mtt-lobby-stat-val gold">${totalChips.toLocaleString("ru-RU")}</span>
        </div>
      </div>
      <div class="mtt-lobby-tables-grid">
        ${tablesHtml}
      </div>
      <div class="mtt-lobby-footer-ticker">
        ⏳ Ожидание готовности всех столов и общего старта турнира...
      </div>
    </div>
  `;
}

// Проверка стола на устаревание (ghost / stale сессии)
function isTableStale(t) {
  if (!t) return true;
  if (t.dissolved) return true;
  const now = Date.now();
  const TWO_HOURS_MS = 2 * 3600 * 1000;

  // Активные перерывы никогда не считаются устаревшими
  if (t.isBreakActive && t.breakEndsAt && t.breakEndsAt > now) return false;
  if (t.isPostGameBreak && t.nextGameAt && (now - t.nextGameAt < 3600 * 1000)) return false;

  if (t.status === "running" || t.status === "paused") {
    const activityTs = t.startedAt || t.createdAt || 0;
    if (activityTs > 0 && (now - activityTs > 3.5 * 3600 * 1000)) return true;
    return false;
  }

  if (t.status === "ready" || t.status === "lobby") {
    const lobbyTs = t.createdAt || t.startedAt || 0;
    if (lobbyTs > 0 && (now - lobbyTs > TWO_HOURS_MS)) return true;
    return false;
  }

  if (t.status === "idle" || t.status === "finished") {
    return true;
  }

  return false;
}

// Генерация специализированной разметки Cinema Deck для МТТ
function buildMttCinemaDeckHtml(timingTable, activeMttTables) {
  let totalPlayers = 0;
  let totalStarting = 0;
  activeMttTables.forEach(t => {
    totalPlayers += (t.playersCount !== undefined ? t.playersCount : 9);
    totalStarting += (t.initialPlayers !== undefined ? t.initialPlayers : 9);
  });

  const stack = 5000;
  const totalChips = (totalStarting || 9) * stack;
  const avgStack = totalPlayers > 0 ? Math.round(totalChips / totalPlayers) : stack;
  const structure = getTableStructure(timingTable);
  const maxIdx = structure.length ? structure.length - 1 : 0;
  const safeIndex = Math.min(Math.max(0, timingTable.levelIndex || 0), maxIdx);
  const isFinalLevel = (safeIndex >= maxIdx);
  const currentLvl = structure[safeIndex] || structure[0];
  const nextLvl = isFinalLevel ? null : (structure[safeIndex + 1] || null);
  const currentBb = currentLvl.bb || 50;
  const avgStackBb = Math.round(avgStack / currentBb);

  const time = calculateTableTime(timingTable, isFinalLevel);
  const now = Date.now();

  const isTimedPause = (timingTable.status === "paused" && timingTable.pauseEndsAt && timingTable.pauseEndsAt > now);
  const isConsolidationBreak = Boolean(timingTable.isBreakActive && timingTable.breakEndsAt && timingTable.breakEndsAt > now);

  let displayFormattedTime = time.formatted;
  const duration = timingTable.durationSec || 600;
  let progressPercent = 100;
  if (isConsolidationBreak) {
    const bRem = Math.max(0, Math.floor((timingTable.breakEndsAt - now) / 1000));
    const bMin = Math.floor(bRem / 60);
    const bSec = bRem % 60;
    displayFormattedTime = `${String(bMin).padStart(2, "0")}:${String(bSec).padStart(2, "0")}`;
  } else if (isTimedPause) {
    const pRem = Math.max(0, Math.floor((timingTable.pauseEndsAt - now) / 1000));
    const pMin = Math.floor(pRem / 60);
    const pSec = pRem % 60;
    displayFormattedTime = `${String(pMin).padStart(2, "0")}:${String(pSec).padStart(2, "0")}`;
    const pTotal = timingTable.pauseTotalSec || 120;
    progressPercent = Math.max(0, Math.min(100, (pRem / pTotal) * 100));
  } else {
    progressPercent = Math.max(0, Math.min(100, (time.remaining / duration) * 100));
  }

  let digitsClass = "mtt-hero-digits";
  if (isConsolidationBreak || isTimedPause) digitsClass += " state-break";
  else if (time.isAlert) digitsClass += " state-alert";
  else if (timingTable.status === "paused") digitsClass += " state-paused";

  let subtext = "Идёт уровень";
  if (isConsolidationBreak) subtext = "☕ Перерыв 15 минут • Объединение столов";
  else if (timingTable.isColorUpActive && isTimedPause) subtext = "☕ Color-Up • Размен мелких фишек <100 (2 мин)";
  else if (isTimedPause) subtext = `☕ Перерыв (${Math.round(timingTable.pauseTotalSec / 60)} мин)`;
  else if (timingTable.status === "paused") subtext = "Пауза";
  else if (isFinalLevel) subtext = "Блайнды зафиксированы";
  else if (time.isAlert) subtext = "Смена блайндов через 30 сек";

  const roundText = isConsolidationBreak ? "ПЕРЕРЫВ 15 МИН" : (timingTable.isColorUpActive && isTimedPause ? "COLOR-UP" : (isTimedPause ? "ПЕРЕРЫВ" : (isFinalLevel ? "ФИНАЛЬНЫЙ УРОВЕНЬ" : `УРОВЕНЬ ${currentLvl.level}`)));
  const nextBlindsStr = nextLvl ? `${nextLvl.sb.toLocaleString("ru-RU")} / ${nextLvl.bb.toLocaleString("ru-RU")}${nextLvl.ante > 0 ? ` (АНТЕ ${nextLvl.ante.toLocaleString("ru-RU")})` : ""}` : "—";
  const milestoneText = getTournamentMilestone(timingTable, structure, safeIndex, isFinalLevel, isTimedPause);

  let bannerHtml = "";
  let maxT = null;
  let minT = null;
  let delta = 0;
  if (isConsolidationBreak) {
    bannerHtml = `<div class="mtt-break-ticker">☕ <b>ПЕРЕРЫВ 15 МИНУТ:</b> Объединение столов. Пересадка участников.</div>`;
  } else if (activeMttTables.length >= 2) {
    maxT = activeMttTables[0];
    minT = activeMttTables[0];
    activeMttTables.forEach(t => {
      const c = t.playersCount !== undefined ? t.playersCount : 9;
      if (c > (maxT.playersCount !== undefined ? maxT.playersCount : 9)) maxT = t;
      if (c < (minT.playersCount !== undefined ? minT.playersCount : 9)) minT = t;
    });
    delta = (maxT.playersCount !== undefined ? maxT.playersCount : 9) - (minT.playersCount !== undefined ? minT.playersCount : 9);
    if (delta >= 2) {
      bannerHtml = `<div class="mtt-rebalance-ticker">⚠️ <b>РЕБАЛАНС СТОЛОВ:</b> Пересадка игрока со стола ${maxT.dealerName || "Стол 1"} за стол ${minT.dealerName || "Стол 2"}</div>`;
    }
  }

  let dockChipsHtml = "";
  activeMttTables.forEach(t => {
    const isMaster = Boolean(t.isMttMaster);
    const count = t.playersCount !== undefined ? t.playersCount : 9;
    let rebalanceFlagHtml = "";
    if (delta >= 2 && maxT && minT) {
      if (t === maxT || t.id === maxT.id) {
        rebalanceFlagHtml = `<span class="table-rebalance-flag donor">Отдает игрока</span>`;
      } else if (t === minT || t.id === minT.id) {
        rebalanceFlagHtml = `<span class="table-rebalance-flag receiver">Принимает игрока</span>`;
      }
    }
    const roleClass = isMaster ? "master" : "satellite";
    dockChipsHtml += `
      <div class="dock-table-chip ${isMaster ? "is-master" : ""}" id="dock-chip-${t.id || t.dealerName}">
        <div class="dock-table-head">
          <span class="dock-table-role mtt-role-pill ${roleClass}">${isMaster ? "★ Master (Главный)" : "● Сателлит"}</span>
          <span class="dock-dealer-name">${t.dealerName || "Стол"}</span>
          ${rebalanceFlagHtml}
        </div>
        <div class="dock-table-body">
          <span class="dock-players-count">👥 <b>${count}</b> игр.</span>
        </div>
      </div>
    `;
  });

  return `
    <div class="mtt-cinema-deck" id="mtt-cinema-deck">
      <div class="mtt-telemetry-hud mtt-top-bar">
        <div class="telemetry-card">
          <span class="telemetry-lbl">Осталось игроков</span>
          <div class="telemetry-val" id="mtt-val-players">
            <span class="val-current">${totalPlayers}</span>
            <span class="val-sub">/ ${totalStarting}</span>
          </div>
        </div>
        <div class="telemetry-card">
          <span class="telemetry-lbl">Банк фишек</span>
          <div class="telemetry-val cyan" id="mtt-val-chips">${totalChips.toLocaleString("ru-RU")}</div>
        </div>
        <div class="telemetry-card highlight">
          <span class="telemetry-lbl">Средний стек</span>
          <div class="telemetry-val gold" id="mtt-val-avg">
            <span class="val-chips">${avgStack.toLocaleString("ru-RU")}</span>
            <span class="val-bb">(${avgStackBb} BB)</span>
          </div>
        </div>
        <div class="telemetry-card">
          <span class="telemetry-lbl">Столов в игре</span>
          <div class="telemetry-val" id="mtt-val-tables">${activeMttTables.length}</div>
        </div>
      </div>

      <div class="mtt-deck-banner-wrap" id="mtt-deck-banner">${bannerHtml}</div>

      <div class="mtt-hero-center">
        <div class="mtt-round-badge" id="mtt-deck-round">${roundText}</div>
        <div class="mtt-digits-wrap">
          <div class="${digitsClass}" id="mtt-deck-digits">${displayFormattedTime}</div>
        </div>
        <div class="mtt-deck-rail">
          <div class="mtt-deck-rail-fill ${time.isAlert && !isTimedPause && !isConsolidationBreak ? "is-warning" : ""}" id="mtt-deck-rail-fill" style="width: ${progressPercent.toFixed(1)}%;"></div>
        </div>
        <div class="mtt-subtext" id="mtt-deck-subtext">${subtext}</div>
      </div>

      <div class="mtt-blinds-deck">
        <div class="mtt-blinds-box current">
          <span class="deck-lbl">Текущие блайнды</span>
          <div class="deck-blinds-val" id="mtt-deck-current-blinds">
            ${currentLvl.sb.toLocaleString("ru-RU")} / ${currentLvl.bb.toLocaleString("ru-RU")}
            ${currentLvl.ante > 0 ? `<span class="deck-bba-badge">BBA ${currentLvl.ante.toLocaleString("ru-RU")}</span>` : ""}
          </div>
        </div>
        <div class="mtt-blinds-box upcoming">
          <span class="deck-lbl">Следующий уровень</span>
          <div class="deck-upcoming-val" id="mtt-deck-next-blinds">${nextBlindsStr}</div>
          <div class="deck-milestone-sub" id="mtt-deck-milestone">${milestoneText}</div>
        </div>
      </div>

      <div class="mtt-tables-dock mtt-tables-deck" id="mtt-tables-dock" data-deck-tables="${activeMttTables.length}">
        ${dockChipsHtml}
      </div>
    </div>
  `;
}

// Высокопроизводительный DOM-патчинг Cinema Deck для 60 FPS
function patchMttCinemaDeck(deckEl, timingTable, activeMttTables, time, currentLvl, nextLvl, structure, safeIndex, isFinalLevel) {
  const now = Date.now();
  let totalPlayers = 0;
  let totalStarting = 0;
  activeMttTables.forEach(t => {
    totalPlayers += (t.playersCount !== undefined ? t.playersCount : 9);
    totalStarting += (t.initialPlayers !== undefined ? t.initialPlayers : 9);
  });

  const stack = 5000;
  const totalChips = (totalStarting || 9) * stack;
  const avgStack = totalPlayers > 0 ? Math.round(totalChips / totalPlayers) : stack;
  const currentBb = currentLvl.bb || 50;
  const avgStackBb = Math.round(avgStack / currentBb);

  const playersEl = document.getElementById("mtt-val-players") || document.getElementById("mtt-live-players");
  if (playersEl) {
    const pStr = `<span class="val-current">${totalPlayers}</span><span class="val-sub">/ ${totalStarting}</span>`;
    if (playersEl.innerHTML !== pStr) playersEl.innerHTML = pStr;
  }

  const chipsEl = document.getElementById("mtt-val-chips") || document.getElementById("mtt-live-chips");
  const chipsStr = totalChips.toLocaleString("ru-RU");
  if (chipsEl && chipsEl.textContent !== chipsStr) chipsEl.textContent = chipsStr;

  const avgEl = document.getElementById("mtt-val-avg") || document.getElementById("mtt-live-avg");
  if (avgEl) {
    const avgStr = `<span class="val-chips">${avgStack.toLocaleString("ru-RU")}</span><span class="val-bb">(${avgStackBb} BB)</span>`;
    if (avgEl.innerHTML !== avgStr) avgEl.innerHTML = avgStr;
  }

  const tablesEl = document.getElementById("mtt-val-tables") || document.getElementById("mtt-live-tables");
  const tablesCountStr = String(activeMttTables.length);
  if (tablesEl && tablesEl.textContent !== tablesCountStr) tablesEl.textContent = tablesCountStr;

  const isTimedPause = (timingTable.status === "paused" && timingTable.pauseEndsAt && timingTable.pauseEndsAt > now);
  const isConsolidationBreak = Boolean(timingTable.isBreakActive && timingTable.breakEndsAt && timingTable.breakEndsAt > now);

  let displayFormattedTime = time.formatted;
  const duration = timingTable.durationSec || 600;
  let progressPercent = 100;

  if (isConsolidationBreak) {
    const bRem = Math.max(0, Math.floor((timingTable.breakEndsAt - now) / 1000));
    const bMin = Math.floor(bRem / 60);
    const bSec = bRem % 60;
    displayFormattedTime = `${String(bMin).padStart(2, "0")}:${String(bSec).padStart(2, "0")}`;
  } else if (isTimedPause) {
    const pRem = Math.max(0, Math.floor((timingTable.pauseEndsAt - now) / 1000));
    const pMin = Math.floor(pRem / 60);
    const pSec = pRem % 60;
    displayFormattedTime = `${String(pMin).padStart(2, "0")}:${String(pSec).padStart(2, "0")}`;
    const pTotal = timingTable.pauseTotalSec || 120;
    progressPercent = Math.max(0, Math.min(100, (pRem / pTotal) * 100));
  } else {
    progressPercent = Math.max(0, Math.min(100, (time.remaining / duration) * 100));
  }

  const digitsEl = document.getElementById("mtt-deck-digits");
  if (digitsEl) {
    if (digitsEl.textContent !== displayFormattedTime) digitsEl.textContent = displayFormattedTime;
    digitsEl.className = "mtt-hero-digits" + (isConsolidationBreak || isTimedPause ? " state-break" : (time.isAlert ? " state-alert" : (timingTable.status === "paused" ? " state-paused" : "")));
  }

  const railFillEl = document.getElementById("mtt-deck-rail-fill");
  if (railFillEl) {
    railFillEl.style.width = `${progressPercent.toFixed(1)}%`;
    if (railFillEl.classList && typeof railFillEl.classList.toggle === "function") {
      railFillEl.classList.toggle("is-warning", Boolean(time.isAlert && !isTimedPause && !isConsolidationBreak));
    }
  }

  let subtext = "Идёт уровень";
  if (isConsolidationBreak) subtext = "☕ Перерыв 15 минут • Объединение столов";
  else if (timingTable.isColorUpActive && isTimedPause) subtext = "☕ Color-Up • Размен мелких фишек <100 (2 мин)";
  else if (isTimedPause) subtext = `☕ Перерыв (${Math.round(timingTable.pauseTotalSec / 60)} мин)`;
  else if (timingTable.status === "paused") subtext = "Пауза";
  else if (isFinalLevel) subtext = "Блайнды зафиксированы";
  else if (time.isAlert) subtext = "Смена блайндов через 30 сек";

  const subtextEl = document.getElementById("mtt-deck-subtext");
  if (subtextEl && subtextEl.textContent !== subtext) subtextEl.textContent = subtext;

  const roundText = isConsolidationBreak ? "ПЕРЕРЫВ 15 МИН" : (timingTable.isColorUpActive && isTimedPause ? "COLOR-UP" : (isTimedPause ? "ПЕРЕРЫВ" : (isFinalLevel ? "ФИНАЛЬНЫЙ УРОВЕНЬ" : `УРОВЕНЬ ${currentLvl.level}`)));
  const roundEl = document.getElementById("mtt-deck-round");
  if (roundEl && roundEl.textContent !== roundText) roundEl.textContent = roundText;

  const currentBlindsEl = document.getElementById("mtt-deck-current-blinds");
  if (currentBlindsEl) {
    const anteHtml = currentLvl.ante > 0 ? `<span class="deck-bba-badge">BBA ${currentLvl.ante.toLocaleString("ru-RU")}</span>` : "";
    const blindsStr = `${currentLvl.sb.toLocaleString("ru-RU")} / ${currentLvl.bb.toLocaleString("ru-RU")} ${anteHtml}`.trim();
    if (currentBlindsEl.innerHTML.trim() !== blindsStr) currentBlindsEl.innerHTML = blindsStr;
  }

  const nextBlindsEl = document.getElementById("mtt-deck-next-blinds");
  const nextBlindsStr = nextLvl ? `${nextLvl.sb.toLocaleString("ru-RU")} / ${nextLvl.bb.toLocaleString("ru-RU")}${nextLvl.ante > 0 ? ` (АНТЕ ${nextLvl.ante.toLocaleString("ru-RU")})` : ""}` : "—";
  if (nextBlindsEl && nextBlindsEl.textContent !== nextBlindsStr) nextBlindsEl.textContent = nextBlindsStr;

  const milestoneEl = document.getElementById("mtt-deck-milestone");
  const milestoneText = getTournamentMilestone(timingTable, structure, safeIndex, isFinalLevel, isTimedPause);
  if (milestoneEl && milestoneEl.textContent !== milestoneText) milestoneEl.textContent = milestoneText;

  // Патчим док столов
  activeMttTables.forEach(t => {
    const chip = document.getElementById(`dock-chip-${t.id || t.dealerName}`);
    if (chip) {
      const pCountEl = chip.querySelector(".dock-players-count");
      const count = t.playersCount !== undefined ? t.playersCount : 9;
      const expectedP = `👥 <b>${count}</b> игр.`;
      if (pCountEl && pCountEl.innerHTML !== expectedP) {
        pCountEl.innerHTML = expectedP;
      }
    }
  });
}

function renderMttCinemaMode(viewport, activeMttTables, tableKeys) {
  const masterMttTable = activeMttTables.find(t => t.isMttMaster) || activeMttTables[0];
  const structure = getTableStructure(masterMttTable);
  const now = Date.now();

  // 1. Автопрогрессия уровней и Color-Up
  if (masterMttTable.status === "running" && masterMttTable.levelEndsAt && now >= masterMttTable.levelEndsAt) {
    const currentLevel = structure[masterMttTable.levelIndex] || structure[0];
    const isColorUpLevel = (currentLevel.sb === 150 && currentLevel.bb === 300);

    if (isColorUpLevel && !masterMttTable.colorUpDone) {
      masterMttTable.colorUpDone = true;
      masterMttTable.isColorUpActive = true;
      masterMttTable.status = "paused";
      masterMttTable.pauseEndsAt = now + (120 * 1000);
      masterMttTable.pauseTotalSec = 120;
      playTournamentChime();
      syncTableAutoProgression(masterMttTable.id || "master", masterMttTable);
    } else if (masterMttTable.levelIndex < structure.length - 1) {
      masterMttTable.levelIndex += 1;
      const nextLvl = structure[masterMttTable.levelIndex];
      masterMttTable.durationSec = nextLvl.durationSec;
      masterMttTable.remainingMs = nextLvl.durationSec * 1000;
      masterMttTable.levelEndsAt = now + masterMttTable.remainingMs;
      playTournamentChime();
      syncTableAutoProgression(masterMttTable.id || "master", masterMttTable);
    }
  }

  if (masterMttTable.isColorUpActive && masterMttTable.pauseEndsAt && now >= masterMttTable.pauseEndsAt) {
    masterMttTable.isColorUpActive = false;
    masterMttTable.pauseEndsAt = null;
    masterMttTable.pauseTotalSec = null;
    masterMttTable.status = "running";
    if (masterMttTable.levelIndex < structure.length - 1) {
      masterMttTable.levelIndex += 1;
      const nextLvl = structure[masterMttTable.levelIndex];
      masterMttTable.durationSec = nextLvl.durationSec;
      masterMttTable.remainingMs = nextLvl.durationSec * 1000;
      masterMttTable.levelEndsAt = now + masterMttTable.remainingMs;
      playTournamentChime();
      syncTableAutoProgression(masterMttTable.id || "master", masterMttTable);
    }
  }

  const maxIdx = structure.length ? structure.length - 1 : 0;
  const safeIndex = Math.min(Math.max(0, masterMttTable.levelIndex || 0), maxIdx);
  const isFinalLevel = (safeIndex >= maxIdx);
  const currentLvl = structure[safeIndex] || structure[0];
  const nextLvl = isFinalLevel ? null : (structure[safeIndex + 1] || null);
  const time = calculateTableTime(masterMttTable, isFinalLevel);

  // 2. Звуковой 5-секундный отсчет
  if (masterMttTable.status === "running" && time.remaining <= 5 && time.remaining >= 1 && !time.isOvertime) {
    if (LAST_TICK_SECONDS["MTT_MASTER"] !== time.remaining) {
      LAST_TICK_SECONDS["MTT_MASTER"] = time.remaining;
      playCountdownTick(time.remaining);
    }
  } else if (time.remaining > 5 || time.remaining === 0) {
    LAST_TICK_SECONDS["MTT_MASTER"] = 0;
  }

  const deckEl = document.getElementById("mtt-cinema-deck");
  const mttSignature = `CINEMA:${activeMttTables.map(t => `${t.id || t.dealerName}`).sort().join(",")}`;

  if (LAST_RENDERED_MODE !== "mtt_cinema" || !deckEl || LAST_RENDERED_SIGNATURE !== mttSignature) {
    viewport.innerHTML = buildMttCinemaDeckHtml(masterMttTable, activeMttTables);
    LAST_RENDERED_MODE = "mtt_cinema";
    LAST_RENDERED_SIGNATURE = mttSignature;
    const newDeckEl = document.getElementById("mtt-cinema-deck");
    if (newDeckEl) {
      patchMttCinemaDeck(newDeckEl, masterMttTable, activeMttTables, time, currentLvl, nextLvl, structure, safeIndex, isFinalLevel);
    }
    return;
  }

  patchMttCinemaDeck(deckEl, masterMttTable, activeMttTables, time, currentLvl, nextLvl, structure, safeIndex, isFinalLevel);
}

// =========================================================
// ОСНОВНОЙ РЕНДЕРЕР: ВЫСОКОПРОИЗВОДИТЕЛЬНЫЙ DOM-PATCHING
// =========================================================

function renderTables() {
  if (typeof document === "undefined") return;
  const viewport = document.getElementById("tv-viewport");
  if (!viewport) return;

  // 1. Проверка активной сессии МТТ на этапе сбора (Lobby Assembly Board)
  const isMttSessionLobby = Boolean(CURRENT_MTT_SESSION && CURRENT_MTT_SESSION.sessionId && CURRENT_MTT_SESSION.status === "lobby");
  if (isMttSessionLobby) {
    const sessionId = CURRENT_MTT_SESSION.sessionId;
    const lobbyMttTables = Object.values(ACTIVE_TABLES).filter(t => 
      t && t.format === "MTT" && !t.dissolved && !isTableStale(t) &&
      (t.mttSessionId === sessionId || t.id === CURRENT_MTT_SESSION.masterId) &&
      (t.status === "lobby" || t.status === "ready")
    );

    if (viewport.classList && typeof viewport.classList.toggle === "function") {
      viewport.classList.toggle("is-mtt-mode", true);
    }
    const lobbySignature = `LOBBY:${sessionId}:${lobbyMttTables.map(t => `${t.id || t.dealerName}:${t.status}:${t.playersCount}`).sort().join(",")}`;
    if (LAST_RENDERED_MODE !== "mtt_lobby" || LAST_RENDERED_SIGNATURE !== lobbySignature) {
      viewport.innerHTML = buildMttLobbyHtml(lobbyMttTables, CURRENT_MTT_SESSION);
      LAST_RENDERED_MODE = "mtt_lobby";
      LAST_RENDERED_SIGNATURE = lobbySignature;
    }
    return;
  }

  // 2. Проверка активной сессии МТТ в процессе игры (Cinema Deck)
  const isMttSessionRunning = Boolean(CURRENT_MTT_SESSION && CURRENT_MTT_SESSION.sessionId && CURRENT_MTT_SESSION.status === "running");
  if (isMttSessionRunning) {
    const sessionId = CURRENT_MTT_SESSION.sessionId;
    const sessionMttTables = Object.values(ACTIVE_TABLES).filter(t => 
      t && t.format === "MTT" && !t.dissolved && !isTableStale(t) &&
      (t.mttSessionId === sessionId || t.id === CURRENT_MTT_SESSION.masterId) &&
      (t.status === "running" || t.status === "paused")
    );

    if (sessionMttTables.length > 0) {
      if (viewport.classList && typeof viewport.classList.toggle === "function") {
        viewport.classList.toggle("is-mtt-mode", true);
      }
      const mttKeys = sessionMttTables.map(t => t.id || t.dealerName);
      renderMttCinemaMode(viewport, sessionMttTables, mttKeys);
      return;
    }
  }
  
  const tableKeys = Object.keys(ACTIVE_TABLES).filter(k => {
    const t = ACTIVE_TABLES[k];
    if (!t || isTableStale(t)) return false;
    if (t.status === "running" || t.status === "paused") return true;
    if (t.isBreakActive && t.breakEndsAt && (t.breakEndsAt > Date.now())) return true;
    if (t.isPostGameBreak && t.nextGameAt && (Date.now() - t.nextGameAt < 3600 * 1000)) return true;
    return false;
  });

  const count = tableKeys.length;
  if (viewport.dataset) {
    viewport.dataset.tables = count === 0 ? "1" : String(Math.min(4, count));
  }
  
  // 3. Состояние ожидания сбора столов МТТ без WebSocket-сессии (Fallback)
  const lobbyMttTables = Object.values(ACTIVE_TABLES).filter(t => 
    t && t.format === "MTT" && !t.dissolved && !isTableStale(t) && (t.status === "lobby" || t.status === "ready")
  );

  if (count === 0 && lobbyMttTables.length > 0) {
    if (viewport.classList && typeof viewport.classList.toggle === "function") {
      viewport.classList.toggle("is-mtt-mode", true);
    }
    const lobbySignature = `LOBBY:${lobbyMttTables.map(t => `${t.id || t.dealerName}:${t.status}:${t.playersCount}`).sort().join(",")}`;
    if (LAST_RENDERED_MODE !== "mtt_lobby" || LAST_RENDERED_SIGNATURE !== lobbySignature) {
      viewport.innerHTML = buildMttLobbyHtml(lobbyMttTables, CURRENT_MTT_SESSION);
      LAST_RENDERED_MODE = "mtt_lobby";
      LAST_RENDERED_SIGNATURE = lobbySignature;
    }
    return;
  }

  // 4. Состояние ожидания (Lounge Mode — Impeccable Club Styling)
  if (count === 0) {
    if (viewport.classList && typeof viewport.classList.remove === "function") {
      viewport.classList.remove("is-mtt-mode");
    }
    if (LAST_RENDERED_MODE !== "lounge") {
      const now = new Date();
      const timeStr = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      viewport.innerHTML = `
        <div class="lounge-container">
          <div class="lounge-suits lounge-brand">
            <span class="suit suit-spade">♠</span>
            <span class="suit suit-heart">♥</span>
            <span class="suit suit-diamond">♦</span>
            <span class="suit suit-club">♣</span>
          </div>
          <div class="lounge-time" id="lounge-time">${timeStr}</div>
          <div class="lounge-status">Ожидание начала игр</div>
        </div>
      `;
      LAST_RENDERED_MODE = "lounge";
      LAST_RENDERED_SIGNATURE = "";
    }
    return;
  }
  
  // Анализ режима МТТ: Cinema Deck активируется, если запущен МТТ и все активные столы — МТТ
  const activeMttTables = tableKeys
    .map(k => ACTIVE_TABLES[k])
    .filter(t => t && t.format === "MTT" && (t.status === "running" || t.status === "paused") && !isTableStale(t));

  const isMttMode = activeMttTables.length > 0 && tableKeys.every(k => {
    const t = ACTIVE_TABLES[k];
    return t && t.format === "MTT";
  });

  if (viewport.classList && typeof viewport.classList.toggle === "function") {
    viewport.classList.toggle("is-mtt-mode", isMttMode);
  }

  // 5. Если запущен МТТ — рендерим единый Cinema Deck
  if (isMttMode) {
    renderMttCinemaMode(viewport, activeMttTables, tableKeys);
    return;
  }

  // 4. Обычный режим SnG / Mystery (мульти-карточное табло)
  const currentSignature = `SNG:${tableKeys.slice(0, 4).sort().join(",")}`;
  let canPatchDom = (LAST_RENDERED_MODE === "tables" && LAST_RENDERED_SIGNATURE === currentSignature);
  if (canPatchDom) {
    for (const key of tableKeys.slice(0, 4)) {
      const table = ACTIVE_TABLES[key];
      const card = document.getElementById("card-" + (table.id || key));
      if (!card || typeof card.querySelector !== "function") {
        canPatchDom = false;
        break;
      }
      const isBreakScreen = (table.isBreakActive && table.breakEndsAt > Date.now()) || (table.isPostGameBreak && table.nextGameAt && (Date.now() - table.nextGameAt < 3600 * 1000));
      if (isBreakScreen) {
        canPatchDom = false;
        break;
      }
    }
  }

  if (!canPatchDom) {
    // Каркас или первый рендер
    viewport.innerHTML = buildFullTablesHtml(tableKeys.slice(0, 4), activeMttTables);
    LAST_RENDERED_SIGNATURE = currentSignature;
    LAST_RENDERED_MODE = "tables";
  }

  const masterMttTable = activeMttTables.find(t => t.isMttMaster) || activeMttTables[0];

  // Обновление таймеров, автопрогрессии и звукового отсчета
  tableKeys.slice(0, 4).forEach(key => {
    const table = ACTIVE_TABLES[key];
    const isThisTableMtt = Boolean(isMttMode && table && table.format === "MTT");
    const timingTable = isThisTableMtt ? (masterMttTable || table) : table;
    const isMttSatellite = Boolean(isThisTableMtt && !table.isMttMaster);
    const structure = getTableStructure(timingTable);
    const now = Date.now();

    // Автоматический Color-Up после 100/200 (или 150/300 для MTT) и транзит уровней
    // ВАЖНО: Сателлитные столы в режиме МТТ НЕ отправляют автопрогрессию в Firebase, чтобы исключить гонку и дрифт таймера!
    if (!isMttSatellite && timingTable.status === "running" && timingTable.levelEndsAt && now >= timingTable.levelEndsAt) {
      const currentLevel = structure[timingTable.levelIndex] || structure[0];
      
      const isColorUpLevel = (timingTable.structKey === "MTT_PRO_5000" || (timingTable.format === "MTT" && structure.length >= 17))
        ? (currentLevel.sb === 150 && currentLevel.bb === 300)
        : (currentLevel.sb === 100 && currentLevel.bb === 200);

      if (isColorUpLevel && !timingTable.colorUpDone) {
        timingTable.colorUpDone = true;
        timingTable.isColorUpActive = true;
        timingTable.status = "paused";
        timingTable.pauseEndsAt = now + (120 * 1000);
        timingTable.pauseTotalSec = 120;
        playTournamentChime();
        syncTableAutoProgression(key, timingTable);
      } else if (timingTable.levelIndex < structure.length - 1) {
        timingTable.levelIndex += 1;
        const nextLvl = structure[timingTable.levelIndex];
        timingTable.durationSec = nextLvl.durationSec;
        timingTable.remainingMs = nextLvl.durationSec * 1000;
        timingTable.levelEndsAt = now + timingTable.remainingMs;
        playTournamentChime();
        syncTableAutoProgression(key, timingTable);
      }
    }

    // Завершение таймера Color-Up на ТВ
    if (!isMttSatellite && timingTable.isColorUpActive && timingTable.pauseEndsAt && now >= timingTable.pauseEndsAt) {
      timingTable.isColorUpActive = false;
      timingTable.pauseEndsAt = null;
      timingTable.pauseTotalSec = null;
      timingTable.status = "running";
      if (timingTable.levelIndex < structure.length - 1) {
        timingTable.levelIndex += 1;
        const nextLvl = structure[timingTable.levelIndex];
        timingTable.durationSec = nextLvl.durationSec;
        timingTable.remainingMs = nextLvl.durationSec * 1000;
        timingTable.levelEndsAt = now + timingTable.remainingMs;
        playTournamentChime();
        syncTableAutoProgression(key, timingTable);
      }
    }

    const isFinalLevel = (timingTable.levelIndex >= structure.length - 1);
    const time = calculateTableTime(timingTable, isFinalLevel);

    // Звуковой 5-секундный отсчет
    let isCountdownPulsing = false;
    if (timingTable.status === "running" && time.remaining <= 5 && time.remaining >= 1 && !time.isOvertime) {
      isCountdownPulsing = true;
      if (LAST_TICK_SECONDS[key] !== time.remaining) {
        LAST_TICK_SECONDS[key] = time.remaining;
        // Чтобы не дублировать гонг и писк при нескольких столах MTT, проигрываем отсчет только один раз
        if (!isMttSatellite) {
          playCountdownTick(time.remaining);
        }
      }
    } else if (time.remaining > 5 || time.remaining === 0) {
      LAST_TICK_SECONDS[key] = 0;
    }

    // Если карточка существует в DOM и поддерживает querySelector -> точечно патчим её
    const card = document.getElementById("card-" + (table.id || key));
    if (card && typeof card.querySelector === "function") {
      const maxIdx = structure.length ? structure.length - 1 : 0;
      const safeIndex = Math.min(Math.max(0, timingTable.levelIndex || 0), maxIdx);
      const isFinalLevel = (safeIndex >= maxIdx);
      const currentLevel = structure[safeIndex] || structure[0];
      const nextLevel = isFinalLevel ? null : (structure[safeIndex + 1] || null);

      const isTimedPause = (timingTable.status === "paused" && timingTable.pauseEndsAt && timingTable.pauseEndsAt > now);
      let displayFormattedTime = time.formatted;
      if (isTimedPause) {
        const pRem = Math.max(0, Math.floor((timingTable.pauseEndsAt - now) / 1000));
        const pMin = Math.floor(pRem / 60);
        const pSec = pRem % 60;
        displayFormattedTime = `${String(pMin).padStart(2, "0")}:${String(pSec).padStart(2, "0")}`;
      }

      let subtext = "Идёт уровень";
      if (timingTable.isColorUpActive && isTimedPause) subtext = "☕ Color-Up • Размен мелких фишек <100 (2 мин)";
      else if (isTimedPause) subtext = `☕ Перерыв (${Math.round(timingTable.pauseTotalSec / 60)} мин)`;
      else if (timingTable.status === "paused") subtext = "Пауза";
      else if (isFinalLevel) subtext = "Блайнды зафиксированы";
      else if (currentLevel.isBreak) subtext = "Перерыв 5 минут";
      else if (time.isAlert) subtext = "Смена блайндов через 30 сек";

      const digitsEl = card.querySelector(".timer-digits");
      if (digitsEl && digitsEl.textContent !== displayFormattedTime) {
        digitsEl.textContent = displayFormattedTime;
      }

      // Патчинг Time Rail
      const railFillEl = card.querySelector(".time-rail-fill");
      if (railFillEl) {
        const duration = timingTable.durationSec || 420;
        let progressPercent = 100;
        if (isTimedPause) {
          const pTotal = timingTable.pauseTotalSec || 120;
          const pRem = Math.max(0, Math.floor(((timingTable.pauseEndsAt || now) - now) / 1000));
          progressPercent = Math.max(0, Math.min(100, (pRem / pTotal) * 100));
        } else if (timingTable.status === "running" || timingTable.status === "paused") {
          progressPercent = Math.max(0, Math.min(100, (time.remaining / duration) * 100));
        }
        railFillEl.style.transform = `scaleX(${(progressPercent / 100).toFixed(4)})`;
        railFillEl.style.width = `${progressPercent.toFixed(1)}%`;
        if (railFillEl.classList && typeof railFillEl.classList.toggle === "function") {
          railFillEl.classList.toggle("is-warning", Boolean(time.isAlert && !isTimedPause));
        }
      }

      const subtextEl = card.querySelector(".timer-subtext");
      if (subtextEl && subtextEl.textContent !== subtext) {
        subtextEl.textContent = subtext;
      }

      const currentBlindsEl = card.querySelector(".blinds-number.current");
      const currentBlindsStr = `${currentLevel.sb} / ${currentLevel.bb}`;
      if (currentBlindsEl && currentBlindsEl.textContent !== currentBlindsStr) {
        currentBlindsEl.textContent = currentBlindsStr;
      }

      const anteBadgeEl = card.querySelector(".ante-badge");
      if (anteBadgeEl) {
        if (currentLevel.ante > 0) {
          anteBadgeEl.style.display = "inline-flex";
          const anteStr = `АНТЕ ${currentLevel.ante}`;
          if (anteBadgeEl.textContent !== anteStr) {
            anteBadgeEl.textContent = anteStr;
          }
        } else {
          anteBadgeEl.style.display = "none";
        }
      }

      const upcomingBlindsEl = card.querySelector(".blinds-number.upcoming");
      const upcomingStr = nextLevel ? `${nextLevel.sb} / ${nextLevel.bb}${nextLevel.ante > 0 ? ` (АНТЕ ${nextLevel.ante})` : ""}` : "—";
      if (upcomingBlindsEl && upcomingBlindsEl.textContent !== upcomingStr) {
        upcomingBlindsEl.textContent = upcomingStr;
      }

      const milestoneText = getTournamentMilestone(timingTable, structure, safeIndex, isFinalLevel, isTimedPause);
      const milestoneBadgeEl = card.querySelector(".floor-milestone-badge");
      if (milestoneBadgeEl && milestoneBadgeEl.textContent !== milestoneText) {
        milestoneBadgeEl.textContent = milestoneText;
      }

      const roundPill = card.querySelector(".round-pill");
      const roundText = (timingTable.isColorUpActive && isTimedPause) ? "COLOR-UP" : (isTimedPause ? "ПЕРЕРЫВ" : (isFinalLevel ? "ФИНАЛЬНЫЙ УРОВЕНЬ" : (currentLevel.isBreak ? "ПЕРЕРЫВ" : `УРОВЕНЬ ${currentLevel.level}`)));
      if (roundPill && roundPill.textContent !== roundText) {
        roundPill.textContent = roundText;
      }

      if (table.format === "MTT") {
        const playersPill = card.querySelector(".players-pill");
        const playersText = `👥 ${table.playersCount || 9}`;
        if (playersPill && playersPill.textContent !== playersText) {
          playersPill.textContent = playersText;
        }
      }

      if (card.classList && typeof card.classList.toggle === "function") {
        card.classList.toggle("state-alert", time.isAlert && !isTimedPause);
        card.classList.toggle("state-break", Boolean(isTimedPause || currentLevel.isBreak));
        card.classList.toggle("state-paused", timingTable.status === "paused" && !isTimedPause);
        card.classList.toggle("state-final-round", time.isOvertime);
        card.classList.toggle("countdown-pulse", isCountdownPulsing);
      }
    }
  });

  // Обновление верхнего МТТ бара
  if (isMttMode) {
    let totalPlayers = 0;
    let totalStarting = 0;
    activeMttTables.forEach(t => {
      totalPlayers += (t.playersCount !== undefined ? t.playersCount : 9);
      totalStarting += (t.initialPlayers !== undefined ? t.initialPlayers : 9);
    });

    const stack = 5000;
    const totalChips = (totalStarting || 9) * stack;
    const avgStack = totalPlayers > 0 ? Math.round(totalChips / totalPlayers) : stack;
    const firstT = activeMttTables.find(t => t.isMttMaster) || activeMttTables[0];
    const mttStructure = getTableStructure(firstT);
    const currentMttLvl = mttStructure[firstT ? (firstT.levelIndex || 0) : 0] || { bb: 50 };
    const currentBb = currentMttLvl.bb || 50;
    const avgStackBb = Math.round(avgStack / currentBb);

    const mttPlayersEl = document.getElementById("mtt-val-players");
    if (mttPlayersEl) mttPlayersEl.innerHTML = `${totalPlayers} <span class="mtt-stat-sub">/ ${totalStarting}</span>`;

    const mttChipsEl = document.getElementById("mtt-val-chips");
    if (mttChipsEl) mttChipsEl.textContent = totalChips.toLocaleString("ru-RU");
    
    const mttAvgEl = document.getElementById("mtt-val-avg");
    if (mttAvgEl) mttAvgEl.innerHTML = `${avgStack.toLocaleString("ru-RU")} <span class="mtt-stat-sub">(${avgStackBb} BB)</span>`;

    const mttTablesEl = document.getElementById("mtt-val-tables");
    if (mttTablesEl) mttTablesEl.textContent = activeMttTables.length;

    const bannerBox = document.getElementById("mtt-banner-box");
    if (bannerBox) {
      let bannerHtml = "";
      const hasConsolidationBreak = activeMttTables.some(t => t.isBreakActive && t.breakReason === "consolidation" && t.breakEndsAt > Date.now());
      if (hasConsolidationBreak) {
        bannerHtml = `
          <div class="mtt-break-ticker">
            ☕ <b>ПЕРЕРЫВ 15 МИНУТ:</b> Объединение столов. Пересадка игроков.
          </div>
        `;
      } else if (activeMttTables.length >= 2) {
        let maxT = activeMttTables[0];
        let minT = activeMttTables[0];
        activeMttTables.forEach(t => {
          const c = t.playersCount !== undefined ? t.playersCount : 9;
          if (c > (maxT.playersCount !== undefined ? maxT.playersCount : 9)) maxT = t;
          if (c < (minT.playersCount !== undefined ? minT.playersCount : 9)) minT = t;
        });
        const delta = (maxT.playersCount !== undefined ? maxT.playersCount : 9) - (minT.playersCount !== undefined ? minT.playersCount : 9);
        if (delta >= 2) {
          bannerHtml = `
            <div class="mtt-rebalance-ticker">
              ⚠️ <b>РЕБАЛАНС СТОЛОВ:</b> Пересадка игрока со стола ${maxT.dealerName || "Стол 1"} за стол ${minT.dealerName || "Стол 2"}
            </div>
          `;
        }
      }

      if (!bannerHtml && totalPlayers <= 10 && activeMttTables.length > 1) {
        bannerHtml = `
          <div class="mtt-final-ticker">
            🔥 <b>ФИНАЛЬНЫЙ СТОЛ СФОРМИРОВАН:</b> Объединение всех участников за столом ${firstT.dealerName || "Стол 1"}!
          </div>
        `;
      }

      if (bannerBox.innerHTML !== bannerHtml) {
        bannerBox.innerHTML = bannerHtml;
      }
    }
  }
}

function setActiveTables(tables) {
  ACTIVE_TABLES = tables || {};
  LAST_RENDERED_SIGNATURE = ""; // Сброс сигнатуры для обновления в тестах
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    setActiveTables,
    calculateTableTime,
    getTableStructure,
    getFormatLabel,
    renderTables,
    fetchTablesRest,
    playTournamentChime,
    playCountdownTick,
    unlockAudioContext,
    updateNetPingDisplay,
    initTvHotkeys,
    getTournamentMilestone,
    buildMttLobbyHtml,
    buildMttCinemaDeckHtml,
    renderMttCinemaMode,
    patchMttCinemaDeck,
    isTableStale,
    setCurrentMttSession: (s) => { CURRENT_MTT_SESSION = s; },
    getCurrentMttSession: () => CURRENT_MTT_SESSION
  };
}
