/**
 * DEALER CONTROLLER LOGIC (Telegram Mini App)
 * Антикафе «Атмосфера» — Direct-to-Firebase Realtime Architecture
 */

// Автоматическая сетевая изоляция при запуске в среде Node.js (тестовые раннеры)
if (typeof window === "undefined" && typeof require === "function") {
  try {
    require("../tests/network_guard.js");
  } catch (e) {}
}

let DEALER_NAME = "Ведущий";
let DEALER_ID = "dealer_vlad";
let SELECTED_FORMAT = "SnG";
let SELECTED_STRUCT = "SNG_DEEP_1500";
let CURRENT_PREVIEW_STRUCT = "SNG_DEEP_1500";
let DEALER_CHAT_ID = null;
let LAST_PAUSE_CLICK_TS = 0;
let IS_MTT_MASTER = true;
let MTT_SETUP_PLAYERS = 9;
let DISSOLVE_TARGET_TABLE_KEY = null;
let TABLES_STATE = {};
let CURRENT_MTT_SESSION = null;
let SERVER_TIME_OFFSET = 0;

function getSyncedNow() {
  return Date.now() + SERVER_TIME_OFFSET;
}


if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("DOMContentLoaded", () => {
    initDealerIdentity();
    initPillSelectors();
    initNotifyToggle();
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

      if (uid) {
        DEALER_CHAT_ID = uid;
        const myTbl = getMyTable();
        if (myTbl) myTbl.dealerChatId = uid;
      }

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

    // Поддержка query параметра ?dealer=... для авторизованных и быстрого тестирования
    if (typeof window !== "undefined" && window.location && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const qDealer = params.get("dealer");
      if (qDealer) {
        DEALER_NAME = qDealer;
        isTelegramAuth = true;
      }
    }

    if (!isTelegramAuth && !isPinAuthed) {
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

  // Если пользователя нет в белом списке — строго блокируем доступ
  showAccessDenied(uname || uid);
}

function showPinModal(customMessage) {
  // Устаревший метод: вход по PIN выведен из эксплуатации в пользу белого списка
  showAccessDenied();
}

function submitDealerPin() {
  // Устаревший метод: вход по PIN выведен из эксплуатации
  return false;
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
      <p style="font-size: 13px; color: #64748b; margin-top: 12px; line-height: 1.5; max-width: 300px;">
        Для получения доступа обратитесь к администратору клуба, чтобы внести ваш Telegram в реестр ведущих.
      </p>
    </div>
  `;
}

function triggerHaptic(type = "light") {
  if (typeof window !== "undefined" && window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
    try {
      if (type === "medium") window.Telegram.WebApp.HapticFeedback.impactOccurred("medium");
      else if (type === "heavy") window.Telegram.WebApp.HapticFeedback.impactOccurred("heavy");
      else if (type === "success") window.Telegram.WebApp.HapticFeedback.notificationOccurred("success");
      else window.Telegram.WebApp.HapticFeedback.impactOccurred("light");
    } catch (e) {}
  }
}

// Динамическое переключение видимости структур по формату турнира
// Динамическое переключение видимости структур по формату турнира
function updateStructureVisibilityForFormat(format) {
  const classicCard = document.getElementById("struct-card-classic");
  const proCard = document.getElementById("struct-card-pro");
  const mttCard = document.getElementById("struct-card-mtt");

  const isMtt = (format === "MTT");

  if (isMtt) {
    // Для МТТ: скрываем классику и про, показываем строго MTT Pro
    if (classicCard) {
      classicCard.style.display = "none";
      if (classicCard.classList && typeof classicCard.classList.add === "function") {
        classicCard.classList.add("hidden");
      }
    }
    if (proCard) {
      proCard.style.display = "none";
      if (proCard.classList && typeof proCard.classList.add === "function") {
        proCard.classList.add("hidden");
      }
    }
    if (mttCard) {
      mttCard.style.display = "flex";
      if (mttCard.classList) {
        if (typeof mttCard.classList.remove === "function") mttCard.classList.remove("hidden");
        if (typeof mttCard.classList.add === "function") mttCard.classList.add("active", "locked");
      }
    }
    SELECTED_STRUCT = "MTT_PRO_5000";
  } else {
    // Для SnG и Mystery: скрываем MTT Pro, показываем Классику и Про
    if (mttCard) {
      mttCard.style.display = "none";
      if (mttCard.classList) {
        if (typeof mttCard.classList.add === "function") mttCard.classList.add("hidden");
        if (typeof mttCard.classList.remove === "function") mttCard.classList.remove("active", "locked");
      }
    }
    if (classicCard) {
      classicCard.style.display = "flex";
      if (classicCard.classList && typeof classicCard.classList.remove === "function") {
        classicCard.classList.remove("hidden");
      }
    }
    if (proCard) {
      proCard.style.display = "flex";
      if (proCard.classList && typeof proCard.classList.remove === "function") {
        proCard.classList.remove("hidden");
      }
    }

    if (SELECTED_STRUCT === "MTT_PRO_5000" || !SELECTED_STRUCT) {
      SELECTED_STRUCT = "SNG_DEEP_1500";
    }

    if (classicCard && proCard) {
      if (classicCard.classList && typeof classicCard.classList.toggle === "function") {
        classicCard.classList.toggle("active", SELECTED_STRUCT === "SNG_DEEP_1500");
      }
      if (proCard.classList && typeof proCard.classList.toggle === "function") {
        proCard.classList.toggle("active", SELECTED_STRUCT === "SNG_STANDARD");
      }
    }
  }

  const table = getMyTable();
  if (table) {
    table.format = format;
    table.structKey = SELECTED_STRUCT;
  }
}

let APP_TOAST_TIMER = null;

function showAppToast(message, icon = "⚠️") {
  if (typeof document === "undefined") return;
  const toast = document.getElementById("app-toast");
  const msgEl = document.getElementById("app-toast-msg");
  const iconEl = document.getElementById("app-toast-icon");
  if (!toast) return;

  if (msgEl) msgEl.textContent = message;
  if (iconEl) iconEl.textContent = icon;
  toast.style.display = "flex";

  if (APP_TOAST_TIMER) clearTimeout(APP_TOAST_TIMER);
  APP_TOAST_TIMER = setTimeout(() => {
    if (toast) toast.style.display = "none";
  }, 2800);
}

// Инициализация селекторов формата и структуры
function initPillSelectors() {
  const formatPills = document.querySelectorAll("#format-pills .pill");
  const mttSetupBlock = document.getElementById("mtt-setup-block");

  // Защита: если сохранен MTT, сбрасываем на SnG
  if (SELECTED_FORMAT === "MTT") {
    SELECTED_FORMAT = "SnG";
  }

  // Инициализируем правильное состояние при старте
  updateStructureVisibilityForFormat(SELECTED_FORMAT);

  formatPills.forEach(pill => {
    pill.addEventListener("click", () => {
      // Заглушка для формата MTT (в разработке)
      if (pill.dataset.disabled === "true" || pill.dataset.format === "MTT" || (pill.classList && pill.classList.contains("is-disabled"))) {
        triggerHaptic("heavy");
        showAppToast("⚠️ Режим МТТ в разработке. Доступны форматы SnG и Mystery Bounty");
        // Принудительно удерживаем активную плашку выбранного формата
        const safeFormat = (SELECTED_FORMAT === "MTT" ? "SnG" : SELECTED_FORMAT);
        SELECTED_FORMAT = safeFormat;
        formatPills.forEach(p => {
          if (p.classList && typeof p.classList.toggle === "function") {
            p.classList.toggle("active", p.dataset.format === safeFormat);
          }
        });
        return;
      }

      formatPills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      SELECTED_FORMAT = pill.dataset.format;
      const table = getMyTable();
      table.format = SELECTED_FORMAT;

      // Обновляем видимость карточек структур
      updateStructureVisibilityForFormat(SELECTED_FORMAT);

      // Показ / скрытие блока параметров МТТ
      if (SELECTED_FORMAT === "MTT") {
        if (mttSetupBlock) mttSetupBlock.style.display = "flex";
      } else {
        if (mttSetupBlock) mttSetupBlock.style.display = "none";
      }
      triggerHaptic("light");
      saveState();
      renderDealerView();
    });
  });

  const savedStruct = (typeof localStorage !== "undefined") ? localStorage.getItem("atmosphere_dealer_struct") : null;
  if (savedStruct) {
    const cfg = (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG.BLIND_STRUCTURES) ? POKER_CONFIG.BLIND_STRUCTURES : null;
    if (cfg && cfg[savedStruct]) {
      SELECTED_STRUCT = savedStruct;
    }
  }

  const structPills = document.querySelectorAll("#struct-pills .pill");
  if (structPills && structPills.length > 0) {
    structPills.forEach(p => {
      if (p.classList && typeof p.classList.toggle === "function") {
        p.classList.toggle("active", p.dataset && p.dataset.struct === SELECTED_STRUCT);
      }
    });
  } else if (typeof document !== "undefined" && typeof document.querySelector === "function") {
    const activeStructPill = document.querySelector("#struct-pills .pill.active");
    if (activeStructPill && activeStructPill.dataset && activeStructPill.dataset.struct && !savedStruct) {
      SELECTED_STRUCT = activeStructPill.dataset.struct;
    }
  }

  structPills.forEach(pill => {
    pill.addEventListener("click", () => {
      if (pill.classList.contains("locked")) return;
      const targetStruct = pill.dataset.struct;
      const allowed = (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG.getAllowedStructuresForFormat)
        ? POKER_CONFIG.getAllowedStructuresForFormat(SELECTED_FORMAT)
        : null;
      if (allowed && !allowed.includes(targetStruct)) return;

      structPills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      SELECTED_STRUCT = targetStruct;
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("atmosphere_dealer_struct", targetStruct);
      }
      const table = getMyTable();
      table.structKey = SELECTED_STRUCT;
      const structObj = getActiveStructure(SELECTED_STRUCT);
      if (structObj && structObj.levels && structObj.levels[0]) {
        if (table.status === "idle") {
          table.durationSec = structObj.levels[0].durationSec;
        }
      }
      saveState();
      triggerHaptic("light");
      renderDealerView();
    });
  });

  // Селектор роли стола в МТТ (Master vs Satellite)
  const rolePills = document.querySelectorAll("#mtt-role-pills .pill");
  rolePills.forEach(pill => {
    pill.addEventListener("click", () => {
      rolePills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      IS_MTT_MASTER = (pill.dataset.mttRole === "master");
      const captionEl = document.getElementById("mtt-role-caption");
      if (captionEl) {
        captionEl.textContent = IS_MTT_MASTER
          ? "Головной стол управляет общим таймером турнира и перерывами на объединение столов."
          : "Таймер этого стола синхронизируется с головным столом турнира.";
      }
      triggerHaptic("light");
      renderDealerView();
    });
  });
}

function initNotifyToggle() {
  if (typeof document === "undefined") return;
  const toggleNotify = document.getElementById("toggle-notify-blinds");
  let isNotify = true;
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem("atmosphere_notify_blinds");
    if (saved !== null) isNotify = (saved === "true");
  }

  if (toggleNotify) {
    toggleNotify.checked = isNotify;
    toggleNotify.addEventListener("change", (e) => {
      const enabled = Boolean(e.target.checked);
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("atmosphere_notify_blinds", enabled ? "true" : "false");
      }
      const table = getMyTable();
      if (table) {
        table.notifyBlinds = enabled;
        saveState();
      }
      triggerHaptic("light");
    });
  }

  const myTbl = getMyTable();
  if (myTbl) {
    myTbl.notifyBlinds = isNotify;
  }
}

function notifyBlindRaise(table, nextLevelIndex) {
  if (!table || table.notifyBlinds === false || !table.dealerChatId) return;
  if (table.lastNotifiedLevelIndex === nextLevelIndex) return;

  table.lastNotifiedLevelIndex = nextLevelIndex;

  const structure = getActiveStructure(table.structKey || SELECTED_STRUCT);
  const levels = (structure && structure.levels) ? structure.levels : [];
  const nextLvl = levels[nextLevelIndex];
  if (!nextLvl) return;

  const payload = {
    action: "notify_blind_raise",
    tableId: table.id || DEALER_ID,
    dealerChatId: table.dealerChatId,
    levelIndex: nextLevelIndex,
    sb: nextLvl.sb,
    bb: nextLvl.bb,
    ante: nextLvl.ante || 0,
    format: table.format || SELECTED_FORMAT
  };

  if (typeof fetch === "function") {
    fetch("/api/dealer-bot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => {});
  }
}

function initButtonListeners() {
  document.getElementById("btn-start")?.addEventListener("click", startTable);
  document.getElementById("btn-pause")?.addEventListener("click", () => togglePause(true));
  document.getElementById("btn-step")?.addEventListener("click", handleStepClick);
  document.getElementById("btn-reset")?.addEventListener("click", resetTable);
  document.getElementById("btn-finish")?.addEventListener("click", openFinishModal);
  document.getElementById("btn-mtt-open-lobby")?.addEventListener("click", openMttLobby);
  document.getElementById("btn-mtt-start-all")?.addEventListener("click", startTable);
  document.getElementById("btn-mtt-cancel-lobby")?.addEventListener("click", cancelMttLobby);
  document.getElementById("btn-satellite-ready")?.addEventListener("click", setSatelliteReady);
}

let LAST_FIREBASE_SYNC_TS = 0;

function updateDealerPingDisplay(latencyMs) {
  if (typeof document === "undefined") return;
  const tag = document.getElementById("latency-tag");
  if (!tag) return;
  const safeMs = Math.max(5, Math.round(latencyMs));
  tag.textContent = `⚡ ${safeMs}ms`;
  tag.className = "latency-indicator" + (safeMs < 150 ? "" : (safeMs < 500 ? " medium" : " slow"));
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

      // Синхронизация времени с сервером Firebase
      db.ref(".info/serverTimeOffset").on("value", (snap) => {
        SERVER_TIME_OFFSET = snap.val() || 0;
      });

      db.ref("atmosphere/tables").on("value", (snapshot) => {
        const arrivalTime = Date.now();
        const latency = LAST_FIREBASE_SYNC_TS > 0 ? Math.min(80, Math.max(8, arrivalTime - LAST_FIREBASE_SYNC_TS)) : 16;
        LAST_FIREBASE_SYNC_TS = arrivalTime;
        const remoteState = snapshot.val() || {};

        // In-Flight Optimistic State Guard:
        let isPendingLocalSync = false;
        if (typeof localStorage !== "undefined") {
          const pendingTs = parseInt(localStorage.getItem("atmosphere_pending_sync_ts_" + DEALER_ID) || "0", 10);
          const now = Date.now();
          if (pendingTs && (now - pendingTs > 30000)) {
            // Флаг висит дольше 30 секунд — сбрасываем устаревший pending sync
            localStorage.removeItem("atmosphere_pending_sync_" + DEALER_ID);
            localStorage.removeItem("atmosphere_pending_sync");
            localStorage.removeItem("atmosphere_pending_sync_ts_" + DEALER_ID);
          } else {
            isPendingLocalSync = (localStorage.getItem("atmosphere_pending_sync_" + DEALER_ID) === "true" || 
                                  localStorage.getItem("atmosphere_pending_sync") === "true");
          }
        }

        let localSavedTable = null;
        if (isPendingLocalSync && typeof localStorage !== "undefined") {
          try {
            const parsed = JSON.parse(localStorage.getItem("atmosphere_tables") || "{}");
            localSavedTable = parsed[DEALER_ID] || null;
          } catch (e) {}
        }

        const optimisticLocalTable = TABLES_STATE[DEALER_ID] || localSavedTable;
        const remoteMyTable = remoteState[DEALER_ID];

        // Monotonic Level Protection:
        // Если сервер ушел вперед по уровням (ТВ автоматически переключил раунд, пока телефон спал),
        // локальное устаревшее состояние сбрасывается и безоговорочно принимается состояние сервера!
        if (remoteMyTable && optimisticLocalTable && (remoteMyTable.levelIndex || 0) > (optimisticLocalTable.levelIndex || 0)) {
          if (typeof localStorage !== "undefined") {
            localStorage.removeItem("atmosphere_pending_sync_" + DEALER_ID);
            localStorage.removeItem("atmosphere_pending_sync");
            localStorage.removeItem("atmosphere_pending_sync_ts_" + DEALER_ID);
          }
          TABLES_STATE = remoteState;
        } else if (isPendingLocalSync && optimisticLocalTable) {
          TABLES_STATE = Object.assign({}, remoteState, { [DEALER_ID]: optimisticLocalTable });
        } else {
          TABLES_STATE = remoteState;
        }

        updateDealerPingDisplay(latency);
        renderDealerView();
      });

      // Слушаем активную турнирную сессию МТТ
      db.ref("atmosphere/mtt_session").on("value", (snapshot) => {
        CURRENT_MTT_SESSION = snapshot.val() || null;
        renderDealerView();
      });

      console.log("⚡ Пульт подключен к Firebase Realtime DB (europe-west1)");
    } catch (err) {
      console.warn("Ошибка Firebase, переключение на локальный fallback:", err);
    }
  }

  startRestPollingFallback();

  // Fallback для оффлайн разработки
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("storage", (e) => {
      if (e.key === "atmosphere_tables") {
        const remoteState = JSON.parse(e.newValue || "{}");
        const isPendingLocalSync = (typeof localStorage !== "undefined" && 
          (localStorage.getItem("atmosphere_pending_sync_" + DEALER_ID) === "true" || localStorage.getItem("atmosphere_pending_sync") === "true"));

        let localSavedTable = null;
        if (isPendingLocalSync && typeof localStorage !== "undefined") {
          try {
            const parsed = JSON.parse(localStorage.getItem("atmosphere_tables") || "{}");
            localSavedTable = parsed[DEALER_ID] || null;
          } catch (e) {}
        }

        const optimisticLocalTable = TABLES_STATE[DEALER_ID] || localSavedTable;

        if (isPendingLocalSync && optimisticLocalTable) {
          TABLES_STATE = Object.assign({}, remoteState, { [DEALER_ID]: optimisticLocalTable });
        } else {
          TABLES_STATE = remoteState;
        }
        renderDealerView();
      }
      if (e.key === "atmosphere_mtt_session") {
        try {
          CURRENT_MTT_SESSION = JSON.parse(e.newValue || "null");
          renderDealerView();
        } catch (err) {}
      }
    });
  }
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem("atmosphere_tables");
    if (saved) TABLES_STATE = JSON.parse(saved);
    const savedSession = localStorage.getItem("atmosphere_mtt_session");
    if (savedSession) {
      try { CURRENT_MTT_SESSION = JSON.parse(savedSession); } catch (e) {}
    }
  }
}

let REST_POLL_INTERVAL = null;

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
        let isPendingLocalSync = false;
        if (typeof localStorage !== "undefined") {
          const pendingTs = parseInt(localStorage.getItem("atmosphere_pending_sync_ts_" + DEALER_ID) || "0", 10);
          const now = Date.now();
          if (pendingTs && (now - pendingTs > 30000)) {
            localStorage.removeItem("atmosphere_pending_sync_" + DEALER_ID);
            localStorage.removeItem("atmosphere_pending_sync");
            localStorage.removeItem("atmosphere_pending_sync_ts_" + DEALER_ID);
          } else {
            isPendingLocalSync = (localStorage.getItem("atmosphere_pending_sync_" + DEALER_ID) === "true" || 
                                  localStorage.getItem("atmosphere_pending_sync") === "true");
          }
        }

        const remoteMyTable = data[DEALER_ID];
        const localMyTable = TABLES_STATE[DEALER_ID];

        // Monotonic Level Protection:
        // Если сервер ушел вперед по уровням (ТВ автоматически переключил раунд, пока телефон спал),
        // сбрасываем локальный отложенный sync и принимаем данные сервера!
        if (remoteMyTable && localMyTable && (remoteMyTable.levelIndex || 0) > (localMyTable.levelIndex || 0)) {
          if (typeof localStorage !== "undefined") {
            localStorage.removeItem("atmosphere_pending_sync_" + DEALER_ID);
            localStorage.removeItem("atmosphere_pending_sync");
            localStorage.removeItem("atmosphere_pending_sync_ts_" + DEALER_ID);
          }
          TABLES_STATE = data;
        } else if (!isPendingLocalSync) {
          TABLES_STATE = data;
        } else {
          TABLES_STATE = Object.assign({}, data, { [DEALER_ID]: TABLES_STATE[DEALER_ID] });
        }
        LAST_FIREBASE_SYNC_TS = Date.now();
        updateDealerPingDisplay(latency);
        renderDealerView();
      }
    }

    const sessionRes = await fetch(`${dbUrl}/atmosphere/mtt_session.json`);
    if (sessionRes.ok) {
      CURRENT_MTT_SESSION = await sessionRes.json();
      renderDealerView();
    }
  } catch (e) {}
}

function startRestPollingFallback() {
  if (REST_POLL_INTERVAL) return;
  REST_POLL_INTERVAL = setInterval(() => {
    if (Date.now() - LAST_FIREBASE_SYNC_TS > 8000) {
      fetchTablesRest();
    }
  }, 4000);
  if (REST_POLL_INTERVAL && typeof REST_POLL_INTERVAL.unref === "function") {
    REST_POLL_INTERVAL.unref();
  }
}

let PENDING_SYNC_TIMEOUT = null;

function saveState() {
  if (DEALER_SIMULATION_MODE) return;
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
      localStorage.setItem("atmosphere_pending_sync_ts_" + DEALER_ID, String(Date.now()));
    } catch (e) {}
  }

  flushPendingSync();
}

function flushPendingSync() {
  if (DEALER_SIMULATION_MODE) return Promise.resolve(true);
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
          localStorage.removeItem("atmosphere_pending_sync_ts_" + DEALER_ID);
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
          localStorage.removeItem("atmosphere_pending_sync_ts_" + DEALER_ID);
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

function isTableStale(table) {
  if (!table) return true;
  if (table.dissolved) return true;
  const now = getSyncedNow();
  const TWO_HOURS_MS = 2 * 3600 * 1000;

  // Активные перерывы никогда не считаются устаревшими
  if (table.isBreakActive && table.breakEndsAt && table.breakEndsAt > now) return false;
  if (table.isPostGameBreak && table.nextGameAt && (now - table.nextGameAt < 3600 * 1000)) return false;

  if (table.status === "running" || table.status === "paused") {
    const activityTs = table.startedAt || table.createdAt || 0;
    if (activityTs > 0 && (now - activityTs > 3.5 * 3600 * 1000)) return true;
    return false;
  }

  if (table.status === "ready" || table.status === "lobby") {
    const lobbyTs = table.createdAt || table.startedAt || 0;
    if (lobbyTs > 0 && (now - lobbyTs > TWO_HOURS_MS)) return true;
    return false;
  }

  if (table.status === "idle" || table.status === "finished") {
    return true;
  }

  return false;
}

function getMyTable() {
  if (!TABLES_STATE[DEALER_ID]) {
    const activeStruct = getActiveStructure(SELECTED_STRUCT);
    const defaultDuration = (activeStruct && activeStruct.levels && activeStruct.levels[0] && activeStruct.levels[0].durationSec) || 600;
    
    let isNotify = true;
    if (typeof localStorage !== "undefined") {
      const savedNotify = localStorage.getItem("atmosphere_notify_blinds");
      if (savedNotify !== null) isNotify = (savedNotify === "true");
    }

    TABLES_STATE[DEALER_ID] = {
      id: DEALER_ID,
      dealerName: DEALER_NAME,
      dealerChatId: DEALER_CHAT_ID || null,
      format: SELECTED_FORMAT,
      structKey: SELECTED_STRUCT,
      status: "idle",
      levelIndex: 0,
      durationSec: defaultDuration,
      elapsedBeforePause: 0,
      isPostGameBreak: false,
      isMttMaster: true,
      playersCount: 9,
      initialPlayers: 9,
      lateEntries: 0,
      notifyBlinds: isNotify,
      lastNotifiedLevelIndex: null,
      requireManualStep: false
    };
  }
  return TABLES_STATE[DEALER_ID];
}

function setTablesState(tables) {
  TABLES_STATE = tables || {};
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

  const key = structKey || SELECTED_STRUCT || "SNG_DEEP_1500";
  if (config && config.BLIND_STRUCTURES) {
    return config.BLIND_STRUCTURES[key] || config.BLIND_STRUCTURES[SELECTED_STRUCT] || config.BLIND_STRUCTURES.SNG_DEEP_1500 || config.BLIND_STRUCTURES.SNG_STANDARD;
  }
  if (config && config.SNG_STRUCTURE) {
    return config.SNG_STRUCTURE;
  }
  return {
    name: "1 500 стек / 10 мин (Классика)",
    stack: 1500,
    levels: [
      { level: 1, sb: 5, bb: 10, ante: 0, durationSec: 600, label: "5 / 10" },
      { level: 2, sb: 10, bb: 25, ante: 0, durationSec: 600, label: "10 / 25" }
    ]
  };
}

// Предпросмотр структуры уровней (Bottom Sheet)
function openStructurePreview(structKey) {
  CURRENT_PREVIEW_STRUCT = structKey || SELECTED_STRUCT || "SNG_DEEP_1500";
  const structure = getActiveStructure(CURRENT_PREVIEW_STRUCT);
  if (!structure) return;

  const backdrop = document.getElementById("struct-modal-backdrop");
  const sheet = document.getElementById("struct-modal-sheet");
  const titleEl = document.getElementById("preview-modal-title");
  const subEl = document.getElementById("preview-modal-sub");
  const tbodyEl = document.getElementById("preview-modal-tbody");

  if (titleEl) titleEl.textContent = structure.name || structKey;
  if (subEl) subEl.textContent = structure.shortDesc || `Стартовый стек: ${structure.stack} фишек • Уровни по ${Math.round((structure.levels[0]?.durationSec || 600) / 60)} мин`;

  if (tbodyEl && Array.isArray(structure.levels)) {
    let html = "";

    structure.levels.forEach((lvl, idx) => {
      const anteHtml = lvl.ante > 0 ? `<span class="badge-bba">BBA ${lvl.ante}</span>` : `<span style="color: var(--muted); opacity: 0.5;">—</span>`;
      const durMin = Math.round((lvl.durationSec || 420) / 60);

      html += `
        <tr>
          <td><b>#${lvl.level || (idx + 1)}</b></td>
          <td><b>${lvl.sb} / ${lvl.bb}</b></td>
          <td>${anteHtml}</td>
          <td>${durMin} мин</td>
        </tr>
      `;
    });
    tbodyEl.innerHTML = html;
  }

  const chooseBtn = document.getElementById("btn-choose-struct");
  if (chooseBtn) {
    const allowed = (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG.getAllowedStructuresForFormat)
      ? POKER_CONFIG.getAllowedStructuresForFormat(SELECTED_FORMAT)
      : null;
    const canChoose = Boolean(allowed && allowed.includes(CURRENT_PREVIEW_STRUCT) && SELECTED_FORMAT !== "MTT");
    chooseBtn.style.display = canChoose ? "flex" : "none";
  }

  if (backdrop) backdrop.style.display = "block";
  if (sheet) sheet.style.display = "flex";
  triggerHaptic("medium");
}

function closeStructurePreview() {
  const backdrop = document.getElementById("struct-modal-backdrop");
  const sheet = document.getElementById("struct-modal-sheet");
  if (backdrop) backdrop.style.display = "none";
  if (sheet) sheet.style.display = "none";
  triggerHaptic("light");
}

function applyPreviewedStructure() {
  const targetStruct = CURRENT_PREVIEW_STRUCT || "SNG_DEEP_1500";
  const allowed = (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG.getAllowedStructuresForFormat)
    ? POKER_CONFIG.getAllowedStructuresForFormat(SELECTED_FORMAT)
    : null;
  if (allowed && !allowed.includes(targetStruct)) {
    closeStructurePreview();
    return;
  }
  SELECTED_STRUCT = targetStruct;
  const table = getMyTable();
  table.structKey = SELECTED_STRUCT;
  saveState();
  updateStructureVisibilityForFormat(SELECTED_FORMAT);
  closeStructurePreview();
  triggerHaptic("success");
  renderDealerView();
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
  table.startedAt = getSyncedNow();
  table.durationSec = structure.levels[0].durationSec;
  table.remainingMs = table.durationSec * 1000;
  table.levelEndsAt = table.startedAt + table.remainingMs;
  table.elapsedBeforePause = 0;
  table.colorUpDone = false;
  table.isColorUpActive = false;
  table.pauseEndsAt = null;
  table.pauseTotalSec = null;
  table.pausedAt = null;
  table.requireManualStep = false;
  table.dealerChatId = DEALER_CHAT_ID || table.dealerChatId || null;
  table.notifyBlinds = (table.notifyBlinds !== undefined) ? table.notifyBlinds : true;
  table.lastNotifiedLevelIndex = 0;
  table.breakEndsAt = null;
  table.isBreakActive = false;
  table.breakDurationSec = null;
  table.breakReason = null;
  table.isPostGameBreak = false;
  table.nextGameAt = null;
  table.postGameBreakMinutes = null;
  table.createdAt = getSyncedNow();

  if (table.format === "MTT") {
    table.isMttMaster = (typeof IS_MTT_MASTER !== "undefined") ? IS_MTT_MASTER : true;
    table.playersCount = table.playersCount || MTT_SETUP_PLAYERS || 9;
    table.initialPlayers = table.initialPlayers || table.playersCount;
    table.lateEntries = table.lateEntries || 0;

    // Головной стол синхронно запускает все подключенные сателлитные столы
    if (table.isMttMaster) {
      if (CURRENT_MTT_SESSION) {
        CURRENT_MTT_SESSION.status = "running";
        CURRENT_MTT_SESSION.startedAt = table.startedAt;
        if (typeof firebase !== "undefined" && firebase.apps && firebase.apps.length > 0) {
          firebase.database().ref("atmosphere/mtt_session").update({ status: "running", startedAt: table.startedAt }).catch(() => {});
        } else if (typeof fetch === "function") {
          const dbUrl = (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG.FIREBASE_DB_URL)
            ? POKER_CONFIG.FIREBASE_DB_URL
            : "https://atmosphere-poker-default-rtdb.europe-west1.firebasedatabase.app";
          fetch(`${dbUrl}/atmosphere/mtt_session.json`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "running", startedAt: table.startedAt })
          }).catch(() => {});
        }
      }
      broadcastMttStartToSatellites(table.startedAt, table.levelEndsAt, table.durationSec, table.structKey);
    }
  } else {
    table.isMttMaster = true;
    table.playersCount = 9;
    table.initialPlayers = 9;
    table.lateEntries = 0;
  }

  saveState();
  renderDealerView();
}

// Трансляция старта турнира от Master-стола всем сателлитам
function broadcastMttStartToSatellites(startedAt, levelEndsAt, durationSec, structKey) {
  const activeSessionId = (CURRENT_MTT_SESSION && CURRENT_MTT_SESSION.sessionId) ? CURRENT_MTT_SESSION.sessionId : null;
  const satelliteKeys = Object.keys(TABLES_STATE).filter(k => {
    const t = TABLES_STATE[k];
    return t && t.id !== DEALER_ID && t.format === "MTT" && !t.dissolved && !isTableStale(t) && 
      (!activeSessionId || t.mttSessionId === activeSessionId) &&
      (t.status === "ready");
  });

  satelliteKeys.forEach(satKey => {
    const satTable = TABLES_STATE[satKey];
    if (satTable) {
      satTable.status = "running";
      satTable.startedAt = startedAt;
      satTable.levelEndsAt = levelEndsAt;
      satTable.durationSec = durationSec;
      satTable.remainingMs = durationSec * 1000;
      satTable.levelIndex = 0;
      satTable.structKey = structKey;
      satTable.elapsedBeforePause = 0;
      satTable.colorUpDone = false;
      satTable.isColorUpActive = false;
    }

    if (typeof firebase !== "undefined" && firebase.apps && firebase.apps.length > 0) {
      try {
        firebase.database().ref("atmosphere/tables/" + encodeURIComponent(satKey)).update({
          status: "running",
          startedAt,
          levelEndsAt,
          durationSec,
          remainingMs: durationSec * 1000,
          levelIndex: 0,
          structKey,
          elapsedBeforePause: 0,
          colorUpDone: false,
          isColorUpActive: false
        });
      } catch (e) {}
    }

    const dbUrl = (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG.FIREBASE_DB_URL)
      ? POKER_CONFIG.FIREBASE_DB_URL
      : "https://atmosphere-poker-default-rtdb.europe-west1.firebasedatabase.app";
    if (typeof fetch === "function") {
      fetch(`${dbUrl}/atmosphere/tables/${encodeURIComponent(satKey)}.json`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "running",
          startedAt,
          levelEndsAt,
          durationSec,
          remainingMs: durationSec * 1000,
          levelIndex: 0,
          structKey,
          elapsedBeforePause: 0,
          colorUpDone: false,
          isColorUpActive: false
        })
      }).catch(() => {});
    }
  });
}

// Очистка устаревших столов и чужих сессий в Firebase
function cleanupStaleTablesInFirebase(currentSessionId) {
  const dbUrl = (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG.FIREBASE_DB_URL)
    ? POKER_CONFIG.FIREBASE_DB_URL
    : "https://atmosphere-poker-default-rtdb.europe-west1.firebasedatabase.app";

  Object.keys(TABLES_STATE).forEach(k => {
    if (k === DEALER_ID) return;
    const t = TABLES_STATE[k];
    if (!t) return;

    const isStaleTable = isTableStale(t);
    const isForeignMtt = (t.format === "MTT" && t.mttSessionId !== currentSessionId);
    if (isStaleTable || isForeignMtt) {
      t.status = "idle";
      t.format = "SnG";
      t.isMttMaster = false;
      t.dissolved = true;
      t.mttSessionId = null;

      const patchObj = { status: "idle", format: "SnG", isMttMaster: false, dissolved: true, mttSessionId: null };
      if (typeof firebase !== "undefined" && firebase.apps && firebase.apps.length > 0) {
        try {
          firebase.database().ref("atmosphere/tables/" + encodeURIComponent(k)).update(patchObj);
        } catch (e) {}
      } else if (typeof fetch === "function") {
        fetch(`${dbUrl}/atmosphere/tables/${encodeURIComponent(k)}.json`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchObj)
        }).catch(() => {});
      }
    }
  });
}

// Открытие этапа сбора турнира (Lobby) головным столом
function openMttLobby() {
  triggerHaptic("success");
  const sessionId = "mtt_" + Date.now();
  const sessionData = {
    sessionId: sessionId,
    masterId: DEALER_ID,
    masterName: DEALER_NAME,
    status: "lobby",
    createdAt: Date.now()
  };
  CURRENT_MTT_SESSION = sessionData;
  IS_MTT_MASTER = true;

  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem("atmosphere_mtt_session", JSON.stringify(sessionData));
    } catch (e) {}
  }

  const table = getMyTable();
  table.format = "MTT";
  table.structKey = SELECTED_STRUCT || "MTT_PRO_5000";
  table.isMttMaster = true;
  table.status = "lobby";
  table.mttSessionId = sessionId;
  table.playersCount = MTT_SETUP_PLAYERS || 9;
  table.initialPlayers = table.playersCount;
  table.lateEntries = 0;
  table.dealerName = DEALER_NAME;
  table.levelIndex = 0;
  table.startedAt = null;
  table.levelEndsAt = null;
  table.createdAt = Date.now();
  table.elapsedBeforePause = 0;
  table.colorUpDone = false;
  table.isColorUpActive = false;
  table.isBreakActive = false;
  table.breakEndsAt = null;
  table.isPostGameBreak = false;
  table.nextGameAt = null;
  table.dissolved = false;

  // 1. Запись сессии в Firebase
  if (typeof firebase !== "undefined" && firebase.apps && firebase.apps.length > 0) {
    firebase.database().ref("atmosphere/mtt_session").set(sessionData).catch(() => {});
  } else if (typeof fetch === "function") {
    const dbUrl = (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG.FIREBASE_DB_URL)
      ? POKER_CONFIG.FIREBASE_DB_URL
      : "https://atmosphere-poker-default-rtdb.europe-west1.firebasedatabase.app";
    fetch(`${dbUrl}/atmosphere/mtt_session.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sessionData)
    }).catch(() => {});
  }

  // 2. Очистка старых призраков в базе
  cleanupStaleTablesInFirebase(sessionId);

  saveState();
  renderDealerView();
}

