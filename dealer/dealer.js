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

function sanitizeDealerKey(name) {
  const ru = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя";
  const en = ["a","b","v","g","d","e","e","zh","z","i","y","k","l","m","n","o","p","r","s","t","u","f","h","ts","ch","sh","sch","","y","","e","yu","ya"];
  const s = String(name || "dealer").toLowerCase().trim();
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const idx = ru.indexOf(s[i]);
    if (idx !== -1) {
      out += en[idx];
    } else if (/[a-z0-9_]/i.test(s[i])) {
      out += s[i];
    } else {
      out += "_";
    }
  }
  return "dealer_" + (out.replace(/_+/g, "_").replace(/^_|_$/g, "") || "host");
}

// Инициализация имени ведущего из Telegram WebApp и реестра
function initDealerIdentity() {
  let registry = (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG.DEALERS_REGISTRY)
    ? POKER_CONFIG.DEALERS_REGISTRY
    : { LIST: ["Арина", "Арташес", "Влад", "Всеволод", "Дима", "Маша", "Нинель", "Паша", "Рома", "Саша", "Тимур", "Эмилия"], MAP: {} };

  try {
    const cached = localStorage.getItem("atmosphere_dealers_registry");
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.MAP) {
        registry = {
          LIST: Array.from(new Set([...(registry.LIST || []), ...(parsed.LIST || [])])),
          MAP: Object.assign({}, registry.MAP || {}, parsed.MAP || {})
        };
      }
    }
  } catch (e) {}

  populateDealerSelectDropdown(registry.LIST);

  let isTelegramAuth = false;

  if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    try {
      tg.ready();
      tg.expand();
    } catch (e) {}
    
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
      const u = tg.initDataUnsafe.user;
      const uid = String(u.id || "");
      const uname = String(u.username || "").toLowerCase().replace(/^@/, "").trim();

      // Поиск по реестру Telegram ID / Username
      if (uname && registry.MAP[uname]) {
        DEALER_NAME = registry.MAP[uname];
        isTelegramAuth = true;
      } else if (uid && registry.MAP[uid]) {
        DEALER_NAME = registry.MAP[uid];
        isTelegramAuth = true;
      } else {
        // Пробуем динамически подтянуть актуальный реестр из Firebase
        fetchDynamicDealersRegistryAndRetry(uname, uid);
        return;
      }
    }
  }

  // Если открыто вне Telegram или неавторизован в Telegram: проверяем сессию PIN-авторизации
  if (!isTelegramAuth) {
    const isPinAuthed = (typeof sessionStorage !== "undefined" && sessionStorage.getItem("atmosphere_pin_auth") === "true");
    const savedName = (typeof sessionStorage !== "undefined" && sessionStorage.getItem("atmosphere_dealer_name")) 
      || (typeof localStorage !== "undefined" && localStorage.getItem("atmosphere_dealer_name"));

    // Поддержка query параметра ?dealer=... для авторизованных
    if (typeof window !== "undefined" && window.location && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const qDealer = params.get("dealer");
      if (qDealer && registry.LIST.includes(qDealer)) {
        DEALER_NAME = qDealer;
      }
    }

    if (!isPinAuthed) {
      showPinModal();
      return;
    }

    if (!DEALER_NAME && savedName && registry.LIST.includes(savedName)) {
      DEALER_NAME = savedName;
    }
  }

  if (!DEALER_NAME || DEALER_NAME === "Ведущий" || DEALER_NAME === "Гостевой ведущий") {
    DEALER_NAME = "Другое";
  }
  
  applyDealerIdentity();
}

