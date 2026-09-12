/**
 * tests/test_live_tournament_stabilization.js
 * Comprehensive E2E Verification for Live Tournament Stabilization:
 * 1. Default Structure Sync (SNG_DEEP_1500, 600s, 5/10 start, localStorage persistence, TV dynamic blinds)
 * 2. Monotonic Pause Math & Overtime Guard (pausedAt shift, 300ms debounce, holding 00:00)
 * 3. Telegram Push Notifications on Blind Raise (dealer Chat ID, notify toggle, webhook dedup & formatting)
 */

const assert = require("assert");

console.log("▶ Running Live Tournament Stabilization Tests...\n");

// -------------------------------------------------------------
// Setup Global Mocks for Node.js Environment
// -------------------------------------------------------------
const mockLocalStorage = {};
global.localStorage = {
  getItem: (k) => (k in mockLocalStorage ? mockLocalStorage[k] : null),
  setItem: (k, v) => { mockLocalStorage[k] = String(v); },
  removeItem: (k) => { delete mockLocalStorage[k]; },
  clear: () => { Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]); }
};

global.window = {
  Telegram: {
    WebApp: {
      initDataUnsafe: {
        user: { id: 7891011, username: "vlad_poker", first_name: "Влад" }
      },
      HapticFeedback: {
        impactOccurred: () => {},
        notificationOccurred: () => {}
      }
    }
  }
};

global.POKER_CONFIG = require("../shared/poker-config.js");

// Mock document for dealer and tv
const mockElements = {};
global.document = {
  getElementById: (id) => {
    if (!mockElements[id]) {
      mockElements[id] = {
        id,
        dataset: {},
        classList: {
          classes: new Set(),
          add(c) { this.classes.add(c); },
          remove(c) { this.classes.delete(c); },
          toggle(c, force) {
            if (force === undefined) {
              if (this.classes.has(c)) this.classes.delete(c);
              else this.classes.add(c);
            } else if (force) {
              this.classes.add(c);
            } else {
              this.classes.delete(c);
            }
          },
          contains(c) { return this.classes.has(c); }
        },
        style: {},
        checked: true,
        textContent: "",
        innerHTML: "",
        addEventListener: (event, handler) => {
          if (!mockElements[id].listeners) mockElements[id].listeners = {};
          mockElements[id].listeners[event] = handler;
        },
        click() {
          if (mockElements[id].listeners && mockElements[id].listeners.click) {
            mockElements[id].listeners.click({ stopPropagation: () => {} });
          }
        }
      };
    }
    return mockElements[id];
  },
  querySelectorAll: (sel) => []
};

const dealer = require("../dealer/dealer.js");
const tv = require("../tv/tv.js");
const dealerBot = require("../api/dealer-bot.js");

// =============================================================
// TEST 1: Default Structure Sync & Dynamic Blinds
// =============================================================
console.log("1. Проверка синхронизации структуры по умолчанию («Классика» SNG_DEEP_1500):");

// 1.1 Default active structure
const defaultStruct = dealer.getActiveStructure();
assert.strictEqual(defaultStruct.stack, 1500, "Дефолтный стек должен быть 1500 фишек");
assert.strictEqual(defaultStruct.levels[0].durationSec, 600, "Дефолтный раунд должен длиться 600 сек (10 мин)");
assert.strictEqual(defaultStruct.levels[0].sb, 5, "Малый блайнд 1 уровня должен быть 5");
assert.strictEqual(defaultStruct.levels[0].bb, 10, "Большой блайнд 1 уровня должен быть 10");
console.log("   ✓ dealer.getActiveStructure() возвращает Классику (1500 стек, 600с, 5/10).");

// 1.2 getMyTable() sets 600s duration and SNG_DEEP_1500
dealer.resetTable();
const table = dealer.getMyTable();
assert.strictEqual(table.structKey, "SNG_DEEP_1500", "table.structKey должен быть SNG_DEEP_1500");
assert.strictEqual(table.durationSec, 600, "table.durationSec в getMyTable() должен быть 600с (вместо старых 420с)");
console.log("   ✓ dealer.getMyTable() инициализирует стол с длительностью 600с и структурой SNG_DEEP_1500.");

// 1.3 localStorage structure persistence
localStorage.setItem("atmosphere_dealer_struct", "SNG_STANDARD");
dealer.initPillSelectors();
const standardStruct = dealer.getActiveStructure();
assert.strictEqual(standardStruct.stack, 5000, "Сохранённый выбор SNG_STANDARD должен восстановиться (стек 5000)");
assert.strictEqual(standardStruct.levels[0].durationSec, 420, "Длительность SNG_STANDARD должна быть 420с");