// Отмена сбора турнира
function cancelMttLobby() {
  triggerHaptic("light");
  const table = getMyTable();
  table.status = "idle";
  table.mttSessionId = null;
  table.isMttMaster = false;
  CURRENT_MTT_SESSION = null;

  if (typeof localStorage !== "undefined") {
    localStorage.removeItem("atmosphere_mtt_session");
  }

  if (typeof firebase !== "undefined" && firebase.apps && firebase.apps.length > 0) {
    firebase.database().ref("atmosphere/mtt_session").remove().catch(() => {});
  } else if (typeof fetch === "function") {
    const dbUrl = (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG.FIREBASE_DB_URL)
      ? POKER_CONFIG.FIREBASE_DB_URL
      : "https://atmosphere-poker-default-rtdb.europe-west1.firebasedatabase.app";
    fetch(`${dbUrl}/atmosphere/mtt_session.json`, { method: "DELETE" }).catch(() => {});
  }

  saveState();
  renderDealerView();
}

// Ручное отключение стола/сателлита головным ведущим
function kickSatelliteTable(targetKey) {
  if (!targetKey) return;
  triggerHaptic("heavy");

  if (TABLES_STATE[targetKey]) {
    TABLES_STATE[targetKey].status = "idle";
    TABLES_STATE[targetKey].format = "SnG";
    TABLES_STATE[targetKey].isMttMaster = false;
    TABLES_STATE[targetKey].dissolved = true;
    TABLES_STATE[targetKey].mttSessionId = null;
  }

  const patchObj = {
    status: "idle",
    format: "SnG",
    isMttMaster: false,
    dissolved: true,
    mttSessionId: null
  };

  if (typeof firebase !== "undefined" && firebase.apps && firebase.apps.length > 0) {
    try {
      firebase.database().ref("atmosphere/tables/" + encodeURIComponent(targetKey)).update(patchObj);
    } catch (e) {}
  }

  const dbUrl = (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG.FIREBASE_DB_URL)
    ? POKER_CONFIG.FIREBASE_DB_URL
    : "https://atmosphere-poker-default-rtdb.europe-west1.firebasedatabase.app";
  if (typeof fetch === "function") {
    fetch(`${dbUrl}/atmosphere/tables/${encodeURIComponent(targetKey)}.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patchObj)
    }).catch(() => {});
  }

  renderDealerView();
}

// Универсальная трансляция состояния мастер-таймера всем активным сателлитам турнира
function broadcastMttMasterState(patchObj) {
  const myTable = getMyTable();
  if (myTable.format !== "MTT" || !myTable.isMttMaster) return;

  const activeSessionId = (CURRENT_MTT_SESSION && CURRENT_MTT_SESSION.sessionId) ? CURRENT_MTT_SESSION.sessionId : myTable.mttSessionId;
  const satelliteKeys = Object.keys(TABLES_STATE).filter(k => {
    const t = TABLES_STATE[k];
    return t && t.id !== DEALER_ID && t.format === "MTT" && !t.dissolved && !isTableStale(t) && 
      (!activeSessionId || t.mttSessionId === activeSessionId) &&
      (t.status === "running" || t.status === "paused");
  });

  satelliteKeys.forEach(satKey => {
    const satTable = TABLES_STATE[satKey];
    if (satTable) {
      Object.assign(satTable, patchObj);
    }

    if (typeof firebase !== "undefined" && firebase.apps && firebase.apps.length > 0) {
      try {
        firebase.database().ref("atmosphere/tables/" + encodeURIComponent(satKey)).update(patchObj);
      } catch (e) {}
    }

    const dbUrl = (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG.FIREBASE_DB_URL)
      ? POKER_CONFIG.FIREBASE_DB_URL
      : "https://atmosphere-poker-default-rtdb.europe-west1.firebasedatabase.app";
    if (typeof fetch === "function") {
      fetch(`${dbUrl}/atmosphere/tables/${encodeURIComponent(satKey)}.json`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchObj)
      }).catch(() => {});
    }
  });
}

// Готовность сателлитного стола к старту
function setSatelliteReady() {
  triggerHaptic("success");
  const table = getMyTable();
  const sessionId = (CURRENT_MTT_SESSION && CURRENT_MTT_SESSION.sessionId) ? CURRENT_MTT_SESSION.sessionId : ("mtt_" + Date.now());
  table.format = "MTT";
  table.structKey = SELECTED_STRUCT || "MTT_PRO_5000";
  table.isMttMaster = false;
  table.status = "ready";
  table.mttSessionId = sessionId;
  table.playersCount = MTT_SETUP_PLAYERS || 9;
  table.initialPlayers = table.playersCount;
  table.dealerName = DEALER_NAME;
  table.dissolved = false;
  saveState();
  renderDealerView();
}

// Отмена готовности сателлитного стола
function cancelSatelliteReady() {
  triggerHaptic("light");
  const table = getMyTable();
  table.status = "idle";
  table.mttSessionId = null;
  saveState();
  renderDealerView();
}


// 2. Пауза / Возобновление с миллисекундной точностью (без скачков вперед)
function togglePause(isUserClick = false) {
  if (isUserClick) {
    const nowClick = getSyncedNow();
    if (nowClick - LAST_PAUSE_CLICK_TS < 300) return;
    LAST_PAUSE_CLICK_TS = nowClick;
  }
  triggerHaptic("medium");
  const table = getMyTable();
  const now = getSyncedNow();

  if (table.status === "running") {
    table.status = "paused";
    table.pausedAt = now;
    let remainingMs = 0;
    if (table.levelEndsAt) {
      remainingMs = Math.max(0, table.levelEndsAt - now);
    } else if (table.startedAt) {
      remainingMs = Math.max(0, (table.durationSec * 1000) - (now - table.startedAt));
    } else {
      remainingMs = (table.durationSec || 600) * 1000;
    }
    table.remainingMs = remainingMs;
    table.elapsedBeforePause = Math.max(0, (table.durationSec || 600) - Math.ceil(remainingMs / 1000));
    
    // Защита овертайма: если пауза нажата при 00:00 или в овертайме
    if (remainingMs === 0 && table.levelEndsAt && now >= table.levelEndsAt) {
      table.overtimePausedMs = now - table.levelEndsAt;
      table.requireManualStep = true;
    } else {
      table.overtimePausedMs = 0;
      table.requireManualStep = false;
    }

    table.pausedLevelEndsAt = table.levelEndsAt;
    table.levelEndsAt = null;
    table.pauseEndsAt = null;
    table.pauseTotalSec = null;
  } else if (table.status === "paused") {
    table.status = "running";
    table.pauseEndsAt = null;
    table.pauseTotalSec = null;

    const pauseDuration = table.pausedAt ? Math.max(0, now - table.pausedAt) : 0;
    if (table.startedAt) {
      table.startedAt += pauseDuration;
    } else {
      table.startedAt = now;
    }

    if (table.requireManualStep) {
      // Овертайм guard: не вызываем мгновенный автоперескок, удерживаем 00:00
      table.remainingMs = 0;
      table.levelEndsAt = now - (table.overtimePausedMs || 0);
    } else {
      const remainingMs = (table.remainingMs !== undefined && table.remainingMs !== null)
        ? table.remainingMs
        : Math.max(0, ((table.durationSec || 600) - (table.elapsedBeforePause || 0)) * 1000);
      table.remainingMs = remainingMs;
      table.levelEndsAt = now + remainingMs;
    }
    table.pausedAt = null;
  }
  saveState();
  if (table.format === "MTT" && table.isMttMaster) {
    broadcastMttMasterState({
      status: table.status,
      remainingMs: table.remainingMs,
      elapsedBeforePause: table.elapsedBeforePause,
      startedAt: table.startedAt,
      levelEndsAt: table.levelEndsAt,
      pauseEndsAt: table.pauseEndsAt,
      pauseTotalSec: table.pauseTotalSec,
      isBreakActive: table.isBreakActive || false,
      breakEndsAt: table.breakEndsAt || null,
      breakDurationSec: table.breakDurationSec || null,
      breakReason: table.breakReason || null
    });
  }
  renderDealerView();
}

// 2.1. Запуск быстрой таймированной паузы (Перерыв)
function startTimedPause(seconds = 120) {
  triggerHaptic("heavy");
  const table = getMyTable();
  const now = getSyncedNow();
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
  if (table.format === "MTT" && table.isMttMaster) {
    broadcastMttMasterState({
      status: "paused",
      remainingMs: table.remainingMs,
      elapsedBeforePause: table.elapsedBeforePause,
      startedAt: null,
      levelEndsAt: null,
      pauseEndsAt: table.pauseEndsAt,
      pauseTotalSec: table.pauseTotalSec
    });
  }
  renderDealerView();
}

// 3. Следующий раунд с поддержкой быстрого перехода с возможностью отмены (Undo)
let PREV_LEVEL_STATE = null;
let UNDO_LEVEL_TIMER = null;
let STEP_TOAST_TIMER = null;

function handleStepClick() {
  const table = getMyTable();
  const structure = getActiveStructure(table.structKey || SELECTED_STRUCT);
  const levels = (structure && structure.levels) ? structure.levels : [];
  const maxIdx = levels.length ? levels.length - 1 : 0;
  
  if (table.levelIndex >= maxIdx) {
    return;
  }

  stepLevelWithUndo();
}

function stepLevelWithUndo() {
  const table = getMyTable();
  if (!table) return;
  const structure = getActiveStructure(table.structKey || SELECTED_STRUCT);
  const levels = (structure && structure.levels) ? structure.levels : [];
  const maxIdx = levels.length ? levels.length - 1 : 0;

  if (table.levelIndex >= maxIdx) {
    return;
  }

  // Сохраняем состояние для отмены (Undo)
  PREV_LEVEL_STATE = {
    levelIndex: table.levelIndex,
    durationSec: table.durationSec,
    remainingMs: table.remainingMs,
    elapsedBeforePause: table.elapsedBeforePause,
    startedAt: table.startedAt,
    levelEndsAt: table.levelEndsAt,
    status: table.status,
    lastNotifiedLevelIndex: table.lastNotifiedLevelIndex,
    requireManualStep: table.requireManualStep
  };

  // Мгновенный переход на следующий уровень
  table.levelIndex += 1;
  table.requireManualStep = false;
  const nextLvl = levels[table.levelIndex];
  table.durationSec = nextLvl.durationSec;
  table.remainingMs = nextLvl.durationSec * 1000;
  table.elapsedBeforePause = 0;
  const now = getSyncedNow();
  table.startedAt = now;
  if (table.status === "running") {
    table.levelEndsAt = now + table.remainingMs;
  } else {
    table.levelEndsAt = null;
  }

  notifyBlindRaise(table, table.levelIndex);
  triggerHaptic("medium");
  saveState();

  if (table.format === "MTT" && table.isMttMaster) {
    broadcastMttMasterState({
      levelIndex: table.levelIndex,
      durationSec: table.durationSec,
      remainingMs: table.remainingMs,
      elapsedBeforePause: 0,
      startedAt: table.startedAt,
      levelEndsAt: table.levelEndsAt
    });
  }

  renderDealerView();
  showUndoLevelSnackbar(table.levelIndex + 1);
}

function showUndoLevelSnackbar(displayLevelNum) {
  const snackbar = document.getElementById("undo-level-snackbar");
  if (!snackbar) return;

  if (UNDO_LEVEL_TIMER) {
    clearTimeout(UNDO_LEVEL_TIMER);
    UNDO_LEVEL_TIMER = null;
  }

  const msgEl = document.getElementById("undo-snackbar-msg");
  if (msgEl) {
    msgEl.textContent = `Уровень ${displayLevelNum} активирован`;
  }

  snackbar.style.display = "flex";
  if (snackbar.classList) snackbar.classList.add("visible");

  let countdownSec = 3;
  const btnUndo = document.getElementById("btn-undo-level");
  if (btnUndo) {
    btnUndo.textContent = `↩️ Отменить (${countdownSec}с)`;
  }

  const intervalId = setInterval(() => {
    countdownSec -= 1;
    if (countdownSec > 0 && btnUndo) {
      btnUndo.textContent = `↩️ Отменить (${countdownSec}с)`;
    } else {
      clearInterval(intervalId);
    }
  }, 1000);

  UNDO_LEVEL_TIMER = setTimeout(() => {
    clearInterval(intervalId);
    dismissUndoSnackbar();
    PREV_LEVEL_STATE = null;
  }, 3200);
}

function dismissUndoSnackbar() {
  const snackbar = document.getElementById("undo-level-snackbar");
  if (!snackbar) return;
  if (UNDO_LEVEL_TIMER) {
    clearTimeout(UNDO_LEVEL_TIMER);
    UNDO_LEVEL_TIMER = null;
  }
  if (snackbar.classList) snackbar.classList.remove("visible");
  snackbar.style.display = "none";
}

function undoStepLevel() {
  if (!PREV_LEVEL_STATE) {
    dismissUndoSnackbar();
    return;
  }

  const table = getMyTable();
  if (!table) return;

  table.levelIndex = PREV_LEVEL_STATE.levelIndex;
  table.durationSec = PREV_LEVEL_STATE.durationSec;
  table.remainingMs = PREV_LEVEL_STATE.remainingMs;
  table.elapsedBeforePause = PREV_LEVEL_STATE.elapsedBeforePause;
  table.startedAt = PREV_LEVEL_STATE.startedAt;
  table.levelEndsAt = PREV_LEVEL_STATE.levelEndsAt;
  table.status = PREV_LEVEL_STATE.status;
  table.lastNotifiedLevelIndex = PREV_LEVEL_STATE.lastNotifiedLevelIndex;
  table.requireManualStep = PREV_LEVEL_STATE.requireManualStep;

  PREV_LEVEL_STATE = null;
  dismissUndoSnackbar();

  triggerHaptic("heavy");
  saveState();

  if (table.format === "MTT" && table.isMttMaster) {
    broadcastMttMasterState({
      levelIndex: table.levelIndex,
      durationSec: table.durationSec,
      remainingMs: table.remainingMs,
      elapsedBeforePause: table.elapsedBeforePause,
      startedAt: table.startedAt,
      levelEndsAt: table.levelEndsAt
    });
  }

  renderDealerView();
}

function adjustLevelTime(deltaSeconds) {
  const table = getMyTable();
  if (!table || table.status === "idle") return;
  const deltaMs = deltaSeconds * 1000;
  const now = getSyncedNow();

  if (table.status === "running") {
    if (table.levelEndsAt) {
      table.levelEndsAt = Math.max(now + 5000, table.levelEndsAt + deltaMs);
      table.remainingMs = Math.max(5000, table.levelEndsAt - now);
    }
  } else if (table.status === "paused") {
    const currentRem = (table.remainingMs !== undefined && table.remainingMs !== null)
      ? table.remainingMs
      : ((table.durationSec || 420) * 1000);
    table.remainingMs = Math.max(5000, currentRem + deltaMs);
  }

  triggerHaptic("light");
  saveState();

  if (table.format === "MTT" && table.isMttMaster) {
    broadcastMttMasterState({
      remainingMs: table.remainingMs,
      levelEndsAt: table.levelEndsAt
    });
  }

  renderDealerView();
}

function showStepToast() {
  const table = getMyTable();
  const structure = getActiveStructure(table.structKey || SELECTED_STRUCT);
  const levels = (structure && structure.levels) ? structure.levels : [];
  const maxIdx = levels.length ? levels.length - 1 : 0;
  if (table.levelIndex >= maxIdx) {
    return;
  }

  triggerHaptic("light");
  const toast = document.getElementById("confirm-step-toast");
  if (!toast) return;

  if (STEP_TOAST_TIMER) {
    clearTimeout(STEP_TOAST_TIMER);
    STEP_TOAST_TIMER = null;
  }

  toast.style.display = "block";
  if (toast.classList) toast.classList.add("visible");

  STEP_TOAST_TIMER = setTimeout(() => {
    dismissStepToast();
  }, 3500);
}

function dismissStepToast() {
  const toast = document.getElementById("confirm-step-toast");
  if (!toast) return;
  if (STEP_TOAST_TIMER) {
    clearTimeout(STEP_TOAST_TIMER);
    STEP_TOAST_TIMER = null;
  }
  if (toast.classList) toast.classList.remove("visible");
  toast.style.display = "none";
}

function confirmNextLevel() {
  dismissStepToast();
  nextLevel();
}

function nextLevel() {
  triggerHaptic("medium");
  const table = getMyTable();
  const structure = getActiveStructure(table.structKey || SELECTED_STRUCT);
  const levels = (structure && structure.levels) ? structure.levels : [];
  const maxIdx = levels.length ? levels.length - 1 : 0;
  
  if (table.levelIndex < maxIdx) {
    table.levelIndex += 1;
    table.requireManualStep = false;
    table.durationSec = levels[table.levelIndex].durationSec;
    table.remainingMs = table.durationSec * 1000;
    table.elapsedBeforePause = 0;
    const now = getSyncedNow();
    table.startedAt = now;
    table.levelEndsAt = now + (table.durationSec * 1000);
    notifyBlindRaise(table, table.levelIndex);
    saveState();
    if (table.format === "MTT" && table.isMttMaster) {
      broadcastMttMasterState({
        levelIndex: table.levelIndex,
        durationSec: table.durationSec,
        remainingMs: table.remainingMs,
        elapsedBeforePause: 0,
        startedAt: table.startedAt,
        levelEndsAt: table.levelEndsAt
      });
    }
    renderDealerView();
  }
}

// 4. Сброс запуска (ошибка)
function resetTable() {
  triggerHaptic("heavy");
  dismissStepToast();
  dismissUndoSnackbar();
  dismissFinishModal();
  const table = getMyTable();
  const wasMttMaster = Boolean(table.format === "MTT" && table.isMttMaster);
  table.status = "idle";
  table.levelIndex = 0;
  table.startedAt = null;
  table.elapsedBeforePause = 0;
  table.colorUpDone = false;
  table.isColorUpActive = false;
  table.remainingMs = null;
  table.levelEndsAt = null;
  table.pauseEndsAt = null;
  table.pauseTotalSec = null;
  table.pausedAt = null;
  table.requireManualStep = false;
  table.lastNotifiedLevelIndex = null;
  table.breakEndsAt = null;
  table.isBreakActive = false;
  table.breakDurationSec = null;
  table.breakReason = null;
  table.isPostGameBreak = false;
  table.nextGameAt = null;
  table.postGameBreakMinutes = null;
  saveState();
  if (wasMttMaster) {
    CURRENT_MTT_SESSION = null;
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("atmosphere_mtt_session");
    }
    if (typeof firebase !== "undefined" && firebase.apps && firebase.apps.length > 0) {
      firebase.database().ref("atmosphere/mtt_session").remove().catch(() => {});
    } else if (typeof fetch === "function") {
      const dbUrl = (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG.FIREBASE_DB_URL)
        ? POKER_CONFIG.FIREBASE_DB_URL
        : "https://atmosphere-poker-default-rtdb.europe-west1.firebasedatabase.app";
      fetch(`${dbUrl}/atmosphere/mtt_session.json`, { method: "DELETE" }).catch(() => {});
    }

    broadcastMttMasterState({
      status: "idle",
      levelIndex: 0,
      startedAt: null,
      levelEndsAt: null,
      elapsedBeforePause: 0,
      colorUpDone: false,
      isColorUpActive: false,
      remainingMs: null,
      pauseEndsAt: null,
      pauseTotalSec: null,
      breakEndsAt: null,
      isBreakActive: false,
      breakDurationSec: null,
      breakReason: null,
      isPostGameBreak: false,
      nextGameAt: null,
      postGameBreakMinutes: null
    });
  }
  renderDealerView();
}

// Защищенное подтверждение завершения игры (Protected Focus Sheet)
function openFinishModal() {
  triggerHaptic("heavy");
  const modal = document.getElementById("finish-confirm-modal");
  if (!modal) {
    finishGame();
    return;
  }

  const summaryEl = document.getElementById("finish-summary-text");
  if (summaryEl) {
    const table = getMyTable();
    const structure = getActiveStructure(table.structKey || SELECTED_STRUCT);
    const levels = (structure && structure.levels) ? structure.levels : [];
    const currentLvl = levels[table.levelIndex] || { level: 1, sb: 25, bb: 50 };
    summaryEl.textContent = `Уровень ${currentLvl.level || (table.levelIndex + 1)} • ${currentLvl.sb} / ${currentLvl.bb}`;
  }

  modal.style.display = "flex";
}

function dismissFinishModal() {
  triggerHaptic("light");
  const modal = document.getElementById("finish-confirm-modal");
  if (modal) modal.style.display = "none";
}

function confirmFinishGame() {
  dismissFinishModal();
  finishGame();
}

// 5. Завершение игры -> переход в режим Post-Game
function finishGame() {
  dismissFinishModal();
  dismissStepToast();
  dismissUndoSnackbar();
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
  dismissStepToast();
  dismissFinishModal();
  const table = getMyTable();
  table.status = "idle";
  table.levelIndex = 0;
  table.startedAt = null;
  table.elapsedBeforePause = 0;
  table.colorUpDone = false;
  table.isColorUpActive = false;
  table.pauseEndsAt = null;
  table.pauseTotalSec = null;
  table.breakEndsAt = null;
  table.isBreakActive = false;
  table.isPostGameBreak = false;
  table.nextGameAt = null;
  table.postGameBreakMinutes = null;
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

let TARGET_REBALANCE_TABLE_KEY = null;
let CURRENT_REBALANCE_BOX = null;

// МТТ управление игроками при настройке
function adjustSetupPlayers(delta) {
  triggerHaptic("light");
  MTT_SETUP_PLAYERS = Math.max(2, Math.min(10, (MTT_SETUP_PLAYERS || 9) + delta));
  const el = document.getElementById("mtt-setup-players-val");
  if (el) el.textContent = MTT_SETUP_PLAYERS;
}

// Поздняя регистрация игрока (уровни 1-5)
function registerLateEntry() {
  const table = getMyTable();
  if (table.format !== "MTT") return;
  const struct = getActiveStructure(table.structKey || SELECTED_STRUCT);
  const maxLateLvl = (struct && struct.lateRegLevels) ? struct.lateRegLevels : 5;
  if (table.levelIndex >= maxLateLvl) {
    triggerHaptic("warning");
    return;
  }
  triggerHaptic("success");
  table.playersCount = (table.playersCount || 9) + 1;
  table.initialPlayers = (table.initialPlayers || 9) + 1;
  table.lateEntries = (table.lateEntries || 0) + 1;
  saveState();
  syncTargetTableLateEntry(table.id || DEALER_ID, table.playersCount, table.initialPlayers, table.lateEntries);
  renderDealerView();
}

// Атомарная синхронизация поздней регистрации в Firebase
function syncTargetTableLateEntry(targetKey, playersCount, initialPlayers, lateEntries) {
  if (!targetKey) return;
  const patchObj = { playersCount, initialPlayers, lateEntries };
  if (typeof firebase !== "undefined" && firebase.apps && firebase.apps.length > 0) {
    try {
      firebase.database().ref("atmosphere/tables/" + encodeURIComponent(targetKey)).update(patchObj);
    } catch (e) {}
  }
  const dbUrl = (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG.FIREBASE_DB_URL)
    ? POKER_CONFIG.FIREBASE_DB_URL
    : "https://atmosphere-poker-default-rtdb.europe-west1.firebasedatabase.app";
  if (typeof fetch === "function") {
    fetch(`${dbUrl}/atmosphere/tables/${encodeURIComponent(targetKey)}.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patchObj)
    }).catch(() => {});
  }
}

