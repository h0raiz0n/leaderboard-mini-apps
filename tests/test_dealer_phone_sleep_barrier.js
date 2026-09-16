/**
 * tests/test_dealer_phone_sleep_barrier.js
 * E2E & Architectural Verification for Step 3.2:
 * 1. Mobile Dealer Wakeup Barrier: When phone wakes from sleep, local mutations (saveState, checkAutoLevelProgression)
 *    are strictly blocked until a fresh network snapshot is applied.
 * 2. Monotonic Level Defense: Local stale level (Level 1) NEVER overwrites server level (Level 5) on wakeup.
 * 3. Firebase Listener Leak Elimination: Repeated calls to initDataSource() properly unhook previous listeners via .off().
 */

const assert = require("assert");

console.log("▶ Running Dealer Phone Sleep & Wakeup Barrier Tests (Step 3.2)...\n");

// Защита от зависания тестов (таймаут 6с)
setTimeout(() => {
  console.error("❌ TIMEOUT: Тест test_dealer_phone_sleep_barrier.js превысил лимит времени 6с!");
  process.exit(1);
}, 6000).unref();

// Регистрация перехватчиков событий DOM
const docListeners = {};
const winListeners = {};

global.document = {
  visibilityState: "visible",
  addEventListener: (evt, cb) => {
    if (!docListeners[evt]) docListeners[evt] = [];
    docListeners[evt].push(cb);
  },
  getElementById: (id) => ({
    id,
    style: {},
    textContent: "",
    value: "",
    classList: {
      add: () => {},
      remove: () => {},
      contains: () => false,
      toggle: () => {}
    },
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => []
  }),
  querySelectorAll: () => [],
  querySelector: () => null
};

global.window = {
  addEventListener: (evt, cb) => {
    if (!winListeners[evt]) winListeners[evt] = [];
    winListeners[evt].push(cb);
  },
  Telegram: {
    WebApp: {
      ready: () => {},
      expand: () => {},
      initDataUnsafe: { user: { username: "h0raiz0n", id: 247164413 } },
      HapticFeedback: { impactOccurred: () => {}, notificationOccurred: () => {} }
    }
  }
};

const storageStore = {};
global.localStorage = {
  getItem: (k) => storageStore[k] || null,
  setItem: (k, v) => { storageStore[k] = String(v); },
  removeItem: (k) => { delete storageStore[k]; },
  clear: () => {
    for (const k in storageStore) delete storageStore[k];
  }
};

let interceptedFirebaseWrites = [];
let offCallLog = [];
const createMockRef = (path) => ({
  path,
  on: (evt, cb) => {},
  off: () => {
    offCallLog.push(path);
  },
  update: (data) => {
    interceptedFirebaseWrites.push({ method: "update", path, data });
    return Promise.resolve();
  },
  set: (data) => {
    interceptedFirebaseWrites.push({ method: "set", path, data });
    return Promise.resolve();
  },
  remove: () => {
    interceptedFirebaseWrites.push({ method: "remove", path });
    return Promise.resolve();
  }
});

global.firebase = {
  apps: [{ name: "[DEFAULT]" }],
  database: () => ({
    ref: (path) => createMockRef(path)
  })
};

global.POKER_CONFIG = require("../shared/poker-config.js");
const dealer = require("../dealer/dealer.js");