function populateDealerSelectDropdown(dealerList) {
  if (typeof document === "undefined" || typeof document.createElement !== "function") return;
  const selectEl = document.getElementById("dealer-name-select");
  if (!selectEl) return;

  const currentVal = selectEl.value;
  selectEl.innerHTML = "";

  const list = (dealerList && dealerList.length) ? dealerList : ["Влад", "Дима", "Маша", "Саша", "Тест"];
  list.forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (name === DEALER_NAME || name === currentVal) {
      opt.selected = true;
    }
    selectEl.appendChild(opt);
  });

  // Опция для ведущего не из белого списка
  const otherOpt = document.createElement("option");
  otherOpt.value = "Другое";
  otherOpt.textContent = "👤 Другое";
  if (DEALER_NAME === "Другое" || !DEALER_NAME) {
    otherOpt.selected = true;
  }
  selectEl.appendChild(otherOpt);
}

function applyDealerIdentity() {
  DEALER_ID = sanitizeDealerKey(DEALER_NAME);
  const badgeEl = document.getElementById("dealer-badge");
  const nameEl = document.getElementById("identity-name");
  if (badgeEl) badgeEl.textContent = DEALER_NAME;
  if (nameEl) nameEl.textContent = DEALER_NAME;
}

async function fetchDynamicDealersRegistryAndRetry(uname, uid) {
  try {
    const firebaseUrl = (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG.FIREBASE_DB_URL)
      ? POKER_CONFIG.FIREBASE_DB_URL
      : "https://atmosphere-poker-default-rtdb.europe-west1.firebasedatabase.app";
    const res = await fetch(`${firebaseUrl}/atmosphere/dealers_registry.json`);
    if (res.ok) {
      const liveRegistry = await res.json();
      if (liveRegistry && liveRegistry.MAP) {
        try {
          localStorage.setItem("atmosphere_dealers_registry", JSON.stringify(liveRegistry));
        } catch (e) {}

        populateDealerSelectDropdown(liveRegistry.LIST);

        if (uname && liveRegistry.MAP[uname]) {
          DEALER_NAME = liveRegistry.MAP[uname];
          applyDealerIdentity();
          initDataSource();
          renderDealerView();
          return;
        } else if (uid && liveRegistry.MAP[uid]) {
          DEALER_NAME = liveRegistry.MAP[uid];
          applyDealerIdentity();
          initDataSource();
          renderDealerView();
          return;
        }
      }
    }
  } catch (err) {
    console.error("fetchDynamicDealersRegistryAndRetry error:", err);
  }

  // Если пользователя нет в базе — мягко открываем ввод Master PIN
  showPinModal("Ваш Telegram-аккаунт не найден в белом списке. Введите Master PIN (7777), чтобы войти как приглашённый ведущий:");
}

function showPinModal(customMessage) {
  const modal = document.getElementById("pin-auth-modal");
  const caption = document.getElementById("pin-modal-caption");
  if (caption && customMessage) {
    caption.textContent = customMessage;
  }
  if (modal) {
    modal.style.display = "flex";
    const input = document.getElementById("dealer-pin-input");
    if (input) {
      input.value = "";
      setTimeout(() => {
        if (input && typeof input.focus === "function") input.focus();
      }, 200);
      input.onkeydown = (e) => {
        if (e.key === "Enter") submitDealerPin();
      };
    }
  }
}

function submitDealerPin() {
  const input = document.getElementById("dealer-pin-input");
  const errorMsg = document.getElementById("pin-error-msg");
  const selectEl = document.getElementById("dealer-name-select");
  const enteredPin = input ? input.value.trim() : "";
  const expectedPin = (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG.MASTER_DEALER_PIN) 
    ? POKER_CONFIG.MASTER_DEALER_PIN 
    : "7777";

  if (enteredPin === expectedPin) {
    const selectedName = selectEl ? selectEl.value : "Другое";
    DEALER_NAME = selectedName || "Другое";

    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("atmosphere_pin_auth", "true");
      sessionStorage.setItem("atmosphere_dealer_name", DEALER_NAME);
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("atmosphere_dealer_name", DEALER_NAME);
    }

    const modal = document.getElementById("pin-auth-modal");
    if (modal) modal.style.display = "none";
    if (errorMsg) errorMsg.style.display = "none";
    
    applyDealerIdentity();
    initDataSource();
    renderDealerView();
    triggerHaptic("success");
  } else {
    if (errorMsg) errorMsg.style.display = "block";
    triggerHaptic("heavy");
    if (input) {
      input.value = "";
      input.focus();
    }
  }
}