// МТТ управление игроками
function adjustPlayers(delta) {
  triggerHaptic("light");
  const table = getMyTable();
  table.playersCount = Math.max(1, Math.min(12, (table.playersCount || 9) + delta));
  saveState();
  renderDealerView();
}

let ELIMINATION_TOAST_TIMER = null;

function showEliminationToast(remainingCount) {
  if (typeof document === "undefined") return;
  const toast = document.getElementById("elimination-toast");
  const msg = document.getElementById("elimination-toast-msg");
  if (!toast) return;

  if (msg) {
    msg.textContent = `Игрок выбыл • За столом: ${remainingCount}`;
  }
  toast.style.display = "flex";

  if (ELIMINATION_TOAST_TIMER) {
    clearTimeout(ELIMINATION_TOAST_TIMER);
    ELIMINATION_TOAST_TIMER = null;
  }

  ELIMINATION_TOAST_TIMER = setTimeout(() => {
    if (toast) toast.style.display = "none";
  }, 2500);
}

// Выбивание игрока (Аут)
function eliminatePlayer() {
  triggerHaptic("heavy");
  const table = getMyTable();
  table.playersCount = Math.max(1, (table.playersCount || 9) - 1);
  saveState();

  // Мгновенная атомарная синхронизация остатка игроков (исключает сброс сателлита)
  syncTargetTablePlayersCount(table.id || DEALER_ID, table.playersCount);

  showEliminationToast(table.playersCount);
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

function syncTargetTablePlayersCount(targetKey, newCount) {
  if (!targetKey) return;
  if (typeof firebase !== "undefined" && firebase.apps && firebase.apps.length > 0) {
    try {
      firebase.database().ref("atmosphere/tables/" + encodeURIComponent(targetKey) + "/playersCount").set(newCount);
    } catch (e) {}
  }
  const dbUrl = (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG.FIREBASE_DB_URL)
    ? POKER_CONFIG.FIREBASE_DB_URL
    : "https://atmosphere-poker-default-rtdb.europe-west1.firebasedatabase.app";
  if (typeof fetch === "function") {
    fetch(`${dbUrl}/atmosphere/tables/${encodeURIComponent(targetKey)}/playersCount.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newCount)
    }).catch(() => {});
  }
}

function confirmRebalance() {
  triggerHaptic("success");
  const currentTable = getMyTable();
  currentTable.playersCount = Math.max(1, (currentTable.playersCount || 9) - 1);

  if (TARGET_REBALANCE_TABLE_KEY && TABLES_STATE[TARGET_REBALANCE_TABLE_KEY]) {
    const newTargetCount = (TABLES_STATE[TARGET_REBALANCE_TABLE_KEY].playersCount || 9) + 1;
    TABLES_STATE[TARGET_REBALANCE_TABLE_KEY].playersCount = newTargetCount;
    syncTargetTablePlayersCount(TARGET_REBALANCE_TABLE_KEY, newTargetCount);
  }

  saveState();
  const modal = document.getElementById("rebalance-modal");
  if (modal) modal.style.display = "none";
  renderDealerView();
}

// Открытие модалки объединения столов (головной стол)
function openConsolidationModal() {
  const activeMttTables = Object.keys(TABLES_STATE)
    .map(k => TABLES_STATE[k])
    .filter(t => t && t.format === "MTT" && (t.status === "running" || t.status === "paused") && !t.dissolved);

  let totalPlayers = 0;
  activeMttTables.forEach(t => {
    totalPlayers += (t.playersCount !== undefined ? t.playersCount : 9);
  });

  const activeCount = activeMttTables.length;
  let canConsolidate = false;
  if (activeCount === 4) canConsolidate = (totalPlayers <= 27);
  else if (activeCount === 3) canConsolidate = (totalPlayers <= 18);
  else if (activeCount === 2) canConsolidate = (totalPlayers <= 9);

  if (!canConsolidate) {
    triggerHaptic("warning");
    return;
  }

  triggerHaptic("medium");
  const modal = document.getElementById("dissolve-table-modal");
  if (!modal) return;

  const totalEl = document.getElementById("dissolve-total-players");
  if (totalEl) totalEl.textContent = totalPlayers;

  const recEl = document.getElementById("dissolve-recommendation");
  if (recEl) {
    if (activeCount === 2 && totalPlayers <= 9) {
      recEl.textContent = "Финальный стол (9-max: объединение в 1 стол)";
    } else if (activeCount === 3 && totalPlayers <= 18) {
      recEl.textContent = "Порог 18 (9-max): объединение 3 → 2 стола";
    } else if (activeCount === 4 && totalPlayers <= 27) {
      recEl.textContent = "Порог 27 (9-max): объединение 4 → 3 стола";
    } else {
      recEl.textContent = `Объединение ${activeCount} → ${Math.max(1, activeCount - 1)} столов`;
    }
  }

  const listEl = document.getElementById("dissolve-tables-list");
  if (listEl) {
    listEl.innerHTML = "";
    // Кандидаты на расформирование: сателлитные столы, или любые другие активные столы
    const candidates = activeMttTables.filter(t => t.id !== DEALER_ID);
    if (candidates.length === 0 && activeMttTables.length > 0) {
      candidates.push(activeMttTables[0]);
    }

    DISSOLVE_TARGET_TABLE_KEY = candidates.length > 0 ? candidates[0].id : null;

    if (typeof document.createElement === "function") {
      candidates.forEach(cand => {
        const opt = document.createElement("div");
        opt.className = "dissolve-table-option" + (cand.id === DISSOLVE_TARGET_TABLE_KEY ? " selected" : "");
        if (opt.dataset) opt.dataset.tableKey = cand.id;
        opt.innerHTML = `
          <span class="dissolve-table-name">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            Стол ${cand.dealerName || cand.id}
          </span>
          <span class="dissolve-table-count">${cand.playersCount || 9} игр.</span>
        `;
        opt.onclick = () => {
          DISSOLVE_TARGET_TABLE_KEY = cand.id;
          listEl.querySelectorAll(".dissolve-table-option").forEach(el => el.classList.remove("selected"));
          opt.classList.add("selected");
          triggerHaptic("light");
        };
        listEl.appendChild(opt);
      });
    }
  }

  modal.style.display = "flex";
}

function dismissConsolidationModal() {
  triggerHaptic("light");
  const modal = document.getElementById("dissolve-table-modal");
  if (modal) modal.style.display = "none";
}

function confirmConsolidationBreak() {
  dismissConsolidationModal();
  startConsolidationBreak(DISSOLVE_TARGET_TABLE_KEY, 900);
}

// Запуск 15-минутного клубного перерыва на объединение столов
function startConsolidationBreak(dissolveTableKey, breakDurationSec = 900) {
  triggerHaptic("heavy");
  const masterTable = getMyTable();
  const now = getSyncedNow();
  const breakEndsAt = now + (breakDurationSec * 1000);

  masterTable.isBreakActive = true;
  masterTable.breakEndsAt = breakEndsAt;
  masterTable.breakDurationSec = breakDurationSec;
  masterTable.breakReason = "consolidation";
  masterTable.status = "paused";
  masterTable.pauseEndsAt = null;
  masterTable.pauseTotalSec = null;
  saveState();

  if (masterTable.format === "MTT" && masterTable.isMttMaster) {
    broadcastMttMasterState({
      status: "paused",
      isBreakActive: true,
      breakEndsAt: breakEndsAt,
      breakDurationSec: breakDurationSec,
      breakReason: "consolidation",
      pauseEndsAt: null,
      pauseTotalSec: null
    });
  }

  if (dissolveTableKey) {
    dissolveTable(dissolveTableKey);
  }

  renderDealerView();
}

// Расформирование стола при объединении
function dissolveTable(tableKey) {
  if (!tableKey) return;
  if (TABLES_STATE[tableKey]) {
    TABLES_STATE[tableKey].status = "finished";
    TABLES_STATE[tableKey].dissolved = true;
    TABLES_STATE[tableKey].isBreakActive = false;
  }
  if (typeof firebase !== "undefined" && firebase.apps && firebase.apps.length > 0) {
    try {
      firebase.database().ref("atmosphere/tables/" + encodeURIComponent(tableKey)).update({
        status: "finished",
        dissolved: true
      });
    } catch (e) {}
  }
  const dbUrl = (typeof POKER_CONFIG !== "undefined" && POKER_CONFIG.FIREBASE_DB_URL)
    ? POKER_CONFIG.FIREBASE_DB_URL
    : "https://atmosphere-poker-default-rtdb.europe-west1.firebasedatabase.app";
  if (typeof fetch === "function") {
    fetch(`${dbUrl}/atmosphere/tables/${encodeURIComponent(tableKey)}.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "finished", dissolved: true })
    }).catch(() => {});
  }
}

