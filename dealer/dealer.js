/**
 * DEALER CONTROLLER LOGIC (Telegram Mini App)
 * Антикафе «Атмосфера» — Direct-to-Firebase Realtime Architecture
 */

let DEALER_NAME = "Ведущий";
let DEALER_ID = "dealer_vlad";
let SELECTED_FORMAT = "SnG";
let SELECTED_STRUCT = "SNG_STANDARD";
let CURRENT_PREVIEW_STRUCT = "SNG_DEEP_1500";
let IS_MTT_MASTER = true;
let MTT_SETUP_PLAYERS = 9;
let DISSOLVE_TARGET_TABLE_KEY = null;
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
      SELECTED_STRUCT = "SNG_STANDARD";
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

// Инициализация селекторов формата и структуры
function initPillSelectors() {
  const formatPills = document.querySelectorAll("#format-pills .pill");
  const mttSetupBlock = document.getElementById("mtt-setup-block");

  // Инициализируем правильное состояние при старте
  updateStructureVisibilityForFormat(SELECTED_FORMAT);

  formatPills.forEach(pill => {
    pill.addEventListener("click", () => {
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

  const structPills = document.querySelectorAll("#struct-pills .pill");
  if (typeof document !== "undefined" && typeof document.querySelector === "function") {
    const activeStructPill = document.querySelector("#struct-pills .pill.active");
    if (activeStructPill && activeStructPill.dataset && activeStructPill.dataset.struct) {
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
      const table = getMyTable();
      table.structKey = SELECTED_STRUCT;
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

function initButtonListeners() {
  document.getElementById("btn-start")?.addEventListener("click", startTable);
  document.getElementById("btn-pause")?.addEventListener("click", togglePause);
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
      db.ref("atmosphere/tables").on("value", (snapshot) => {
        const arrivalTime = Date.now();
        const latency = LAST_FIREBASE_SYNC_TS > 0 ? Math.min(80, Math.max(8, arrivalTime - LAST_FIREBASE_SYNC_TS)) : 16;
        LAST_FIREBASE_SYNC_TS = arrivalTime;
        const remoteState = snapshot.val() || {};

        // In-Flight Optimistic State Guard:
        // Если у текущего ведущего есть локальные изменения в процессе отправки, сохраняем оптимистичный стол
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

        updateDealerPingDisplay(latency);
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
    });
  }
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem("atmosphere_tables");
    if (saved) TABLES_STATE = JSON.parse(saved);
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
        const isPendingLocalSync = (typeof localStorage !== "undefined" && 
          (localStorage.getItem("atmosphere_pending_sync_" + DEALER_ID) === "true" || localStorage.getItem("atmosphere_pending_sync") === "true"));
        if (!isPendingLocalSync) {
          TABLES_STATE = data;
        } else {
          TABLES_STATE = Object.assign({}, data, { [DEALER_ID]: TABLES_STATE[DEALER_ID] });
        }
        LAST_FIREBASE_SYNC_TS = Date.now();
        updateDealerPingDisplay(latency);
        renderDealerView();
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
  }, 2500);
  if (REST_POLL_INTERVAL && typeof REST_POLL_INTERVAL.unref === "function") {
    REST_POLL_INTERVAL.unref();
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

function isTableStale(table) {
  if (!table) return true;
  if (table.dissolved) return true;
  const now = Date.now();
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
    TABLES_STATE[DEALER_ID] = {
      id: DEALER_ID,
      dealerName: DEALER_NAME,
      format: SELECTED_FORMAT,
      structKey: SELECTED_STRUCT,
      status: "idle",
      levelIndex: 0,
      durationSec: 420,
      elapsedBeforePause: 0,
      isPostGameBreak: false,
      isMttMaster: true,
      playersCount: 9,
      initialPlayers: 9,
      lateEntries: 0
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

  const key = structKey || SELECTED_STRUCT || "SNG_STANDARD";
  if (config && config.BLIND_STRUCTURES) {
    return config.BLIND_STRUCTURES[key] || config.BLIND_STRUCTURES[SELECTED_STRUCT] || config.BLIND_STRUCTURES.SNG_STANDARD || config.BLIND_STRUCTURES.SNG_DEEP_1500;
  }
  if (config && config.SNG_STRUCTURE) {
    return config.SNG_STRUCTURE;
  }
  return {
    name: "5 000 стек / 7 мин (Атмосфера Pro)",
    stack: 5000,
    levels: [
      { level: 1, sb: 25, bb: 50, ante: 0, durationSec: 420, label: "25 / 50" },
      { level: 2, sb: 50, bb: 100, ante: 0, durationSec: 420, label: "50 / 100" }
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
    const colorUpLevel = structure.colorUpAfterLevel || (CURRENT_PREVIEW_STRUCT === "SNG_DEEP_1500" ? 4 : 5);

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

      if (lvl.level === colorUpLevel) {
        const removedChips = CURRENT_PREVIEW_STRUCT === "SNG_DEEP_1500" ? "убираются номиналы 5, 10, 25, 50" : "убираются номиналы 25, 50";
        html += `
          <tr class="row-colorup">
            <td colspan="4">☕ COLOR-UP (2 мин) • Размен мелких фишек (${removedChips})</td>
          </tr>
        `;
      }
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
  table.startedAt = Date.now();
  table.durationSec = structure.levels[0].durationSec;
  table.remainingMs = table.durationSec * 1000;
  table.levelEndsAt = table.startedAt + table.remainingMs;
  table.elapsedBeforePause = 0;
  table.colorUpDone = false;
  table.isColorUpActive = false;
  table.pauseEndsAt = null;
  table.pauseTotalSec = null;
  table.breakEndsAt = null;
  table.isBreakActive = false;
  table.breakDurationSec = null;
  table.breakReason = null;
  table.isPostGameBreak = false;
  table.nextGameAt = null;
  table.postGameBreakMinutes = null;
  table.createdAt = Date.now();

  if (table.format === "MTT") {
    table.isMttMaster = (typeof IS_MTT_MASTER !== "undefined") ? IS_MTT_MASTER : true;
    table.playersCount = table.playersCount || MTT_SETUP_PLAYERS || 9;
    table.initialPlayers = table.initialPlayers || table.playersCount;
    table.lateEntries = table.lateEntries || 0;

    // Головной стол синхронно запускает все подключенные сателлитные столы
    if (table.isMttMaster) {
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
  const satelliteKeys = Object.keys(TABLES_STATE).filter(k => {
    const t = TABLES_STATE[k];
    return t && t.id !== DEALER_ID && t.format === "MTT" && !t.dissolved && !isTableStale(t) && (t.status === "ready");
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

// Открытие этапа сбора турнира (Lobby) головным столом
function openMttLobby() {
  triggerHaptic("success");
  const table = getMyTable();
  table.format = "MTT";
  table.structKey = SELECTED_STRUCT || "MTT_PRO_5000";
  table.isMttMaster = true;
  table.status = "lobby";
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
  saveState();
  renderDealerView();
}

// Отмена сбора турнира
function cancelMttLobby() {
  triggerHaptic("light");
  const table = getMyTable();
  table.status = "idle";
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
  }

  const patchObj = {
    status: "idle",
    format: "SnG",
    isMttMaster: false,
    dissolved: true
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

  const satelliteKeys = Object.keys(TABLES_STATE).filter(k => {
    const t = TABLES_STATE[k];
    return t && t.id !== DEALER_ID && t.format === "MTT" && !t.dissolved && !isTableStale(t) && (t.status === "running" || t.status === "paused");
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
  table.format = "MTT";
  table.structKey = SELECTED_STRUCT || "MTT_PRO_5000";
  table.isMttMaster = false;
  table.status = "ready";
  table.playersCount = MTT_SETUP_PLAYERS || 9;
  table.initialPlayers = table.playersCount;
  table.dealerName = DEALER_NAME;
  saveState();
  renderDealerView();
}

// Отмена готовности сателлитного стола
function cancelSatelliteReady() {
  triggerHaptic("light");
  const table = getMyTable();
  table.status = "idle";
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

// 3. Следующий раунд с подтверждением через тост
let STEP_TOAST_TIMER = null;

function handleStepClick() {
  const table = getMyTable();
  const structure = getActiveStructure(table.structKey || SELECTED_STRUCT);
  const levels = (structure && structure.levels) ? structure.levels : [];
  const maxIdx = levels.length ? levels.length - 1 : 0;
  
  if (table.levelIndex >= maxIdx) {
    return;
  }

  const toast = document.getElementById("confirm-step-toast");
  if (!toast) {
    nextLevel();
    return;
  }

  if (toast.style.display !== "none") {
    confirmNextLevel();
  } else {
    showStepToast();
  }
}

function showStepToast() {
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
    table.durationSec = levels[table.levelIndex].durationSec;
    table.remainingMs = table.durationSec * 1000;
    table.elapsedBeforePause = 0;
    table.startedAt = Date.now();
    table.levelEndsAt = Date.now() + (table.durationSec * 1000);
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
  table.breakEndsAt = null;
  table.isBreakActive = false;
  table.breakDurationSec = null;
  table.breakReason = null;
  table.isPostGameBreak = false;
  table.nextGameAt = null;
  table.postGameBreakMinutes = null;
  saveState();
  if (wasMttMaster) {
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
  const now = Date.now();
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
  // Сателлитные столы в режиме МТТ не прогрессируют таймер независимо
  if (table.format === "MTT" && !table.isMttMaster) return;

  const now = Date.now();
  if (now >= table.levelEndsAt) {
    const struct = getActiveStructure(table.structKey || SELECTED_STRUCT);
    const levels = (struct && struct.levels) ? struct.levels : [];
    const currentLvl = levels[table.levelIndex || 0];

    // Автоматический Color-Up (после 150/300 для MTT Pro, после 100/200 для SnG Pro)
    const isColorUpLevel = (struct && struct.colorUpAfterLevel && (table.levelIndex + 1) === struct.colorUpAfterLevel)
      || (struct && struct.id !== "MTT_PRO_5000" && currentLvl && currentLvl.sb === 100 && currentLvl.bb === 200);

    if (isColorUpLevel && !table.colorUpDone) {
      table.colorUpDone = true;
      table.isColorUpActive = true;
      table.status = "paused";
      table.pauseEndsAt = now + (120 * 1000);
      table.pauseTotalSec = 120;
      saveState();
      if (table.format === "MTT" && table.isMttMaster) {
        broadcastMttMasterState({
          colorUpDone: true,
          isColorUpActive: true,
          status: "paused",
          pauseEndsAt: table.pauseEndsAt,
          pauseTotalSec: table.pauseTotalSec
        });
      }
      triggerHaptic("heavy");
      return;
    }

    const maxIdx = levels.length ? levels.length - 1 : 0;
    if (table.levelIndex < maxIdx) {
      table.levelIndex += 1;
      const nextLvl = levels[table.levelIndex];
      table.durationSec = nextLvl.durationSec;
      table.remainingMs = nextLvl.durationSec * 1000;
      table.levelEndsAt = now + table.remainingMs;
      table.elapsedBeforePause = 0;
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

// Пропуск перерыва Color-Up дилером
function skipColorUp() {
  triggerHaptic("medium");
  const table = getMyTable();
  table.isColorUpActive = false;
  table.pauseEndsAt = null;
  table.pauseTotalSec = null;
  table.status = "running";
  const struct = getActiveStructure(table.structKey || SELECTED_STRUCT);
  const levels = (struct && struct.levels) ? struct.levels : [];
  if (table.levelIndex < levels.length - 1) {
    table.levelIndex += 1;
    const nextLvl = levels[table.levelIndex];
    table.durationSec = nextLvl.durationSec;
    table.remainingMs = nextLvl.durationSec * 1000;
    table.levelEndsAt = Date.now() + table.remainingMs;
    table.elapsedBeforePause = 0;
  }
  saveState();
  if (table.format === "MTT" && table.isMttMaster) {
    broadcastMttMasterState({
      isColorUpActive: false,
      pauseEndsAt: null,
      pauseTotalSec: null,
      status: "running",
      levelIndex: table.levelIndex,
      durationSec: table.durationSec,
      remainingMs: table.remainingMs,
      levelEndsAt: table.levelEndsAt,
      elapsedBeforePause: 0
    });
  }
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
  const tables = Object.values(TABLES_STATE).filter(t => 
    t && t.format === "MTT" && !t.dissolved && !isTableStale(t) && (t.status === "ready" || t.status === "lobby" || t.status === "running" || t.status === "paused")
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
    masterTable = Object.values(TABLES_STATE).find(t => 
      t && t.format === "MTT" && t.isMttMaster && t.id !== table.id && !isTableStale(t) && (t.status === "running" || t.status === "paused")
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

  // Автоматическое определение роли сателлита, если в сети уже есть головной стол
  if ((table.format === "MTT" || SELECTED_FORMAT === "MTT") && (table.status === "idle" || !table.status)) {
    const existingMaster = Object.values(TABLES_STATE).find(t => 
      t && t.id !== (table.id || DEALER_ID) && t.format === "MTT" && t.isMttMaster && !t.dissolved && 
      (t.status === "lobby" || t.status === "running" || t.status === "paused")
    );
    if (existingMaster && IS_MTT_MASTER) {
      IS_MTT_MASTER = false;
      const masterPill = document.querySelector('#mtt-role-pills .pill[data-mtt-role="master"]');
      const satPill = document.querySelector('#mtt-role-pills .pill[data-mtt-role="satellite"]');
      if (masterPill && satPill) {
        masterPill.classList.remove("active");
        satPill.classList.add("active");
      }
      const captionEl = document.getElementById("mtt-role-caption");
      if (captionEl) {
        captionEl.textContent = "Таймер этого стола синхронизируется с головным столом турнира.";
      }
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

  const isConsolidationBreak = Boolean(table.isBreakActive && table.breakEndsAt && table.breakEndsAt > Date.now());

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

  // Отображение таймера (если активен 15-мин перерыв на объединение, Color-Up или пауза)
  const isTimedPause = (table.status === "paused" && table.pauseEndsAt && table.pauseEndsAt > Date.now());
  if (isConsolidationBreak) {
    const bRem = Math.max(0, Math.ceil((table.breakEndsAt - Date.now()) / 1000));
    const bMin = Math.floor(bRem / 60);
    const bSec = bRem % 60;
    if (digitsEl) {
      digitsEl.textContent = `${String(bMin).padStart(2, "0")}:${String(bSec).padStart(2, "0")}`;
      digitsEl.style.color = "#fbbf24";
    }
  } else if (isTimedPause) {
    const pRemaining = Math.max(0, Math.ceil((table.pauseEndsAt - Date.now()) / 1000));
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
    if (runningRow) runningRow.style.display = "grid";
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
      } else if (table.isColorUpActive && isTimedPause) {
        statusEl.textContent = "☕ Color-Up • Размен фишек <100";
      } else {
        statusEl.textContent = isTimedPause ? "☕ Перерыв • Color-Up" : "⏸ На паузе";
      }
    }
    if (runningRow) runningRow.style.display = "grid";
    if (colorUpBtn) colorUpBtn.style.display = "none";
    if (skipColorUpBtn) {
      skipColorUpBtn.style.display = (table.isColorUpActive && isTimedPause) ? "flex" : "none";
    }
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
      const now = Date.now();
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

      if (IS_MTT_MASTER) {
        if (satelliteSetupActions) satelliteSetupActions.style.display = "none";
        if (mttMasterIdleActions) mttMasterIdleActions.style.display = "none";
        if (mttMasterLobby) mttMasterLobby.style.display = "flex";
        renderMttMasterLobby();
      } else {
        // Сателлит
        if (mttMasterIdleActions) mttMasterIdleActions.style.display = "none";
        if (mttMasterLobby) mttMasterLobby.style.display = "none";
        if (satelliteSetupActions) satelliteSetupActions.style.display = "flex";

        const isReady = (table.status === "ready");
        if (btnSatelliteReady) btnSatelliteReady.style.display = isReady ? "none" : "flex";
        if (satelliteWaitingCard) {
          satelliteWaitingCard.style.display = isReady ? "flex" : "none";
          const title = (typeof satelliteWaitingCard.querySelector === "function") 
            ? satelliteWaitingCard.querySelector(".waiting-title") 
            : null;
          if (title) title.textContent = `Готов к старту (${table.playersCount || 9} игр.)`;
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
    showEliminationToast,
    setSelectedFormat: (f) => { SELECTED_FORMAT = f; },
    setSelectedStruct: (s) => { SELECTED_STRUCT = s; },
    setIsMttMaster: (m) => { IS_MTT_MASTER = m; },
    setMttSetupPlayers: (p) => { MTT_SETUP_PLAYERS = p; },
    setDealerName: (name) => { DEALER_NAME = name; applyDealerIdentity(); }
  };
}