function showAccessDenied(identifier) {
  if (typeof document === "undefined" || !document.body) return;
  document.body.innerHTML = `
    <div style="padding: 32px 24px; text-align: center; color: #f8fafc; font-family: sans-serif; min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center;">
      <div style="font-size: 54px; margin-bottom: 16px;">⛔️</div>
      <h2 style="font-size: 22px; font-weight: 800; margin-bottom: 12px;">Доступ ограничен</h2>
      <p style="font-size: 15px; color: #94a3b8; line-height: 1.6; max-width: 320px;">
        Ваш Telegram-аккаунт (<b>@${identifier || "неизвестный"}</b>) не найден в списке ведущих антикафе «Атмосфера».
      </p>
      <div style="margin-top: 24px;">
        <button type="button" class="btn btn-form-action" style="padding: 12px 24px; border-radius: 12px; font-size: 14px;" onclick="location.reload()">
          🔑 Ввести PIN-код ведущего
        </button>
      </div>
    </div>
  `;
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
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("storage", (e) => {
      if (e.key === "atmosphere_tables") {
        TABLES_STATE = JSON.parse(e.newValue || "{}");
        renderDealerView();
      }
    });
  }
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem("atmosphere_tables");
    if (saved) TABLES_STATE = JSON.parse(saved);
  }
}

let PENDING_SYNC_TIMEOUT = null;

function saveState() {
  const myTable = getMyTable();
  if (typeof localStorage !== "undefined") {
    try {
      let localTables = {};
      try {
        localTables = JSON.parse(localStorage.getItem("atmosphere_tables") || "{}");
      } catch (e) {}
      localTables[DEALER_ID] = myTable;
      localStorage.setItem("atmosphere_tables", JSON.stringify(localTables));
      localStorage.setItem("atmosphere_pending_sync", "true");
      localStorage.setItem("atmosphere_pending_sync_" + DEALER_ID, "true");
    } catch (e) {}
  }

  flushPendingSync();
}