// Reset back to SNG_DEEP_1500
localStorage.setItem("atmosphere_dealer_struct", "SNG_DEEP_1500");
dealer.initPillSelectors();
assert.strictEqual(dealer.getActiveStructure().stack, 1500, "Восстановлен SNG_DEEP_1500");
console.log("   ✓ Выбор структуры сохраняется и восстанавливается через localStorage.");

// 1.4 TV Dynamic Break Screen Blinds
let capturedHtml = "";
const originalGetElementById = document.getElementById;
document.getElementById = (id) => {
  if (id === "tv-viewport") {
    return {
      id: "tv-viewport",
      dataset: {},
      classList: { toggle: () => {}, remove: () => {}, contains: () => false },
      set innerHTML(val) { capturedHtml = val; },
      get innerHTML() { return capturedHtml; }
    };
  }
  return originalGetElementById(id);
};

// Break screen for SNG_DEEP_1500 table
const mockClassicTable = {
  id: "dealer_vlad",
  dealerName: "Влад",
  format: "SnG",
  structKey: "SNG_DEEP_1500",
  status: "finished",
  isPostGameBreak: true,
  nextGameAt: Date.now() + 300 * 1000,
  breakDurationSec: 600
};
tv.setActiveTables({ dealer_vlad: mockClassicTable });
tv.renderTables();
assert(capturedHtml.includes("5 / 10"), "На экране перерыва для Классики должны динамически отображаться стартовые блайнды 5 / 10");
assert(!capturedHtml.includes("25 / 50"), "На экране перерыва для Классики не должно быть захардкоженных 25 / 50");

// Break screen for SNG_STANDARD table
const mockStandardTable = {
  id: "dealer_vlad",
  dealerName: "Влад",
  format: "SnG",
  structKey: "SNG_STANDARD",
  status: "finished",
  isPostGameBreak: true,
  nextGameAt: Date.now() + 300 * 1000,
  breakDurationSec: 600
};
tv.setActiveTables({ dealer_vlad: mockStandardTable });
tv.renderTables();
assert(capturedHtml.includes("25 / 50"), "На экране перерыва для Атмосфера Pro должны динамически отображаться стартовые блайнды 25 / 50");
console.log("   ✓ ТВ динамически отображает стартовые блайнды на экране перерыва в зависимости от структуры.");

// 1.5 TV Default fallback structure when structKey is omitted
const fallbackStructure = tv.getTableStructure({});
assert.strictEqual(fallbackStructure[0].sb, 5, "Дефолтная структура без structKey на ТВ должна начинаться с 5");
assert.strictEqual(fallbackStructure[0].bb, 10, "Дефолтная структура без structKey на ТВ должна начинаться с 10");
assert.strictEqual(fallbackStructure[0].durationSec, 600, "Дефолтная структура без structKey на ТВ должна длиться 600с");
console.log("   ✓ ТВ использует SNG_DEEP_1500 (5/10, 600с) как базовый клубный фоллбэк при отсутствии structKey.");


// =============================================================
// TEST 2: Monotonic Pause Math & Overtime Guard
// =============================================================
console.log("\n2. Проверка монотонной математики паузы и защиты овертайма:");

dealer.resetTable();
dealer.startTable();
const runningTable = dealer.getMyTable();
assert.strictEqual(runningTable.status, "running", "Стол должен быть в статусе running");
const initialStartedAt = runningTable.startedAt;
const initialLevelEndsAt = runningTable.levelEndsAt;

// 2.1 Pause preserves timing and stores pausedAt
dealer.togglePause();
assert.strictEqual(runningTable.status, "paused", "Стол должен перейти в paused");
assert(runningTable.pausedAt > 0, "Должно быть зафиксировано время pausedAt");
assert.strictEqual(runningTable.levelEndsAt, null, "Во время паузы levelEndsAt должен быть null (согласно контракту точности)");
assert(runningTable.remainingMs > 0, "remainingMs должен сохранять остаток времени");
const pausedRemaining = runningTable.remainingMs;

// Simulate 5 seconds in pause
const fakePauseDuration = 5000;
runningTable.pausedAt -= fakePauseDuration;

// 2.2 Resume shifts startedAt forward
dealer.togglePause();
assert.strictEqual(runningTable.status, "running", "Стол должен возобновиться в status running");
assert.strictEqual(runningTable.pausedAt, null, "Флаг pausedAt должен быть сброшен");
assert(runningTable.startedAt >= initialStartedAt + fakePauseDuration, "startedAt должен быть сдвинут вперед на длительность паузы");
assert(runningTable.levelEndsAt > Date.now(), "levelEndsAt должен быть корректно восстановлен в будущее");
console.log("   ✓ Постановка на паузу и возобновление сдвигают startedAt без дрифта таймера.");

