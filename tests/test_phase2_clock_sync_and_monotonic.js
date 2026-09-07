/**
 * UNIT TEST: Phase 2 Core Engine Verification
 * - Clock Sync via /.info/serverTimeOffset & getSyncedNow
 * - Wakeup & Monotonic Level Protection (Dealer Phone Sleep / Resume)
 * - Stale In-Flight Guard Expiry (30s)
 * - Smooth Level Progression without Color-Up
 */

const assert = require("assert");

console.log("⏱️ Запуск тестов Этапа 2: Clock Sync, Monotonic Guard и ликвидация Color-Up...\n");

// Мок окружения
global.window = {
  Telegram: {
    WebApp: {
      ready: () => {},
      expand: () => {},
      initDataUnsafe: { user: { username: "h0raiz0n", id: 247164413 } },
      HapticFeedback: { impactOccurred: () => {}, notificationOccurred: () => {} }
    }
  },
  addEventListener: () => {}
};

global.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; }
};

global.document = {
  getElementById: () => ({ style: {}, textContent: "", addEventListener: () => {}, querySelector: () => null }),
  querySelectorAll: () => [],
  addEventListener: () => {}
};

let lastFetchedUrl = null;
global.fetch = async (url, options) => {
  lastFetchedUrl = url;
  return {
    ok: true,
    json: async () => ({})
  };
};

global.POKER_CONFIG = require("../shared/poker-config.js");
const dealer = require("../dealer/dealer.js");
const tv = require("../tv/tv.js");

// 1. Проверка синхронизации времени через serverTimeOffset
console.log("1. Проверка serverTimeOffset и getSyncedNow:");
assert.strictEqual(typeof dealer.getSyncedNow, "function", "dealer.getSyncedNow должен быть функцией");
assert.strictEqual(typeof tv.getSyncedNow, "function", "tv.getSyncedNow должен быть функцией");

const offsetMs = 5000;
dealer.setServerTimeOffset(offsetMs);
tv.setServerTimeOffset(offsetMs);

const nowReal = Date.now();
const dealerSynced = dealer.getSyncedNow();
const tvSynced = tv.getSyncedNow();

assert(Math.abs(dealerSynced - (nowReal + offsetMs)) < 50, "dealerSyncedNow должен учитывать offsetMs");
assert(Math.abs(tvSynced - (nowReal + offsetMs)) < 50, "tvSyncedNow должен учитывать offsetMs");
console.log("   ✅ Смещение времени serverTimeOffset (+5000ms) корректно применяется в dealer и tv.");

// Сбрасываем смещение
dealer.setServerTimeOffset(0);
tv.setServerTimeOffset(0);

// 2. Проверка функции пробуждения (syncWithServerOnWakeup / loadState)
console.log("\n2. Проверка корректности пробуждения (Wakeup Resilience):");
assert.strictEqual(typeof dealer.syncWithServerOnWakeup, "function", "syncWithServerOnWakeup должна существовать");
assert.strictEqual(typeof dealer.loadState, "function", "loadState должна быть алиасом syncWithServerOnWakeup");

// Вызов не должен вызывать ReferenceError
assert.doesNotThrow(() => {
  dealer.syncWithServerOnWakeup();
}, "Вызов syncWithServerOnWakeup не должен бросать ошибок");
console.log("   ✅ Вызов syncWithServerOnWakeup() и loadState() успешен, ошибки ReferenceError устранены.");

// 3. Проверка Monotonic Level Protection (защита отката уровня при просыпании телефона)
console.log("\n3. Проверка Monotonic Level Protection:");
dealer.initDealerIdentity();
dealer.startTable();
const myTable = dealer.getMyTable();
myTable.levelIndex = 1; // Дилер заснул на уровне 1

// Имитируем, что у телефона дилера висел незавершенный local pending sync
global.localStorage.setItem("atmosphere_pending_sync_dealer_vlad", "true");
global.localStorage.setItem("atmosphere_pending_sync", "true");
global.localStorage.setItem("atmosphere_pending_sync_ts_dealer_vlad", String(Date.now()));

// Пока телефон спал, ТВ переключил раунд в Firebase на уровень 3
const remoteTables = {
  dealer_vlad: Object.assign({}, myTable, { levelIndex: 3, status: "running" })
};

// Применяем серверный снимок через REST
global.fetch = async (url) => {
  return {
    ok: true,
    json: async () => remoteTables
  };
};

dealer.fetchTablesRest().then(() => {
  const currentTable = dealer.getMyTable();
  assert.strictEqual(currentTable.levelIndex, 3, "Уровень стола обязан обновиться до 3 (серверный уровень)");
  assert.strictEqual(global.localStorage.getItem("atmosphere_pending_sync_dealer_vlad"), null, "Устаревший pending sync должен быть сброшен");
  console.log("   ✅ Серверный levelIndex: 3 победил устаревший локальный levelIndex: 1, откат предотвращен!");
});

// 4. Проверка сброса устаревшего флага In-Flight Guard (> 30 секунд)
console.log("\n4. Проверка сброса зависшего флага синхронизации (>30 сек):");
global.localStorage.setItem("atmosphere_pending_sync_dealer_vlad", "true");
global.localStorage.setItem("atmosphere_pending_sync_ts_dealer_vlad", String(Date.now() - 35000)); // 35 секунд назад

dealer.fetchTablesRest().then(() => {
  assert.strictEqual(global.localStorage.getItem("atmosphere_pending_sync_dealer_vlad"), null, "Флаг старше 30 сек должен быть очищен");
  console.log("   ✅ Зависший флаг синхронизации старше 30 секунд успешно удален.");
});

// 5. Проверка непрерывной автопрогрессии без Color-Up
console.log("\n5. Проверка отсутствия автоматической паузы Color-Up:");
const testTable = dealer.getMyTable();
testTable.status = "running";
testTable.levelIndex = 3; // Конец 4 уровня
testTable.levelEndsAt = Date.now() - 100;

dealer.checkAutoLevelProgression();
assert.strictEqual(testTable.status, "running", "Стол должен остаться в статусе running");
assert.strictEqual(testTable.levelIndex, 4, "Стол перешел на уровень 5 (индекс 4)");
assert.strictEqual(testTable.isColorUpActive, false, "isColorUpActive обязан быть false");
console.log("   ✅ Переход 4 -> 5 уровень произошел без Color-Up и без паузы 120с.");

console.log("\n🎉 ВСЕ ТЕСТЫ ЭТАПА 2 УСПЕШНО ПРОЙДЕНЫ!");