function flushPendingSync() {
  const isPending = (typeof localStorage !== "undefined" && 
    (localStorage.getItem("atmosphere_pending_sync_" + DEALER_ID) === "true" || localStorage.getItem("atmosphere_pending_sync") === "true"));
  if (!isPending) return Promise.resolve(true);

  const myTable = getMyTable();

  // 1. WebSocket SDK: пишем СТРОГО в свой узел atmosphere/tables/${DEALER_ID}
  if (typeof firebase !== "undefined" && firebase.apps && firebase.apps.length > 0) {
    return firebase.database().ref("atmosphere/tables/" + encodeURIComponent(DEALER_ID)).set(myTable)
      .then(() => {
        if (typeof localStorage !== "undefined") {
          localStorage.removeItem("atmosphere_pending_sync_" + DEALER_ID);
          localStorage.removeItem("atmosphere_pending_sync");
        }
        return true;
      })
      .catch((err) => {
        schedulePendingSyncRetry();
        return false;
      });
  }

  // 2. REST fallback: пишем СТРОГО в свой узел PUT /atmosphere/tables/${DEALER_ID}.json
  const dbUrl = (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG.FIREBASE_DB_URL)
    ? POKER_CONFIG.FIREBASE_DB_URL
    : "https://atmosphere-poker-default-rtdb.europe-west1.firebasedatabase.app";

  if (typeof fetch === "function") {
    return fetch(`${dbUrl}/atmosphere/tables/${encodeURIComponent(DEALER_ID)}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(myTable)
    })
    .then(res => {
      if (res.ok) {
        if (typeof localStorage !== "undefined") {
          localStorage.removeItem("atmosphere_pending_sync_" + DEALER_ID);
          localStorage.removeItem("atmosphere_pending_sync");
        }
        return true;
      } else {
        schedulePendingSyncRetry();
        return false;
      }
    })
    .catch(() => {
      schedulePendingSyncRetry();
      return false;
    });
  }

  return Promise.resolve(false);
}

function schedulePendingSyncRetry() {
  if (PENDING_SYNC_TIMEOUT) return;
  PENDING_SYNC_TIMEOUT = setTimeout(() => {
    PENDING_SYNC_TIMEOUT = null;
    flushPendingSync();
  }, 3000);
  if (PENDING_SYNC_TIMEOUT && typeof PENDING_SYNC_TIMEOUT.unref === "function") {
    PENDING_SYNC_TIMEOUT.unref();
  }
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("online", () => flushPendingSync());
  const syncInterval = setInterval(() => {
    if (typeof localStorage !== "undefined" && localStorage.getItem("atmosphere_pending_sync") === "true") {
      flushPendingSync();
    }
  }, 5000);
  if (syncInterval && typeof syncInterval.unref === "function") {
    syncInterval.unref();
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
  let config = null;
  if (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG && POKER_CONFIG.BLIND_STRUCTURES) {
    config = POKER_CONFIG;
  } else if (typeof window !== "undefined" && window.POKER_CONFIG && window.POKER_CONFIG.BLIND_STRUCTURES) {
    config = window.POKER_CONFIG;
  } else if (typeof require === "function") {
    try { config = require("../shared/poker-config.js"); } catch (e) {}
  }

  if (config && config.BLIND_STRUCTURES) {
    return config.BLIND_STRUCTURES[structKey] || config.BLIND_STRUCTURES.SNG_STANDARD;
  }
  if (config && config.SNG_STRUCTURE) {
    return config.SNG_STRUCTURE;
  }
  return {
    name: "5 000 стек / 7 мин (BBA)",
    stack: 5000,
    levels: [
      { level: 1, sb: 25, bb: 50, ante: 0, durationSec: 420, label: "25 / 50" },
      { level: 2, sb: 50, bb: 100, ante: 0, durationSec: 420, label: "50 / 100" }
    ]
  };
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
  table.remainingMs = table.durationSec * 1000;
  table.levelEndsAt = Date.now() + table.remainingMs;
  table.elapsedBeforePause = 0;
  table.isPostGameBreak = false;
  table.createdAt = Date.now();

  saveState();
  renderDealerView();
}

// 2. Пауза / Возобновление с миллисекундной точностью (без скачков вперед)
function togglePause() {
  triggerHaptic("medium");
  const table = getMyTable();
  const now = Date.now();

  if (table.status === "running") {
    table.status = "paused";
    let remainingMs = 0;
    if (table.levelEndsAt) {
      remainingMs = Math.max(0, table.levelEndsAt - now);
    } else if (table.startedAt) {
      remainingMs = Math.max(0, (table.durationSec * 1000) - (now - table.startedAt));
    } else {
      remainingMs = (table.durationSec || 420) * 1000;
    }
    table.remainingMs = remainingMs;
    table.elapsedBeforePause = Math.max(0, (table.durationSec || 420) - Math.ceil(remainingMs / 1000));
    table.startedAt = null;
    table.levelEndsAt = null;
    table.pauseEndsAt = null;
    table.pauseTotalSec = null;
  } else if (table.status === "paused") {
    table.status = "running";
    table.pauseEndsAt = null;
    table.pauseTotalSec = null;
    table.startedAt = now;
    const remainingMs = (table.remainingMs !== undefined && table.remainingMs !== null)
      ? table.remainingMs
      : Math.max(0, ((table.durationSec || 420) - (table.elapsedBeforePause || 0)) * 1000);
    table.remainingMs = remainingMs;
    table.levelEndsAt = now + remainingMs;
  }
  saveState();
  renderDealerView();
}

// 2.1. Запуск быстрой таймированной паузы (Color-Up / Перерыв)
function startTimedPause(seconds = 120) {
  triggerHaptic("heavy");
  const table = getMyTable();
  const now = Date.now();
  if (table.status === "running") {
    let remainingMs = 0;
    if (table.levelEndsAt) {
      remainingMs = Math.max(0, table.levelEndsAt - now);
    } else {
      remainingMs = Math.max(0, ((table.durationSec || 420) - (table.elapsedBeforePause || 0)) * 1000);
    }
    table.remainingMs = remainingMs;
    table.elapsedBeforePause = Math.max(0, (table.durationSec || 420) - Math.ceil(remainingMs / 1000));
    table.startedAt = null;
    table.levelEndsAt = null;
  }
  table.status = "paused";
  table.pauseEndsAt = now + seconds * 1000;
  table.pauseTotalSec = seconds;
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
    table.remainingMs = table.durationSec * 1000;
    table.elapsedBeforePause = 0;
    table.startedAt = Date.now();
    table.levelEndsAt = Date.now() + (table.durationSec * 1000);
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

// 5. Завершение игры -> переход в режим Post-Game
function finishGame() {
  triggerHaptic("success");
  const table = getMyTable();
  table.status = "finished";
  table.isBreakActive = false;
  table.breakEndsAt = null;
  table.isPostGameBreak = false;
  table.nextGameAt = null;
  table.startedAt = null;
  table.elapsedBeforePause = 0;
  saveState();
  renderDealerView();
}

function openGoogleForm() {
  triggerHaptic("medium");
  const url = generatePreFilledFormUrl();
  window.open(url, "_blank");
}

function startPostGameBreak(minutes = 10) {
  triggerHaptic("medium");
  const table = getMyTable();
  table.isPostGameBreak = true;
  table.postGameBreakMinutes = minutes;
  table.nextGameAt = Date.now() + minutes * 60 * 1000;
  saveState();
  renderDealerView();
}

function stopPostGameBreak() {
  triggerHaptic("heavy");
  const table = getMyTable();
  table.isPostGameBreak = false;
  table.nextGameAt = null;
  saveState();
  renderDealerView();
}

function startNewGameFromPostGame() {
  triggerHaptic("medium");
  const table = getMyTable();
  table.status = "idle";
  table.isPostGameBreak = false;
  table.nextGameAt = null;
  table.startedAt = null;
  saveState();
  renderDealerView();
}

// Генерация предзаполненной Google Form на основе формата турнира
function generatePreFilledFormUrl() {
  const table = getMyTable();
  const format = (table.format || SELECTED_FORMAT || "SnG").toUpperCase();
  const today = new Date().toISOString().split("T")[0];

  let baseUrl = "https://docs.google.com/forms/d/e/1FAIpQLSfCfnN2LS4mAmbQfPtBLZGxPoiYfSqNoaX5xLrmyBr3S5FiEg/viewform";
  if (format === "MTT") {
    baseUrl = "https://docs.google.com/forms/d/e/1FAIpQLSeIDDkj2iCPtMZm-0K5YdZFlopAR7aPfRer2n1o-FQD-Dr7FQ/viewform";
  } else if (format === "MYSTERY" || format === "MYSTERY BOUNTY") {
    baseUrl = "https://docs.google.com/forms/d/e/1FAIpQLScFJXRH7bgb2W2aCOeSAKYfL-m4odE14HM5a2eWGz8to4QIlA/viewform";
  } else if (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG.FORMS && POKER_CONFIG.FORMS[format]) {
    baseUrl = POKER_CONFIG.FORMS[format].viewUrl;
  }
  
  return baseUrl + "?usp=pp_url&entry.1615126251=" + encodeURIComponent(today) +
    "&entry.1887911518=" + encodeURIComponent(DEALER_NAME);
}

// МТТ управление игроками
function adjustPlayers(delta) {
  triggerHaptic("light");
  const table = getMyTable();
  table.playersCount = Math.max(1, Math.min(12, (table.playersCount || 9) + delta));
  saveState();
  renderDealerView();
}

// Выбивание игрока (Аут)
function eliminatePlayer() {
  triggerHaptic("heavy");
  const table = getMyTable();
  table.playersCount = Math.max(1, (table.playersCount || 9) - 1);
  saveState();
  renderDealerView();
  checkMttRebalance();
}

// Проверка необходимости ребаланса между столами
function checkMttRebalance() {
  const currentTable = getMyTable();
  if (currentTable.format !== "MTT" || currentTable.status !== "running") return;

  const mttTables = Object.keys(TABLES_STATE)
    .map(k => TABLES_STATE[k])
    .filter(t => t && t.format === "MTT" && t.status === "running");

  if (mttTables.length < 2) return;

  // Ищем стол с максимумом и минимумом игроков
  let maxTable = mttTables[0];
  let minTable = mttTables[0];

  mttTables.forEach(t => {
    const count = t.playersCount || 9;
    if (count > (maxTable.playersCount || 9)) maxTable = t;
    if (count < (minTable.playersCount || 9)) minTable = t;
  });

  const delta = (maxTable.playersCount || 9) - (minTable.playersCount || 9);

  // Если разница 2 и более игроков -> запускаем ребаланс
  if (delta >= 2) {
    if (currentTable.id === maxTable.id) {
      TARGET_REBALANCE_TABLE_KEY = minTable.id;
      rerollRebalanceBox();
      showRebalanceModal(minTable.dealerName || "второй стол");
    }
  }
}

function rerollRebalanceBox() {
  const table = getMyTable();
  const activeSeats = Math.max(1, Math.min(10, table.playersCount || 9));
  CURRENT_REBALANCE_BOX = Math.floor(Math.random() * activeSeats) + 1;
  const boxEl = document.getElementById("rebalance-box-num");
  if (boxEl) boxEl.textContent = `№ ${CURRENT_REBALANCE_BOX}`;
}

function showRebalanceModal(targetDealer) {
  const modal = document.getElementById("rebalance-modal");
  const targetEl = document.getElementById("rebalance-target-dealer");
  if (targetEl) targetEl.textContent = targetDealer;
  if (modal) modal.style.display = "flex";
}

function confirmRebalance() {
  triggerHaptic("success");
  const currentTable = getMyTable();
  currentTable.playersCount = Math.max(1, (currentTable.playersCount || 9) - 1);

  if (TARGET_REBALANCE_TABLE_KEY && TABLES_STATE[TARGET_REBALANCE_TABLE_KEY]) {
    TABLES_STATE[TARGET_REBALANCE_TABLE_KEY].playersCount = (TABLES_STATE[TARGET_REBALANCE_TABLE_KEY].playersCount || 9) + 1;
  }

  saveState();
  const modal = document.getElementById("rebalance-modal");
  if (modal) modal.style.display = "none";
  renderDealerView();
}

// Автоматическое переключение уровней блайндов по истечении таймера (стандарт TDv3)
function checkAutoLevelProgression() {
  const table = getMyTable();
  if (table.status !== "running" || !table.levelEndsAt) return;
  const now = Date.now();
  if (now >= table.levelEndsAt) {
    const struct = getActiveStructure(table.structKey || SELECTED_STRUCT);
    const levels = (struct && struct.levels) ? struct.levels : [];
    if (table.levelIndex < levels.length - 1) {
      table.levelIndex += 1;
      const nextLvl = levels[table.levelIndex];
      table.durationSec = nextLvl.durationSec;
      table.remainingMs = nextLvl.durationSec * 1000;
      table.levelEndsAt = now + table.remainingMs;
      table.elapsedBeforePause = 0;
      saveState();
      triggerHaptic("success");
    }
  }
}

// Отрисовка состояния пульта
function renderDealerView() {
  checkAutoLevelProgression();
  const table = getMyTable();
  const struct = getActiveStructure(table.structKey || SELECTED_STRUCT);
  const levels = (struct && struct.levels) ? struct.levels : [];
  const currentLvl = levels[table.levelIndex || 0] || levels[0] || { durationSec: 420, label: "25 / 50", level: 1 };
  const nextLvl = levels[(table.levelIndex || 0) + 1] || null;

  const roundEl = document.getElementById("identity-round");
  const blindsValEl = document.getElementById("blinds-current");
  const nextBlindsValEl = document.getElementById("blinds-next");
  const digitsEl = document.getElementById("timer-digits");
  const statusEl = document.getElementById("timer-status");
  const setupPanel = document.getElementById("setup-panel");
  const controlCard = document.getElementById("control-card");
  const gameBtnStack = document.getElementById("game-btn-stack");
  const postGamePanel = document.getElementById("post-game-panel");
  const runningRow = document.getElementById("running-btn-row");
  const pauseBtn = document.getElementById("btn-pause");
  const colorUpBtn = document.getElementById("btn-colorup");
  const resetBtn = document.getElementById("btn-reset");
  const finishBtn = document.getElementById("btn-finish");

  const postBreakButtons = document.getElementById("post-break-buttons");
  const postBreakActive = document.getElementById("post-break-active");
  const postBreakDigits = document.getElementById("post-break-digits");

  // МТТ панель
  const mttBox = document.getElementById("mtt-control-box");
  const mttVal = document.getElementById("mtt-players-val");
  if (mttBox) {
    const isMtt = (table.format === "MTT" || SELECTED_FORMAT === "MTT");
    mttBox.style.display = (isMtt && (table.status === "running" || table.status === "paused")) ? "flex" : "none";
  }
  if (mttVal) {
    mttVal.textContent = table.playersCount || 9;
  }

  if (roundEl) {
    if (table.status === "finished") roundEl.textContent = "ФИНИШ";
    else roundEl.textContent = currentLvl.isBreak ? "ПЕРЕРЫВ" : `УРОВЕНЬ ${currentLvl.level}`;
  }
  if (blindsValEl) blindsValEl.textContent = currentLvl.label;
  if (nextBlindsValEl) nextBlindsValEl.textContent = nextLvl ? nextLvl.label : "ФИНАЛ";

  // Расчет времени по абсолютным меткам (без дрифта при сворачивании и без скачков при паузе)
  let remaining = currentLvl.durationSec;
  let totalElapsed = table.elapsedBeforePause || 0;
  if (table.status === "running") {
    if (table.levelEndsAt) {
      remaining = Math.max(0, Math.ceil((table.levelEndsAt - Date.now()) / 1000));
      totalElapsed = Math.max(0, table.durationSec - remaining);
    } else if (table.startedAt) {
      const elapsedNow = Math.floor((Date.now() - table.startedAt) / 1000);
      totalElapsed += elapsedNow;
      remaining = Math.max(0, table.durationSec - totalElapsed);
    }
  } else if (table.status === "paused") {
    if (table.remainingMs !== undefined && table.remainingMs !== null) {
      remaining = Math.max(0, Math.ceil(table.remainingMs / 1000));
      totalElapsed = Math.max(0, table.durationSec - remaining);
    } else {
      remaining = Math.max(0, table.durationSec - (table.elapsedBeforePause || 0));
    }
  }

  // Проверка таймированной паузы в игре (Color-Up)
  const isTimedPause = (table.status === "paused" && table.pauseEndsAt && table.pauseEndsAt > Date.now());
  if (isTimedPause) {
    const pRem = Math.max(0, Math.floor((table.pauseEndsAt - Date.now()) / 1000));
    const pMin = Math.floor(pRem / 60);
    const pSec = pRem % 60;
    if (digitsEl) {
      digitsEl.textContent = `${String(pMin).padStart(2, "0")}:${String(pSec).padStart(2, "0")}`;
      digitsEl.style.color = "#fbbf24";
    }
  } else if (table.status !== "finished") {
    const min = Math.floor(remaining / 60);
    const sec = remaining % 60;
    if (digitsEl) {
      digitsEl.textContent = `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
      digitsEl.style.color = "";
    }
  }

  if (table.status === "running") {
    if (setupPanel) setupPanel.style.display = "none";
    if (controlCard) controlCard.style.display = "block";
    if (gameBtnStack) gameBtnStack.style.display = "flex";
    if (postGamePanel) postGamePanel.style.display = "none";
    if (statusEl) statusEl.textContent = "🟢 Идёт игра";
    if (runningRow) runningRow.style.display = "grid";
    if (colorUpBtn) colorUpBtn.style.display = "flex";
    if (pauseBtn) pauseBtn.textContent = "⏸ Пауза";
    if (finishBtn) finishBtn.style.display = "flex";

    // Кнопка сброса (первые 3 минуты 1 раунда)
    if (resetBtn) {
      resetBtn.style.display = (table.levelIndex === 0 && totalElapsed <= 180) ? "flex" : "none";
    }
  } else if (table.status === "paused") {
    if (setupPanel) setupPanel.style.display = "none";
    if (controlCard) controlCard.style.display = "block";
    if (gameBtnStack) gameBtnStack.style.display = "flex";
    if (postGamePanel) postGamePanel.style.display = "none";
    if (statusEl) {
      statusEl.textContent = isTimedPause ? "☕ Перерыв • Color-Up" : "⏸ На паузе";
    }
    if (runningRow) runningRow.style.display = "grid";
    if (colorUpBtn) colorUpBtn.style.display = "none";
    if (pauseBtn) pauseBtn.textContent = "▶️ Продолжить";
    if (finishBtn) finishBtn.style.display = "flex";

    if (resetBtn) {
      resetBtn.style.display = (table.levelIndex === 0 && totalElapsed <= 180) ? "flex" : "none";
    }
  } else if (table.status === "finished") {
    if (setupPanel) setupPanel.style.display = "none";
    if (controlCard) controlCard.style.display = "block";
    if (gameBtnStack) gameBtnStack.style.display = "none";
    if (postGamePanel) postGamePanel.style.display = "flex";

    // Обработка перерыва после игры
    if (table.isPostGameBreak && table.nextGameAt && table.nextGameAt > Date.now()) {
      const remBreak = Math.max(0, Math.floor((table.nextGameAt - Date.now()) / 1000));
      const bMin = Math.floor(remBreak / 60);
      const bSec = remBreak % 60;
      const bFormatted = `${String(bMin).padStart(2, "0")}:${String(bSec).padStart(2, "0")}`;
      if (postBreakButtons) postBreakButtons.style.display = "none";
      if (postBreakActive) postBreakActive.style.display = "block";
      if (postBreakDigits) postBreakDigits.textContent = bFormatted;
      if (digitsEl) {
        digitsEl.textContent = bFormatted;
        digitsEl.style.color = "#fbbf24";
      }
      if (statusEl) statusEl.textContent = "☕ Перерыв перед следующей игрой";
    } else {
      if (postBreakButtons) postBreakButtons.style.display = "grid";
      if (postBreakActive) postBreakActive.style.display = "none";
      if (digitsEl) {
        digitsEl.textContent = "00:00";
        digitsEl.style.color = "";
      }
      if (statusEl) statusEl.textContent = "🏁 Игра завершена";
    }
  } else {
    // idle -> показываем экран выбора параметров
    if (setupPanel) setupPanel.style.display = "flex";
    if (controlCard) controlCard.style.display = "none";
  }
}

// Автоматическое восстановление состояния при разблокировке телефона или возврате во вкладку
if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      loadState();
      renderDealerView();
    }
  });
}
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("focus", () => {
    loadState();
    renderDealerView();
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    initDealerIdentity,
    getMyTable,
    startTable,
    togglePause,
    startTimedPause,
    nextLevel,
    resetTable,
    finishGame,
    startPostGameBreak,
    stopPostGameBreak,
    startNewGameFromPostGame,
    generatePreFilledFormUrl,
    getActiveStructure,
    submitDealerPin,
    showPinModal,
    showAccessDenied,
    saveState,
    flushPendingSync,
    adjustPlayers,
    eliminatePlayer,
    checkMttRebalance,
    rerollRebalanceBox,
    confirmRebalance,
    checkAutoLevelProgression
  };
}