// 2.3 300ms Click Debounce
dealer.togglePause(true); // First click toggles to paused
assert.strictEqual(runningTable.status, "paused", "Первый клик должен перевести в paused");
dealer.togglePause(true); // Immediate rapid second click within 300ms
assert.strictEqual(runningTable.status, "paused", "Быстрый дабл-тап в пределах 300мс должен игнорироваться");
// Wait/simulate timestamp shift > 300ms
const lastClickTs = dealer.getLastPauseClickTs();
assert(lastClickTs > 0, "Время последнего клика должно быть сохранено");
// Toggle back to running directly (programmatic call without debounce flag)
dealer.togglePause();
assert.strictEqual(runningTable.status, "running", "Прямой вызов togglePause возобновляет работу");
console.log("   ✓ Защита от дребезга клика (300мс debounce) предотвращает случайный дабл-тап.");

// 2.4 Overtime Guard (Pause at 00:00 / overtime)
// Simulate level reaching 00:00
runningTable.levelEndsAt = Date.now() - 5000; // 5 сек в овертайме
dealer.togglePause(); // дилер жмет паузу во время раздачи при 00:00
assert.strictEqual(runningTable.status, "paused");
assert.strictEqual(runningTable.requireManualStep, true, "Пауза в овертайме должна активировать requireManualStep = true");
assert(runningTable.overtimePausedMs >= 5000, "overtimePausedMs должен зафиксировать время пересидки");

// Resume table
dealer.togglePause();
assert.strictEqual(runningTable.status, "running");
assert.strictEqual(runningTable.requireManualStep, true, "После снятия с паузы requireManualStep должен оставаться true");
assert.strictEqual(runningTable.remainingMs, 0, "В овертайме таймер должен оставаться на 00:00");

// Check that auto progression does NOT trigger while requireManualStep is true
const currentLevel = runningTable.levelIndex;
dealer.checkAutoLevelProgression();
assert.strictEqual(runningTable.levelIndex, currentLevel, "Автопрогрессия НЕ должна повышать уровень пока requireManualStep = true");

// Manual step level releases overtime guard
dealer.stepLevelWithUndo();
assert.strictEqual(runningTable.levelIndex, currentLevel + 1, "Ручной шаг должен перевести на следующий уровень");
assert.strictEqual(runningTable.requireManualStep, false, "Ручной шаг должен сбросить requireManualStep в false");
console.log("   ✓ Защита овертайма удерживает 00:00 и блокирует автоперескок до ручного подтверждения дилером.");

// 2.5 Undo step level restores previous state including requireManualStep
dealer.undoStepLevel();
assert.strictEqual(runningTable.levelIndex, currentLevel, "Undo должно возвращать предыдущий номер уровня");
assert.strictEqual(runningTable.requireManualStep, true, "Undo должно восстанавливать состояние requireManualStep");
dealer.stepLevelWithUndo(); // Re-advance
assert.strictEqual(runningTable.levelIndex, currentLevel + 1);

// 2.6 Button layout flex column verification
dealer.renderDealerView();
const runningBtnRow = document.getElementById("running-btn-row");
assert.strictEqual(runningBtnRow.style.display, "flex", "Кнопки паузы и шага должны отображаться через flex-лейаут (колонка)");
console.log("   ✓ Кнопка паузы и шаг разнесены и отрендерены через display: flex.");


// =============================================================
// TEST 3: Telegram Push Notifications on Blind Raise
// =============================================================
console.log("\n3. Проверка Telegram-уведомлений о поднятии блайндов:");

// 3.1 Dealer Identity Chat ID extraction
dealer.initDealerIdentity();
const myTableWithChat = dealer.getMyTable();
assert.strictEqual(String(myTableWithChat.dealerChatId), "7891011", "Chat ID должен автоматически извлечься из Telegram.WebApp");
assert.strictEqual(String(dealer.getDealerChatId()), "7891011", "DEALER_CHAT_ID должен быть установлен");
console.log("   ✓ Chat ID ведущего автоматически извлекается из Telegram WebApp.");