// Автоматическое переключение уровней блайндов по истечении таймера (стандарт TDv3)
function checkAutoLevelProgression() {
  const table = getMyTable();
  if (table.status !== "running" || !table.levelEndsAt) return;
  if (table.requireManualStep) return;
  // Сателлитные столы в режиме МТТ не прогрессируют таймер независимо
  if (table.format === "MTT" && !table.isMttMaster) return;

  const now = getSyncedNow();
  if (now >= table.levelEndsAt) {
    const struct = getActiveStructure(table.structKey || SELECTED_STRUCT);
    const levels = (struct && struct.levels) ? struct.levels : [];

    const maxIdx = levels.length ? levels.length - 1 : 0;
    if (table.levelIndex < maxIdx) {
      table.levelIndex += 1;
      const nextLvl = levels[table.levelIndex];
      table.durationSec = nextLvl.durationSec;
      table.remainingMs = nextLvl.durationSec * 1000;
      table.levelEndsAt = now + table.remainingMs;
      table.elapsedBeforePause = 0;
      notifyBlindRaise(table, table.levelIndex);
      saveState();
      if (table.format === "MTT" && table.isMttMaster) {
        broadcastMttMasterState({
          levelIndex: table.levelIndex,
          durationSec: table.durationSec,
          remainingMs: table.remainingMs,
          levelEndsAt: table.levelEndsAt,
          elapsedBeforePause: 0
        });
      }
      triggerHaptic("success");
    } else {
      // Финальный уровень: блайнды зафиксированы, отсчет продолжается
      table.levelEndsAt = now + (table.durationSec * 1000);
      table.remainingMs = table.durationSec * 1000;
      table.elapsedBeforePause = 0;
      saveState();
    }
  }
}

