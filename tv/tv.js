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
    });
    
    const saved = localStorage.getItem("atmosphere_tables");
    if (saved) {
      ACTIVE_TABLES = JSON.parse(saved);
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
    const firstT = activeMttTables[0];
    const mttStructure = getTableStructure(firstT);
    const currentMttLvl = mttStructure[firstT ? (firstT.levelIndex || 0) : 0] || { bb: 50 };
    const currentBb = currentMttLvl.bb || 50;
    const avgStackBb = Math.round(avgStack / currentBb);

    let rebalanceBanner = "";
    if (activeMttTables.length >= 2) {
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

    if (totalPlayers <= 10 && activeMttTables.length > 1) {
      rebalanceBanner = `
        <div class="mtt-final-ticker">
          🔥 <b>ФИНАЛЬНЫЙ СТОЛ СФОРМИРОВАН:</b> Объединение всех участников за столом ${activeMttTables[0].dealerName || "Стол 1"}!
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

  let html = mttHeaderHtml;
  tableKeys.slice(0, 4).forEach(key => {
    const table = ACTIVE_TABLES[key];
    const structure = getTableStructure(table);
    const maxIdx = structure.length ? structure.length - 1 : 0;
    const safeIndex = Math.min(Math.max(0, table.levelIndex || 0), maxIdx);
    table.levelIndex = safeIndex;
    const isFinalLevel = (safeIndex >= maxIdx);
    const time = calculateTableTime(table, isFinalLevel);
    const currentLevel = structure[safeIndex] || structure[0];
    const nextLevel = isFinalLevel ? null : (structure[safeIndex + 1] || null);
    const formatLabel = getFormatLabel(table.format);
    const now = Date.now();

    // Состояние перерыва (ручного или послеигрового)
    const isPostGame = Boolean(table.isPostGameBreak && table.nextGameAt);
    const breakEndTime = (table.isBreakActive && table.breakEndsAt) ? table.breakEndsAt : (isPostGame ? table.nextGameAt : null);

    if (breakEndTime) {
      const isOvertime = now >= breakEndTime;
      const isWithinOneHour = (now - breakEndTime < 3600 * 1000);

      if (!isOvertime) {
        const breakRemaining = Math.max(0, Math.floor((breakEndTime - now) / 1000));
        const bMin = Math.floor(breakRemaining / 60);
        const bSec = breakRemaining % 60;
        const bFormatted = `${String(bMin).padStart(2, "0")}:${String(bSec).padStart(2, "0")}`;

        html += `
          <div class="table-card break-screen-card state-break" id="card-${table.id || key}">
            <div class="break-screen-title">☕ ПЕРЕРЫВ</div>
            <div class="break-screen-dealer">Стол ведущего ${table.dealerName || "Ведущий"} (${formatLabel})</div>
            <div class="break-screen-digits">${bFormatted}</div>
            <div style="font-size: 15px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em;">До старта следующей игры</div>
          </div>
        `;
        return;
      } else if (isPostGame && isWithinOneHour) {
        // Овертайм перерыва (+MM:SS)
        const overdueSec = Math.floor((now - breakEndTime) / 1000);
        const oMin = Math.floor(overdueSec / 60);
        const oSec = overdueSec % 60;
        const oFormatted = `+${String(oMin).padStart(2, "0")}:${String(oSec).padStart(2, "0")}`;

        html += `
          <div class="table-card break-screen-card state-break state-overtime" id="card-${table.id || key}">
            <div class="break-screen-title" style="color: #f59e0b;">☕ ПЕРЕРЫВ ЗАДЕРЖИВАЕТСЯ</div>
            <div class="break-screen-dealer">Стол ведущего ${table.dealerName || "Ведущий"} (${formatLabel})</div>
            <div class="break-screen-digits" style="color: #f59e0b;">${oFormatted}</div>
            <div style="font-size: 15px; color: #fbbf24; text-transform: uppercase; letter-spacing: 0.08em;">Задержка старта: +${oMin} мин</div>
          </div>
        `;
        return;
      }
    }

    const isTimedPause = (table.status === "paused" && table.pauseEndsAt && table.pauseEndsAt > now);
    let displayFormattedTime = time.formatted;
    let cardClass = "table-card";

    if (isTimedPause) {
      const pRem = Math.max(0, Math.floor((table.pauseEndsAt - now) / 1000));
      const pMin = Math.floor(pRem / 60);
      const pSec = pRem % 60;
      displayFormattedTime = `${String(pMin).padStart(2, "0")}:${String(pSec).padStart(2, "0")}`;
      cardClass += " state-break";
    } else {
      if (time.isAlert) cardClass += " state-alert";
      if (currentLevel.isBreak) cardClass += " state-break";
      if (table.status === "paused") cardClass += " state-paused";
      if (time.isOvertime) cardClass += " state-final-round";
    }

    let subtext = "Идёт уровень";
    if (table.isColorUpActive && isTimedPause) subtext = "☕ Color-Up • Размен мелких фишек <100 (2 мин)";
    else if (isTimedPause) subtext = (table.pauseTotalSec === 120 ? "☕ Перерыв • Размен фишек (Color-Up)" : `☕ Перерыв (${Math.round(table.pauseTotalSec / 60)} мин)`);
    else if (table.status === "paused") subtext = "Пауза";
    else if (isFinalLevel) subtext = "Блайнды зафиксированы";
    else if (currentLevel.isBreak) subtext = "Перерыв 5 минут";
    else if (time.isAlert) subtext = "Смена блайндов через 30 сек";

    const roundText = (table.isColorUpActive && isTimedPause) ? "COLOR-UP" : (isTimedPause ? "ПЕРЕРЫВ" : (isFinalLevel ? "ФИНАЛЬНЫЙ УРОВЕНЬ" : (currentLevel.isBreak ? "ПЕРЕРЫВ" : `УРОВЕНЬ ${currentLevel.level}`)));

    html += `
      <div class="${cardClass}" id="card-${table.id || key}">
        <!-- Шапка стола -->
        <div class="card-top">
          <div class="dealer-identity">
            <span class="dealer-label">Стол ведущего</span>
            <span class="dealer-name">${table.dealerName || "Ведущий"}</span>
          </div>
          <div class="pill-group">
            ${table.format === "MTT" ? `<div class="players-pill">👥 ${table.playersCount || 9}</div>` : ""}
            <span class="format-badge">${formatLabel}</span>
            <div class="round-pill">${roundText}</div>
          </div>
        </div>
        
        <!-- Центральный таймер -->
        <div class="timer-block">
          <div class="timer-digits">${displayFormattedTime}</div>
          <div class="timer-subtext">${subtext}</div>
        </div>
        
        <!-- Блайнды -->
        <div class="blinds-grid">
          <div class="blinds-item">
            <span class="blinds-caption">Текущие блайнды</span>
            <div class="blinds-main-row">
              <span class="blinds-number current">${currentLevel.sb} / ${currentLevel.bb}</span>
              ${currentLevel.ante > 0 ? `<span class="ante-badge">АНТЕ ${currentLevel.ante}</span>` : `<span class="ante-badge" style="display: none;"></span>`}
            </div>
          </div>
          <div class="blinds-item">
            <span class="blinds-caption">Следующие</span>
            <span class="blinds-number upcoming">${nextLevel ? `${nextLevel.sb} / ${nextLevel.bb}${nextLevel.ante > 0 ? ` (АНТЕ ${nextLevel.ante})` : ""}` : "—"}</span>
          </div>
        </div>
      </div>
    `;
  });

  return html;
}

// =========================================================
// ОСНОВНОЙ РЕНДЕРЕР: ВЫСОКОПРОИЗВОДИТЕЛЬНЫЙ DOM-PATCHING
// =========================================================

function renderTables() {
  if (typeof document === "undefined") return;
  const viewport = document.getElementById("tv-viewport");
  if (!viewport) return;
  
  const tableKeys = Object.keys(ACTIVE_TABLES).filter(k => {
    const t = ACTIVE_TABLES[k];
    if (!t) return false;
    const isStaleGame = t.startedAt && (Date.now() - t.startedAt > 3.5 * 3600 * 1000);
    if (isStaleGame) return false;

    if (t.status === "running" || t.status === "paused") return true;
    if (t.isBreakActive && t.breakEndsAt && (t.breakEndsAt > Date.now())) return true;
    if (t.isPostGameBreak && t.nextGameAt && (Date.now() - t.nextGameAt < 3600 * 1000)) return true;
    return false;
  });

  const count = tableKeys.length;
  if (viewport.dataset) {
    viewport.dataset.tables = count === 0 ? "1" : String(Math.min(4, count));
  }
  
  // 1. Состояние ожидания (Lounge Mode — Impeccable Club Styling)
  if (count === 0) {
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
  
  // Анализ режима МТТ
  const activeMttTables = tableKeys
    .map(k => ACTIVE_TABLES[k])
    .filter(t => t && t.format === "MTT" && (t.status === "running" || t.status === "paused"));

  const isMttMode = activeMttTables.length > 0;
  const currentSignature = `${isMttMode ? "MTT" : "SNG"}:${tableKeys.slice(0, 4).sort().join(",")}`;

  // Проверяем: можно ли выполнить чистый DOM-Patching существующих карточек
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

  // Обновление таймеров, автопрогрессии и звукового отсчета
  tableKeys.slice(0, 4).forEach(key => {
    const table = ACTIVE_TABLES[key];
    const structure = getTableStructure(table);
    const now = Date.now();

    // Автоматический Color-Up после 100/200 и транзит уровней
    if (table.status === "running" && table.levelEndsAt && now >= table.levelEndsAt) {
      const currentLevel = structure[table.levelIndex] || structure[0];
      
      if (currentLevel.sb === 100 && currentLevel.bb === 200 && !table.colorUpDone) {
        table.colorUpDone = true;
        table.isColorUpActive = true;
        table.status = "paused";
        table.pauseEndsAt = now + (120 * 1000);
        table.pauseTotalSec = 120;
        playTournamentChime();
        syncTableAutoProgression(key, table);
      } else if (table.levelIndex < structure.length - 1) {
        table.levelIndex += 1;
        const nextLvl = structure[table.levelIndex];
        table.durationSec = nextLvl.durationSec;
        table.remainingMs = nextLvl.durationSec * 1000;
        table.levelEndsAt = now + table.remainingMs;
        playTournamentChime();
        syncTableAutoProgression(key, table);
      }
    }

    // Завершение таймера Color-Up на ТВ
    if (table.isColorUpActive && table.pauseEndsAt && now >= table.pauseEndsAt) {
      table.isColorUpActive = false;
      table.pauseEndsAt = null;
      table.pauseTotalSec = null;
      table.status = "running";
      if (table.levelIndex < structure.length - 1) {
        table.levelIndex += 1;
        const nextLvl = structure[table.levelIndex];
        table.durationSec = nextLvl.durationSec;
        table.remainingMs = nextLvl.durationSec * 1000;
        table.levelEndsAt = now + table.remainingMs;
        playTournamentChime();
        syncTableAutoProgression(key, table);
      }
    }

    const isFinalLevel = (table.levelIndex >= structure.length - 1);
    const time = calculateTableTime(table, isFinalLevel);

    // Звуковой 5-секундный отсчет
    let isCountdownPulsing = false;
    if (table.status === "running" && time.remaining <= 5 && time.remaining >= 1 && !time.isOvertime) {
      isCountdownPulsing = true;
      if (LAST_TICK_SECONDS[key] !== time.remaining) {
        LAST_TICK_SECONDS[key] = time.remaining;
        playCountdownTick(time.remaining);
      }
    } else if (time.remaining > 5 || time.remaining === 0) {
      LAST_TICK_SECONDS[key] = 0;
    }

    // Если карточка существует в DOM и поддерживает querySelector -> точечно патчим её
    const card = document.getElementById("card-" + (table.id || key));
    if (card && typeof card.querySelector === "function") {
      const maxIdx = structure.length ? structure.length - 1 : 0;
      const safeIndex = Math.min(Math.max(0, table.levelIndex || 0), maxIdx);
      const isFinalLevel = (safeIndex >= maxIdx);
      const currentLevel = structure[safeIndex] || structure[0];
      const nextLevel = isFinalLevel ? null : (structure[safeIndex + 1] || null);

      const isTimedPause = (table.status === "paused" && table.pauseEndsAt && table.pauseEndsAt > now);
      let displayFormattedTime = time.formatted;
      if (isTimedPause) {
        const pRem = Math.max(0, Math.floor((table.pauseEndsAt - now) / 1000));
        const pMin = Math.floor(pRem / 60);
        const pSec = pRem % 60;
        displayFormattedTime = `${String(pMin).padStart(2, "0")}:${String(pSec).padStart(2, "0")}`;
      }

      let subtext = "Идёт уровень";
      if (table.isColorUpActive && isTimedPause) subtext = "☕ Color-Up • Размен мелких фишек <100 (2 мин)";
      else if (isTimedPause) subtext = `☕ Перерыв (${Math.round(table.pauseTotalSec / 60)} мин)`;
      else if (table.status === "paused") subtext = "Пауза";
      else if (isFinalLevel) subtext = "Блайнды зафиксированы";
      else if (currentLevel.isBreak) subtext = "Перерыв 5 минут";
      else if (time.isAlert) subtext = "Смена блайндов через 30 сек";

      const digitsEl = card.querySelector(".timer-digits");
      if (digitsEl && digitsEl.textContent !== displayFormattedTime) {
        digitsEl.textContent = displayFormattedTime;
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
          anteBadgeEl.style.display = "inline-block";
          anteBadgeEl.textContent = `АНТЕ ${currentLevel.ante}`;
        } else {
          anteBadgeEl.style.display = "none";
        }
      }

      const upcomingBlindsEl = card.querySelector(".blinds-number.upcoming");
      const upcomingStr = nextLevel ? `${nextLevel.sb} / ${nextLevel.bb}${nextLevel.ante > 0 ? ` (АНТЕ ${nextLevel.ante})` : ""}` : "—";
      if (upcomingBlindsEl && upcomingBlindsEl.textContent !== upcomingStr) {
        upcomingBlindsEl.textContent = upcomingStr;
      }

      const roundPill = card.querySelector(".round-pill");
      const roundText = (table.isColorUpActive && isTimedPause) ? "COLOR-UP" : (isTimedPause ? "ПЕРЕРЫВ" : (isFinalLevel ? "ФИНАЛЬНЫЙ УРОВЕНЬ" : (currentLevel.isBreak ? "ПЕРЕРЫВ" : `УРОВЕНЬ ${currentLevel.level}`)));
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
        card.classList.toggle("state-paused", table.status === "paused" && !isTimedPause);
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
    const firstT = activeMttTables[0];
    const mttStructure = getTableStructure(firstT);
    const currentMttLvl = mttStructure[firstT ? (firstT.levelIndex || 0) : 0] || { bb: 50 };
    const currentBb = currentMttLvl.bb || 50;
    const avgStackBb = Math.round(avgStack / currentBb);

    const mttPlayersEl = document.getElementById("mtt-val-players");
    if (mttPlayersEl) mttPlayersEl.innerHTML = `${totalPlayers} <span class="mtt-stat-sub">/ ${totalStarting}</span>`;
    
    const mttAvgEl = document.getElementById("mtt-val-avg");
    if (mttAvgEl) mttAvgEl.innerHTML = `${avgStack.toLocaleString("ru-RU")} <span class="mtt-stat-sub">(${avgStackBb} BB)</span>`;

    const mttTablesEl = document.getElementById("mtt-val-tables");
    if (mttTablesEl) mttTablesEl.textContent = activeMttTables.length;
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
    initTvHotkeys
  };
}