// 3.2 Bot Webhook notify_blind_raise Handler & Message Formatting
async function testBotWebhook() {
  const createMockRes = () => ({
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(d) { this.body = d; return this; }
  });

  // Test 3.2.1 Format with ante
  const reqAnte = {
    method: "POST",
    body: {
      action: "notify_blind_raise",
      tableId: "table_vlad_test_ante",
      dealerChatId: 7891011,
      levelIndex: 5,
      sb: 200,
      bb: 400,
      ante: 400
    }
  };
  const resAnte = createMockRes();
  await dealerBot(reqAnte, resAnte);
  assert.strictEqual(resAnte.statusCode, 200, "Бот должен вернуть статус 200");
  assert.strictEqual(resAnte.body.round, 6, "Раунд должен быть 6 (levelIndex 5 + 1)");
  assert.strictEqual(resAnte.body.text, "🔔 Раунд 6: 200 / 400 (анте 400)", "Текст с анте должен соответствовать формату");

  // Test 3.2.2 Deduplication guard
  const resDup = createMockRes();
  await dealerBot(reqAnte, resDup);
  assert.strictEqual(resDup.statusCode, 200);
  assert.strictEqual(resDup.body.skipped, true, "Повторный запрос для того же уровня должен быть дедуплицирован");
  assert.strictEqual(resDup.body.reason, "duplicate");
  console.log("   ✓ Бот корректно форматирует пуш с анте и производит дедупликацию повторных вызовов.");

  // Test 3.2.3 Format without ante
  const reqNoAnte = {
    method: "POST",
    body: {
      action: "notify_blind_raise",
      tableId: "table_vlad_test_noante",
      dealerChatId: 7891011,
      levelIndex: 1,
      sb: 10,
      bb: 25,
      ante: 0
    }
  };
  const resNoAnte = createMockRes();
  await dealerBot(reqNoAnte, resNoAnte);
  assert.strictEqual(resNoAnte.statusCode, 200);
  assert.strictEqual(resNoAnte.body.round, 2);
  assert.strictEqual(resNoAnte.body.text, "🔔 Раунд 2: 10 / 25", "Текст без анте должен соответствовать формату");
  console.log("   ✓ Бот корректно форматирует пуш без анте (🔔 Раунд X: SB / BB).");

  // Test 3.2.4 Cross-client dedup (TV passes tableId: 'table' while dealer passes 'dealer_vlad')
  const reqTv = {
    method: "POST",
    body: {
      action: "notify_blind_raise",
      tableId: "table",
      dealerChatId: 7891011,
      levelIndex: 8,
      sb: 800,
      bb: 1600,
      ante: 0
    }
  };
  const resTv = createMockRes();
  await dealerBot(reqTv, resTv);
  assert.strictEqual(resTv.statusCode, 200);
  assert.strictEqual(resTv.body.round, 9);

  const reqDealerSameLvl = {
    method: "POST",
    body: {
      action: "notify_blind_raise",
      tableId: "dealer_vlad",
      dealerChatId: 7891011,
      levelIndex: 8,
      sb: 800,
      bb: 1600,
      ante: 0
    }
  };
  const resDealerSameLvl = createMockRes();
  await dealerBot(reqDealerSameLvl, resDealerSameLvl);
  assert.strictEqual(resDealerSameLvl.statusCode, 200);
  assert.strictEqual(resDealerSameLvl.body.skipped, true, "Кросс-клиентский запрос ТВ и пульта с разными tableId должен дедуплицироваться");
  console.log("   ✓ Кросс-клиентская дедупликация (ТВ + пульт дилера) предотвращает дублирующие пуши.");
}

async function run() {
  await testBotWebhook();

  // 3.3 Dealer Notify Toggle & Suppression
  dealer.resetTable();
  const notifyTable = dealer.getMyTable();
  assert.strictEqual(notifyTable.notifyBlinds, true, "По умолчанию пуши должны быть включены");

  // Toggle off
  localStorage.setItem("atmosphere_notify_blinds", "false");
  const toggleEl = document.getElementById("toggle-notify-blinds");
  toggleEl.checked = false;
  dealer.initNotifyToggle();
  assert.strictEqual(notifyTable.notifyBlinds, false, "После выключения в настройках notifyBlinds должен стать false");

  // Attempt notification when toggle is false
  let fetchCalled = false;
  global.fetch = (url, opts) => {
    fetchCalled = true;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  };

  dealer.notifyBlindRaise(notifyTable, 2);
  assert.strictEqual(fetchCalled, false, "При выключенном тумблере notifyBlinds запрос не должен отправляться");

  // Re-enable toggle
  notifyTable.notifyBlinds = true;
  dealer.notifyBlindRaise(notifyTable, 2);
  assert.strictEqual(fetchCalled, true, "При включенном тумблере запрос на отправку пуша должен отправляться");
  console.log("   ✓ Тумблер в настройках пульта надёжно включает и отключает отправку уведомлений.");

  console.log("\n=======================================================");
  console.log("🎉 ВСЕ ПРОВЕРКИ СТАБИЛИЗАЦИИ ТУРНИРОВ УСПЕШНО ПРОЙДЕНЫ!");
  console.log("=======================================================");
}

run();