// Заглушка обратной совместимости (Color-Up убран по запросу дилеров)
function skipColorUp() {
  triggerHaptic("medium");
  const table = getMyTable();
  table.isColorUpActive = false;
  table.colorUpDone = false;
  saveState();
  renderDealerView();
}

// Отрисовка лобби подключенных столов для главного стола
function renderMttMasterLobby() {
  if (typeof document === "undefined") return;
  const listEl = document.getElementById("mtt-lobby-tables-list");
  const summaryEl = document.getElementById("mtt-lobby-summary");
  const badgeEl = document.getElementById("mtt-lobby-badge");
  if (!listEl) return;

  const myTable = getMyTable();
  const activeSessionId = (CURRENT_MTT_SESSION && CURRENT_MTT_SESSION.sessionId) ? CURRENT_MTT_SESSION.sessionId : myTable.mttSessionId;
  const tables = Object.values(TABLES_STATE).filter(t => 
    t && t.format === "MTT" && !t.dissolved && !isTableStale(t) &&
    (!activeSessionId || t.mttSessionId === activeSessionId) &&
    (t.status === "ready" || t.status === "lobby" || t.status === "running" || t.status === "paused")
  );

  // Собираем список столов (текущий стол гарантированно первый)
  const allMtt = tables.filter(t => t.id !== DEALER_ID);
  allMtt.unshift(myTable);

  let totalPlayers = 0;
  let allSatellitesReady = true;

  let html = "";
  allMtt.forEach(t => {
    const isMaster = Boolean(t.isMttMaster || t.id === DEALER_ID);
    const count = (t.playersCount !== undefined ? t.playersCount : (isMaster ? (MTT_SETUP_PLAYERS || 9) : 9));
    totalPlayers += count;

    let statusPill = "";
    let kickBtnHtml = "";
    if (isMaster) {
      statusPill = `<span class="lobby-table-status-pill ready">Головной стол</span>`;
    } else {
      kickBtnHtml = `<button type="button" class="btn-kick-satellite" onclick="kickSatelliteTable('${t.id}'); event.stopPropagation();" title="Отключить стол от турнира">✕ Отключить</button>`;
      if (t.status === "ready") {
        statusPill = `<span class="lobby-table-status-pill ready">Готов к игре</span>`;
      } else {
        statusPill = `<span class="lobby-table-status-pill waiting">Настраивает...</span>`;
        allSatellitesReady = false;
      }
    }

    html += `
      <div class="lobby-table-row${isMaster ? " is-master" : ""}">
        <div class="lobby-table-info">
          <span class="lobby-table-name">${t.dealerName || "Стол"}</span>
          <span class="lobby-table-role ${isMaster ? "master" : "satellite"}">${isMaster ? "Master" : "Сателлит"}</span>
        </div>
        <div class="lobby-table-meta">
          <span class="lobby-table-players">${count} игр.</span>
          ${statusPill}
          ${kickBtnHtml}
        </div>
      </div>
    `;
  });

  listEl.innerHTML = html;

  if (summaryEl) {
    summaryEl.textContent = `Всего столов: ${allMtt.length} • Игроков на старте: ${totalPlayers}`;
  }

  if (badgeEl) {
    if (allMtt.length <= 1) {
      badgeEl.textContent = "Ожидание сателлитов";
      badgeEl.className = "lobby-badge";
    } else if (allSatellitesReady) {
      badgeEl.textContent = "Все столы готовы";
      badgeEl.className = "lobby-badge all-ready";
    } else {
      badgeEl.textContent = "Настройка сателлитов";
      badgeEl.className = "lobby-badge";
    }
  }
}