(async function runAllBarrierTests() {
  // =============================================================
  // TEST 1: Wakeup Sync Barrier Blocks Stale Mutations
  // =============================================================
  console.log("1. Проверка барьера синхронизации при пробуждении телефона (Wakeup Barrier):");

  dealer.initDealerIdentity();
  dealer.startTable();
  const myTable = dealer.getMyTable();
  
  // Устанавливаем начальное состояние стола: раунд 1 (levelIndex: 0)
  myTable.levelIndex = 0;
  myTable.status = "running";
  myTable.levelEndsAt = Date.now() - 5000; // Просроченное время раунда!
  dealer.setServerSyncPending(false);

  // Имитируем, что телефон ушел в сон (вкладка скрыта, экран выключен 30 минут)
  document.visibilityState = "hidden";

  // На сервере за 30 минут турнир ушел на 5 раунд (levelIndex: 4)
  const serverTable = Object.assign({}, myTable, {
    levelIndex: 4,
    status: "running",
    levelEndsAt: Date.now() + 300000
  });
  const serverSnapshot = {
    dealer_vlad: serverTable
  };

  // Настраиваем fetch с задержкой, симулирующей сетевой запрос после пробуждения
  let resolveNetworkFetch;
  const pendingNetworkPromise = new Promise((resolve) => {
    resolveNetworkFetch = resolve;
  });

  global.fetch = async (url) => {
    if (typeof url === "string" && url.includes("tables.json")) {
      await pendingNetworkPromise;
      return {
        ok: true,
        json: async () => serverSnapshot
      };
    }
    return {
      ok: true,
      json: async () => null
    };
  };

  // Эмулируем пробуждение телефона ведущего (пользователь включил экран)
  document.visibilityState = "visible";
  assert(docListeners["visibilitychange"] && docListeners["visibilitychange"].length > 0, "Слушатель visibilitychange должен быть зарегистрирован");
  
  // Запускаем обработчик пробуждения
  const wakeupPromise = docListeners["visibilitychange"][0]();

  // ПРОВЕРКА АКТИВАЦИИ БАРЬЕРА:
  assert.strictEqual(dealer.isServerSyncPending(), true, "При пробуждении флаг IS_SERVER_SYNC_PENDING обязан мгновенно стать true");
  console.log("   ✓ Барьер синхронизации IS_SERVER_SYNC_PENDING успешно активирован.");

  // СИМУЛЯЦИЯ ГОНКИ: Пока запрос в сети летит, таймер CPU оттаивает и вызывает checkAutoLevelProgression & saveState
  const beforeCheckLevel = myTable.levelIndex;
  dealer.checkAutoLevelProgression();
  assert.strictEqual(myTable.levelIndex, beforeCheckLevel, "checkAutoLevelProgression НЕ ДОЛЖЕН переключать уровень, пока висит барьер");
  console.log("   ✓ checkAutoLevelProgression заблокирован барьером (устаревший уровень не переключен локально).");

  // Проверяем, что saveState не отправляет устаревшее состояние в базу
  interceptedFirebaseWrites = [];
  dealer.saveState();
  assert.strictEqual(interceptedFirebaseWrites.length, 0, "saveState НЕ ДОЛЖЕН отправлять мутации в Firebase, пока активен барьер");
  console.log("   ✓ saveState заблокирован барьером (0 мутаций в Firebase при пробуждении).");

  // Отпускаем сетевой ответ (серверный снимок вернулся)
  resolveNetworkFetch();
  await wakeupPromise;

  // ПРОВЕРКА СНЯТИЯ БАРЬЕРА И ПРИНЯТИЯ СЕРВЕРНОГО СОСТОЯНИЯ:
  assert.strictEqual(dealer.isServerSyncPending(), false, "После завершения синхронизации барьер обязан быть снят (false)");
  
  const updatedTable = dealer.getMyTable();
  assert.strictEqual(updatedTable.levelIndex, 4, "Стол дилера обязан обновиться до актуального серверного раунда 5 (levelIndex: 4)");
  console.log("   ✓ Серверное состояние принято: стол дилера синхронизирован с раундом 5 (levelIndex: 4).");

  // =============================================================
  // TEST 2: Window Focus Barrier Activation
  // =============================================================
  console.log("\n2. Проверка активации барьера при window.focus:");
  assert(winListeners["focus"] && winListeners["focus"].length > 0, "Слушатель focus должен быть зарегистрирован");

  let resolveFocusFetch;
  const focusPromise = new Promise((resolve) => { resolveFocusFetch = resolve; });
  global.fetch = async () => {
    await focusPromise;
    return { ok: true, json: async () => serverSnapshot };
  };

  const focusWakeup = winListeners["focus"][0]();
  assert.strictEqual(dealer.isServerSyncPending(), true, "При фокусе окна флаг IS_SERVER_SYNC_PENDING должен стать true");
  console.log("   ✓ window.focus успешно активирует барьер синхронизации.");

  resolveFocusFetch();
  await focusWakeup;
  assert.strictEqual(dealer.isServerSyncPending(), false, "После завершения фокус-синхронизации барьер снят.");

  // =============================================================
  // TEST 3: Firebase Listener Leak Elimination (.off() check)
  // =============================================================
  console.log("\n3. Проверка устранения утечек слушателей Firebase (.off() перед подпиской):");
  offCallLog = [];
  dealer.initDataSource();

  const hasOffsetOff = offCallLog.includes(".info/serverTimeOffset");
  const hasTablesOff = offCallLog.includes("atmosphere/tables");
  const hasMttOff = offCallLog.includes("atmosphere/mtt_session");

  assert.strictEqual(hasOffsetOff, true, "initDataSource обязан вызывать .off() на .info/serverTimeOffset");
  assert.strictEqual(hasTablesOff, true, "initDataSource обязан вызывать .off() на atmosphere/tables");
  assert.strictEqual(hasMttOff, true, "initDataSource обязан вызывать .off() на atmosphere/mtt_session");
  console.log("   ✓ Утечка слушателей Firebase полностью устранена (.off() вызван для всех шин).");

  console.log("\n🎉 ВСЕ ТЕСТЫ БАРЬЕРА СИНХРОНИЗАЦИИ И ЗАЩИТЫ ОТ СНА УСПЕШНО ПРОЙДЕНЫ!");
  process.exit(0);
})();