// Отрисовка состояния пульта
function renderDealerView() {
  const table = getMyTable();

  // Если стол был расформирован / отключен главным ведущим
  if (table.dissolved) {
    table.dissolved = false;
    table.status = "idle";
    table.format = "SnG";
    table.isMttMaster = false;
    SELECTED_FORMAT = "SnG";
    updateStructureVisibilityForFormat("SnG");
    saveState();
  }

  // Синхронизация формата и видимости структур при настройке
  if (table.status === "idle" || !table.status || table.status === "lobby" || table.status === "ready") {
    const activeFormat = SELECTED_FORMAT || table.format || "SnG";
    table.format = activeFormat;
    updateStructureVisibilityForFormat(activeFormat);
    if (typeof document !== "undefined" && typeof document.querySelectorAll === "function") {
      const formatPills = document.querySelectorAll("#format-pills .pill");
      if (formatPills && formatPills.length > 0) {
        formatPills.forEach(p => {
          if (p.classList && typeof p.classList.toggle === "function") {
            p.classList.toggle("active", p.dataset.format === activeFormat);
          }
        });
      }
    }
  }

  // Синхронизация сателлитного стола с головным столом в режиме МТТ
  let masterTable = null;
  if (table.format === "MTT" && !table.isMttMaster) {
    const activeSessionId = (CURRENT_MTT_SESSION && CURRENT_MTT_SESSION.sessionId) ? CURRENT_MTT_SESSION.sessionId : table.mttSessionId;
    masterTable = Object.values(TABLES_STATE).find(t => 
      t && t.format === "MTT" && t.isMttMaster && t.id !== table.id && !isTableStale(t) &&
      (!activeSessionId || t.mttSessionId === activeSessionId) &&
      (t.status === "running" || t.status === "paused")
    );

    // Сателлит синхронизируется с часами и статусом Master стола, если турнир запущен (running/paused)
    const canSync = Boolean(masterTable && (masterTable.status === "running" || masterTable.status === "paused"));

    if (masterTable && canSync) {
      table.status = masterTable.status;
      table.levelIndex = masterTable.levelIndex;
      table.durationSec = masterTable.durationSec;
      table.remainingMs = masterTable.remainingMs;
      table.levelEndsAt = masterTable.levelEndsAt;
      table.startedAt = masterTable.startedAt;
      table.elapsedBeforePause = masterTable.elapsedBeforePause;
      table.colorUpDone = masterTable.colorUpDone;
      table.isColorUpActive = masterTable.isColorUpActive;
      table.pauseEndsAt = masterTable.pauseEndsAt;
      table.pauseTotalSec = masterTable.pauseTotalSec;
      table.isBreakActive = masterTable.isBreakActive;
      table.breakEndsAt = masterTable.breakEndsAt;
      table.breakDurationSec = masterTable.breakDurationSec;
      table.breakReason = masterTable.breakReason;
    }
  } else {
    // Автоматическая смена уровней запускается только для ведущего или обычных SnG столов
    checkAutoLevelProgression();
  }

  // Автоматическое определение роли сателлита / master по сессии МТТ
  if (table.format === "MTT" || SELECTED_FORMAT === "MTT") {
    const hasRemoteSession = Boolean(
      CURRENT_MTT_SESSION && CURRENT_MTT_SESSION.sessionId && CURRENT_MTT_SESSION.masterId !== (table.id || DEALER_ID)
    );
    if (hasRemoteSession) {
      IS_MTT_MASTER = false;
      table.isMttMaster = false;
    } else if (table.status === "lobby" || table.isMttMaster) {
      IS_MTT_MASTER = true;
      table.isMttMaster = true;
    }
  }

  const struct = getActiveStructure(table.structKey || SELECTED_STRUCT);
  const levels = (struct && struct.levels) ? struct.levels : [];
  const maxIdx = levels.length ? levels.length - 1 : 0;
  const safeIndex = Math.min(Math.max(0, table.levelIndex || 0), maxIdx);
  table.levelIndex = safeIndex;
  const isFinalLevel = (safeIndex >= maxIdx);
  const currentLvl = levels[safeIndex] || levels[0] || { durationSec: 420, label: "25 / 50", level: 1 };
  const nextLvl = isFinalLevel ? null : (levels[safeIndex + 1] || null);

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
  const stepBtn = document.getElementById("btn-step");
  const colorUpBtn = document.getElementById("btn-colorup");
  const skipColorUpBtn = document.getElementById("btn-skip-colorup");
  const resetBtn = document.getElementById("btn-reset");
  const finishBtn = document.getElementById("btn-finish");

  const postBreakButtons = document.getElementById("post-break-buttons");
  const postBreakActive = document.getElementById("post-break-active");
  const postBreakDigits = document.getElementById("post-break-digits");

  // МТТ панель и элементы управления
  const mttBox = document.getElementById("mtt-control-box");
  const mttVal = document.getElementById("mtt-players-val");
  const lateRegBtn = document.getElementById("btn-late-reg");
  const lateRegText = document.getElementById("late-reg-btn-text");
  const mttRegSubLabel = document.getElementById("mtt-reg-sub-label");
  const consolidateWrap = document.getElementById("consolidate-wrap");
  const consolidateBtn = document.getElementById("btn-consolidate");
  const consolidateSubtext = document.getElementById("consolidate-btn-subtext");
  const syncBadge = document.getElementById("satellite-sync-badge");
  const syncText = document.getElementById("satellite-sync-text");

  const now = getSyncedNow();
  const isConsolidationBreak = Boolean(table.isBreakActive && table.breakEndsAt && table.breakEndsAt > now);

  if (mttBox && mttBox.style) {
    const isMtt = (table.format === "MTT" || SELECTED_FORMAT === "MTT");
    mttBox.style.display = (isMtt && (table.status === "running" || table.status === "paused")) ? "flex" : "none";
  }
  if (mttVal) {
    mttVal.textContent = table.playersCount || 9;
  }

  if (table.format === "MTT") {
    const maxLateLvl = (struct && struct.lateRegLevels) ? struct.lateRegLevels : 5;
    const isLateRegOpen = (table.levelIndex < maxLateLvl) && (table.status === "running" || table.status === "paused") && !isConsolidationBreak;
    if (lateRegBtn) {
      lateRegBtn.disabled = !isLateRegOpen;
      if (isLateRegOpen) {
        if (lateRegBtn.classList) lateRegBtn.classList.remove("disabled");
        if (lateRegText) lateRegText.textContent = "+ Игрок (Поздняя рега)";
        if (mttRegSubLabel) mttRegSubLabel.textContent = "Поздняя регистрация открыта";
      } else {
        if (lateRegBtn.classList) lateRegBtn.classList.add("disabled");
        if (lateRegText) lateRegText.textContent = "Поздняя рега закрыта";
        if (mttRegSubLabel) mttRegSubLabel.textContent = "Регистрация закрыта (уровень > 5)";
      }
    }

    // Расчет строгих 9-max порогов для объединения столов
    const activeMttTables = Object.keys(TABLES_STATE)
      .map(k => TABLES_STATE[k])
      .filter(t => t && t.format === "MTT" && (t.status === "running" || t.status === "paused") && !t.dissolved && !isTableStale(t));

    // Гарантируем присутствие текущего стола в расчете
    if (!activeMttTables.some(t => t.id === (table.id || DEALER_ID))) {
      activeMttTables.push(table);
    }

    let totalMttPlayers = 0;
    let totalTournamentStarting = 0;
    activeMttTables.forEach(t => {
      totalMttPlayers += (t.playersCount !== undefined ? t.playersCount : 9);
      totalTournamentStarting += (t.initialPlayers !== undefined ? t.initialPlayers : (t.playersCount !== undefined ? t.playersCount : 9));
    });
    const activeCount = activeMttTables.length;

    // Сквозной турнирный HUD (Общий зачет)
    const mttStack = 5000;
    const totalChips = totalTournamentStarting * mttStack;
    const avgStack = totalMttPlayers > 0 ? Math.round(totalChips / totalMttPlayers) : mttStack;
    const currentBb = currentLvl.bb || 50;
    const avgStackBb = Math.round(avgStack / currentBb);

    const hudTablesEl = document.getElementById("mtt-hud-tables");
    if (hudTablesEl) hudTablesEl.textContent = `Столов: ${Math.max(1, activeCount)}`;

    const hudPlayersEl = document.getElementById("mtt-hud-players");
    if (hudPlayersEl) hudPlayersEl.innerHTML = `${totalMttPlayers} <small id="mtt-hud-total-sub">/ ${totalTournamentStarting}</small>`;

    const hudChipsEl = document.getElementById("mtt-hud-chips");
    if (hudChipsEl) hudChipsEl.textContent = totalChips.toLocaleString("ru-RU");

    const hudAvgEl = document.getElementById("mtt-hud-avg");
    if (hudAvgEl) hudAvgEl.innerHTML = `${avgStack.toLocaleString("ru-RU")} <small id="mtt-hud-avg-bb">(${avgStackBb} BB)</small>`;

    let canConsolidate = false;
    let consolidateSubtextMsg = "";
    if (activeCount === 4) {
      canConsolidate = (totalMttPlayers <= 27);
      consolidateSubtextMsg = canConsolidate ? "Доступно объединение в 3 стола (≤27 игроков)" : `Доступно при ≤ 27 игроках (сейчас: ${totalMttPlayers})`;
    } else if (activeCount === 3) {
      canConsolidate = (totalMttPlayers <= 18);
      consolidateSubtextMsg = canConsolidate ? "Доступно объединение в 2 стола (≤18 игроков)" : `Доступно при ≤ 18 игроках (сейчас: ${totalMttPlayers})`;
    } else if (activeCount === 2) {
      canConsolidate = (totalMttPlayers <= 9);
      consolidateSubtextMsg = canConsolidate ? "Доступен финальный стол (≤9 игроков)" : `Финальный стол доступен при ≤ 9 игроках (сейчас: ${totalMttPlayers})`;
    } else {
      canConsolidate = false;
      consolidateSubtextMsg = "Финальный стол сформирован (1 стол)";
    }

    if (consolidateWrap && consolidateWrap.style) {
      consolidateWrap.style.display = (table.isMttMaster && (table.status === "running" || table.status === "paused")) ? "flex" : "none";
    }
    if (consolidateBtn) {
      consolidateBtn.disabled = !canConsolidate;
      if (consolidateBtn.classList && typeof consolidateBtn.classList.toggle === "function") {
        consolidateBtn.classList.toggle("disabled", !canConsolidate);
      }
    }
    if (consolidateSubtext) {
      consolidateSubtext.textContent = consolidateSubtextMsg;
    }

    if (syncBadge && syncBadge.style) {
      syncBadge.style.display = (!table.isMttMaster && (table.status === "running" || table.status === "paused")) ? "flex" : "none";
      if (!table.isMttMaster && syncText) {
        syncText.textContent = masterTable ? `Синхронизировано со столом ${masterTable.dealerName || "Master"}` : "Синхронизировано с головным столом";
      }
    }

    // Для сателлитного стола кнопки паузы и шага скрыты (управление у головного стола)
    if (!table.isMttMaster) {
      if (pauseBtn && pauseBtn.style) pauseBtn.style.display = "none";
      if (stepBtn && stepBtn.style) stepBtn.style.display = "none";
    } else {
      if (pauseBtn && pauseBtn.style) pauseBtn.style.display = "";
      if (stepBtn && stepBtn.style) stepBtn.style.display = "";
    }
  } else {
    if (consolidateWrap && consolidateWrap.style) consolidateWrap.style.display = "none";
    if (consolidateBtn && consolidateBtn.style) consolidateBtn.style.display = "none";
    if (syncBadge && syncBadge.style) syncBadge.style.display = "none";
    if (pauseBtn && pauseBtn.style) pauseBtn.style.display = "";
    if (stepBtn && stepBtn.style) stepBtn.style.display = "";
  }

  if (roundEl) {
    if (table.status === "finished") roundEl.textContent = "ФИНИШ";
    else if (isConsolidationBreak) roundEl.textContent = "ПЕРЕРЫВ 15 МИН";
    else if (isFinalLevel) roundEl.textContent = "ФИНАЛЬНЫЙ УРОВЕНЬ";
    else roundEl.textContent = currentLvl.isBreak ? "ПЕРЕРЫВ" : `УРОВЕНЬ ${currentLvl.level}`;
  }
  if (blindsValEl) blindsValEl.textContent = currentLvl.label;
  if (nextBlindsValEl) nextBlindsValEl.textContent = nextLvl ? nextLvl.label : "—";
  if (stepBtn) {
    stepBtn.disabled = isFinalLevel;
    stepBtn.title = isFinalLevel ? "Финальный уровень (рост остановлен)" : "Следующий уровень";
  }
  if (isFinalLevel || (table.status !== "running" && table.status !== "paused")) {
    dismissStepToast();
  }

  // Расчет времени по абсолютным меткам (без дрифта при сворачивании и без скачков при паузе)
  let remaining = currentLvl.durationSec;
  let totalElapsed = table.elapsedBeforePause || 0;
  if (table.status === "running") {
    if (table.levelEndsAt) {
      remaining = Math.max(0, Math.ceil((table.levelEndsAt - now) / 1000));
      totalElapsed = Math.max(0, table.durationSec - remaining);
    } else if (table.startedAt) {
      const elapsedNow = Math.floor((now - table.startedAt) / 1000);
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

  // Отображение таймера (если активен 15-мин перерыв на объединение или пауза)
  const isTimedPause = (table.status === "paused" && table.pauseEndsAt && table.pauseEndsAt > now);
  if (isConsolidationBreak) {
    const bRem = Math.max(0, Math.ceil((table.breakEndsAt - now) / 1000));
    const bMin = Math.floor(bRem / 60);
    const bSec = bRem % 60;
    if (digitsEl) {
      digitsEl.textContent = `${String(bMin).padStart(2, "0")}:${String(bSec).padStart(2, "0")}`;
      digitsEl.style.color = "#fbbf24";
    }
  } else if (isTimedPause) {
    const pRemaining = Math.max(0, Math.ceil((table.pauseEndsAt - now) / 1000));
    const pMin = Math.floor(pRemaining / 60);
    const pSec = pRemaining % 60;
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
    if (statusEl) {
      statusEl.textContent = isFinalLevel ? "🟢 Блайнды зафиксированы" : "🟢 Идёт игра";
    }
    if (runningRow) runningRow.style.display = "flex";
    if (colorUpBtn) colorUpBtn.style.display = "none";
    if (skipColorUpBtn) skipColorUpBtn.style.display = "none";
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
      if (isConsolidationBreak) {
        statusEl.textContent = "☕ Перерыв 15 мин • Объединение столов";
      } else {
        statusEl.textContent = isTimedPause ? "☕ Перерыв" : "⏸ На паузе";
      }
    }
    if (runningRow) runningRow.style.display = "flex";
    if (colorUpBtn) colorUpBtn.style.display = "none";
    if (skipColorUpBtn) skipColorUpBtn.style.display = "none";
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

    // Обработка перерыва после игры (с поддержкой овертайма +MM:SS до 1 часа)
    if (table.isPostGameBreak && table.nextGameAt) {
      const isOvertime = now >= table.nextGameAt;
      const isStaleOvertime = (now - table.nextGameAt >= 3600 * 1000); // 1 час задержки

      if (isStaleOvertime) {
        // Стол оставлен на 1 час после перерыва — сбрасываем в idle
        resetTable();
        return;
      }

      if (!isOvertime) {
        const remBreak = Math.max(0, Math.floor((table.nextGameAt - now) / 1000));
        const bMin = Math.floor(remBreak / 60);
        const bSec = remBreak % 60;
        const bFormatted = `${String(bMin).padStart(2, "0")}:${String(bSec).padStart(2, "0")}`;
        if (postBreakButtons) postBreakButtons.style.display = "none";
        if (postBreakActive) postBreakActive.style.display = "block";
        if (postBreakDigits) {
          postBreakDigits.textContent = bFormatted;
          if (postBreakDigits.classList) postBreakDigits.classList.remove("state-overtime");
        }
        if (digitsEl) {
          digitsEl.textContent = bFormatted;
          digitsEl.style.color = "#fbbf24";
          if (digitsEl.classList) digitsEl.classList.remove("state-overtime");
        }
        if (statusEl) statusEl.textContent = "☕ Перерыв перед следующей игрой";
      } else {
        // Задержка перерыва (+MM:SS)
        const overdueSec = Math.floor((now - table.nextGameAt) / 1000);
        const oMin = Math.floor(overdueSec / 60);
        const oSec = overdueSec % 60;
        const oFormatted = `+${String(oMin).padStart(2, "0")}:${String(oSec).padStart(2, "0")}`;

        if (postBreakButtons) postBreakButtons.style.display = "none";
        if (postBreakActive) postBreakActive.style.display = "block";
        if (postBreakDigits) {
          postBreakDigits.textContent = oFormatted;
          if (postBreakDigits.classList) postBreakDigits.classList.add("state-overtime");
        }
        if (digitsEl) {
          digitsEl.textContent = oFormatted;
          digitsEl.style.color = "#f59e0b";
          if (digitsEl.classList) digitsEl.classList.add("state-overtime");
        }
        if (statusEl) statusEl.textContent = `☕ Перерыв задерживается (+${oMin} мин)`;
      }
    } else {
      if (postBreakButtons) postBreakButtons.style.display = "grid";
      if (postBreakActive) postBreakActive.style.display = "none";
      if (digitsEl) {
        digitsEl.textContent = "00:00";
        digitsEl.style.color = "";
        if (digitsEl.classList) digitsEl.classList.remove("state-overtime");
      }
      if (statusEl) statusEl.textContent = "🏁 Игра завершена";
    }
  } else {
    // idle, lobby или ready -> показываем экран выбора параметров
    if (setupPanel) setupPanel.style.display = "flex";
    if (controlCard) controlCard.style.display = "none";

    const toggleNotify = document.getElementById("toggle-notify-blinds");
    if (toggleNotify && table && table.notifyBlinds !== undefined) {
      toggleNotify.checked = Boolean(table.notifyBlinds);
    }

    const isMttSetup = (SELECTED_FORMAT === "MTT" || table.format === "MTT");
    const mttMasterIdleActions = document.getElementById("mtt-master-idle-actions");
    const mttMasterLobby = document.getElementById("mtt-master-lobby");
    const satelliteSetupActions = document.getElementById("satellite-setup-actions");
    const btnStart = document.getElementById("btn-start");
    const btnStartLabel = document.getElementById("btn-start-label");
    const btnSatelliteReady = document.getElementById("btn-satellite-ready");
    const satelliteWaitingCard = document.getElementById("satellite-waiting-card");

    if (isMttSetup) {
      if (btnStart) btnStart.style.display = "none";

      const hasActiveRemoteSession = Boolean(
        CURRENT_MTT_SESSION && CURRENT_MTT_SESSION.sessionId && CURRENT_MTT_SESSION.masterId !== (table.id || DEALER_ID)
      );
      const isSatellite = Boolean(hasActiveRemoteSession || (!IS_MTT_MASTER && !table.isMttMaster) || table.status === "ready");

      if (isSatellite) {
        // Стол является сателлитом
        IS_MTT_MASTER = false;
        table.isMttMaster = false;
        if (mttMasterIdleActions) mttMasterIdleActions.style.display = "none";
        if (mttMasterLobby) mttMasterLobby.style.display = "none";
        if (satelliteSetupActions) satelliteSetupActions.style.display = "flex";

        const hostBanner = document.getElementById("satellite-host-banner");
        const hostTitle = document.getElementById("satellite-host-title");
        if (CURRENT_MTT_SESSION && CURRENT_MTT_SESSION.sessionId) {
          if (hostBanner) hostBanner.style.display = "flex";
          if (hostTitle) hostTitle.textContent = `Ведущий ${CURRENT_MTT_SESSION.masterName || "Master"} собирает турнир МТТ`;
        } else {
          if (hostBanner) hostBanner.style.display = "none";
        }

        const isReady = (table.status === "ready");
        if (btnSatelliteReady) btnSatelliteReady.style.display = isReady ? "none" : "flex";
        if (satelliteWaitingCard) {
          satelliteWaitingCard.style.display = isReady ? "flex" : "none";
          const title = document.getElementById("satellite-waiting-title");
          const desc = document.getElementById("satellite-waiting-desc");
          if (title) title.textContent = `Стол подключен (${table.playersCount || 9} игр.)`;
          if (desc) desc.textContent = (CURRENT_MTT_SESSION && CURRENT_MTT_SESSION.masterName)
            ? `Ожидание общего старта от ${CURRENT_MTT_SESSION.masterName}...`
            : "Ожидание общего старта от головного стола...";
        }
      } else {
        // Чужой сессии нет и стол не сателлит -> этот стол управляет созданием лобби (Master)
        const isMasterLobbyOpen = (
          table.status === "lobby" ||
          Boolean(CURRENT_MTT_SESSION && CURRENT_MTT_SESSION.sessionId) ||
          (IS_MTT_MASTER && Object.keys(TABLES_STATE || {}).length > 1)
        );
        if (isMasterLobbyOpen) {
          if (satelliteSetupActions) satelliteSetupActions.style.display = "none";
          if (mttMasterIdleActions) mttMasterIdleActions.style.display = "none";
          if (mttMasterLobby) mttMasterLobby.style.display = "flex";
          renderMttMasterLobby();
        } else {
          // Лобби еще не открыто (статус idle)
          if (satelliteSetupActions) satelliteSetupActions.style.display = "none";
          if (mttMasterLobby) mttMasterLobby.style.display = "none";
          if (mttMasterIdleActions) mttMasterIdleActions.style.display = "flex";
        }
      }
    } else {
      if (mttMasterIdleActions) mttMasterIdleActions.style.display = "none";
      if (mttMasterLobby) mttMasterLobby.style.display = "none";
      if (satelliteSetupActions) satelliteSetupActions.style.display = "none";
      if (btnStart) btnStart.style.display = "flex";
      if (btnStartLabel) btnStartLabel.textContent = "Запустить турнир";
    }
  }
}

// ==========================================
// СИМУЛЯЦИОННЫЙ РЕЖИМ ПУЛЬТА (DEV & DEMO)
// ==========================================
let DEALER_SIMULATION_MODE = false;
let DEALER_SIM_BACKUP_STATE = null;

function enableDealerSimulation() {
  DEALER_SIMULATION_MODE = true;
  if (DEALER_SIM_BACKUP_STATE === null) {
    DEALER_SIM_BACKUP_STATE = JSON.parse(JSON.stringify(TABLES_STATE || {}));
  }

  const now = getSyncedNow();
  const mockTable = {
    id: DEALER_ID,
    dealerName: DEALER_NAME || "Паша",
    format: "SnG",
    structKey: "SNG_STANDARD",
    levelIndex: 5, // 200 / 400, ante 400
    durationSec: 420,
    remainingMs: 315000, // 5:15
    startedAt: now - (420000 - 315000),
    levelEndsAt: now + 315000,
    status: "running",
    playersCount: 9,
    eliminations: 0
  };

  TABLES_STATE = {};
  TABLES_STATE[DEALER_ID] = mockTable;

  if (typeof document !== "undefined") {
    const banner = document.getElementById("dealer-sim-banner");
    if (banner) banner.style.display = "flex";
  }

  renderDealerView();
}

function exitDealerSimulation() {
  DEALER_SIMULATION_MODE = false;
  TABLES_STATE = DEALER_SIM_BACKUP_STATE || {};
  DEALER_SIM_BACKUP_STATE = null;

  if (typeof document !== "undefined") {
    const banner = document.getElementById("dealer-sim-banner");
    if (banner) banner.style.display = "none";
  }

  renderDealerView();
}

function toggleDealerSimulation() {
  if (DEALER_SIMULATION_MODE) {
    exitDealerSimulation();
  } else {
    enableDealerSimulation();
  }
}

// 4 быстрых тапа (<=1500мс) по шапке пульта для активации демо-режима
let dealerTapCount = 0;
let dealerTapTimer = null;
function handleDealerHeaderTap(e) {
  if (!e || !e.target) return;
  if (e.target.closest && (e.target.closest("#dealer-sim-banner") || e.target.closest("button"))) {
    return;
  }
  const header = e.target.closest ? e.target.closest(".dealer-header") : null;
  if (!header) return;

  dealerTapCount++;
  clearTimeout(dealerTapTimer);
  if (dealerTapCount >= 4) {
    dealerTapCount = 0;
    toggleDealerSimulation();
  } else {
    dealerTapTimer = setTimeout(() => { dealerTapCount = 0; }, 1500);
  }
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("click", handleDealerHeaderTap);
  document.addEventListener("touchend", handleDealerHeaderTap);
}

// Автоматическое восстановление состояния при разблокировке телефона или возврате во вкладку
async function syncWithServerOnWakeup() {
  if (DEALER_SIMULATION_MODE) return;
  try {
    await fetchTablesRest();
  } catch (e) {}
  renderDealerView();
}
const loadState = syncWithServerOnWakeup;

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      syncWithServerOnWakeup();
    }
  });
}
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("focus", () => {
    syncWithServerOnWakeup();
  });
}

if (typeof window !== "undefined") {
  window.undoStepLevel = undoStepLevel;
  window.adjustLevelTime = adjustLevelTime;
  window.stepLevelWithUndo = stepLevelWithUndo;
  window.dismissUndoSnackbar = dismissUndoSnackbar;
  window.enableDealerSimulation = enableDealerSimulation;
  window.exitDealerSimulation = exitDealerSimulation;
  window.toggleDealerSimulation = toggleDealerSimulation;
  window.isDealerSimulationMode = () => DEALER_SIMULATION_MODE;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    enableDealerSimulation,
    exitDealerSimulation,
    toggleDealerSimulation,
    isDealerSimulationMode: () => DEALER_SIMULATION_MODE,
    initDealerIdentity,
    getMyTable,
    startTable,
    togglePause,
    startTimedPause,
    nextLevel,
    stepLevelWithUndo,
    undoStepLevel,
    showUndoLevelSnackbar,
    dismissUndoSnackbar,
    adjustLevelTime,
    getPrevLevelState: () => PREV_LEVEL_STATE,
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
    checkAutoLevelProgression,
    skipColorUp,
    setTablesState,
    openStructurePreview,
    closeStructurePreview,
    applyPreviewedStructure,
    renderDealerView,
    updateDealerPingDisplay,
    handleStepClick,
    showStepToast,
    dismissStepToast,
    confirmNextLevel,
    openFinishModal,
    dismissFinishModal,
    confirmFinishGame,
    initDataSource,
    initPillSelectors,
    registerLateEntry,
    adjustSetupPlayers,
    openConsolidationModal,
    dismissConsolidationModal,
    confirmConsolidationBreak,
    startConsolidationBreak,
    dissolveTable,
    broadcastMttStartToSatellites,
    setSatelliteReady,
    cancelSatelliteReady,
    openMttLobby,
    cancelMttLobby,
    kickSatelliteTable,
    isTableStale,
    updateStructureVisibilityForFormat,
    broadcastMttMasterState,
    syncTargetTableLateEntry,
    fetchTablesRest,
    startRestPollingFallback,
    renderMttMasterLobby,
    cleanupStaleTablesInFirebase,
    showAppToast,
    syncWithServerOnWakeup,
    loadState,
    getSyncedNow,
    getServerTimeOffset: () => SERVER_TIME_OFFSET,
    setServerTimeOffset: (offset) => { SERVER_TIME_OFFSET = offset; },
    getCurrentMttSession: () => CURRENT_MTT_SESSION,
    setCurrentMttSession: (s) => { CURRENT_MTT_SESSION = s; },
    setSelectedFormat: (f) => { SELECTED_FORMAT = f; },
    setSelectedStruct: (s) => { SELECTED_STRUCT = s; },
    setIsMttMaster: (m) => { IS_MTT_MASTER = m; },
    setMttSetupPlayers: (p) => { MTT_SETUP_PLAYERS = p; },
    setDealerName: (name) => { DEALER_NAME = name; applyDealerIdentity(); },
    getLastFirebaseSyncTs: () => LAST_FIREBASE_SYNC_TS,
    setLastFirebaseSyncTs: (ts) => { LAST_FIREBASE_SYNC_TS = ts; },
    notifyBlindRaise,
    initNotifyToggle,
    setDealerChatId: (id) => {
      DEALER_CHAT_ID = id;
      const t = getMyTable();
      if (t) t.dealerChatId = id;
    },
    getDealerChatId: () => DEALER_CHAT_ID,
    getLastPauseClickTs: () => LAST_PAUSE_CLICK_TS
  };
}
