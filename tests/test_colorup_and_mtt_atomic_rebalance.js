/**
 * E2E UNIT TEST: Automatic Color-Up (after 100/200) & MTT Atomic Cross-Table Rebalance
 * Покерный клуб «Атмосфера»
 */

const assert = require("assert");

console.log("🪙 Тестирование Color-Up после 100/200 и атомарного ребаланса МТТ...\n");

// Моки окружения
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
  getElementById: () => ({ style: {}, textContent: "", addEventListener: () => {} }),
  querySelectorAll: () => [],
  addEventListener: () => {}
};

const networkRequests = [];
global.fetch = async (url, options) => {
  networkRequests.push({ url, body: options.body ? JSON.parse(options.body) : null });
  return { ok: true, json: async () => ({}) };
};

global.POKER_CONFIG = require("../shared/poker-config.js");
const dealer = require("../dealer/dealer.js");

// 1. Проверка непрерывной автопрогрессии уровней (Color-Up НЕ останавливает игру)
console.log("1. Проверка непрерывной автопрогрессии после уровня 4 (100/200):");
dealer.initDealerIdentity();
dealer.startTable();

const table = dealer.getMyTable();
table.levelIndex = 3; // Уровень 4: 100 / 200
table.colorUpDone = false;
table.isColorUpActive = false;
table.levelEndsAt = Date.now() - 500; // Истек

dealer.checkAutoLevelProgression();

assert.strictEqual(table.status, "running", "Статус должен остаться running (без автопаузы Color-Up)");
assert.strictEqual(table.levelIndex, 4, "Стол должен автоматически перейти на уровень 5 (150/300)");
assert.strictEqual(table.isColorUpActive, false, "isColorUpActive должен быть false");
console.log("   ✅ После уровня 100/200 игра продолжается непрерывно без блокировки на Color-Up.");

// 2. Тест обратной совместимости skipColorUp
console.log("\n2. Проверка функции skipColorUp (безопасный сброс):");
dealer.skipColorUp();

assert.strictEqual(table.isColorUpActive, false, "isColorUpActive должен быть false");
console.log("   ✅ Вызов skipColorUp безопасен и сбрасывает устаревшие флаги.");

// 3. Тест атомарного ребаланса МТТ (Target Table Scoped Update)
console.log("\n3. Проверка атомарного обновления игроков целевого стола при МТТ ребалансе:");
table.format = "MTT";
table.status = "running";
table.playersCount = 9;

const targetTable = {
  id: "dealer_arina",
  dealerName: "Арина",
  format: "MTT",
  status: "running",
  playersCount: 7
};

dealer.setTablesState({
  dealer_vlad: table,
  dealer_arina: targetTable
});

dealer.checkMttRebalance(); // Запускает поиск цели пересадки (дельта 9 - 7 = 2 >= 2)
dealer.confirmRebalance();

const targetUpdateReq = networkRequests.find(r => r.url.includes("dealer_arina/playersCount.json"));
assert(targetUpdateReq, "Должен быть отправлен точечный запрос на обновление playersCount целевого стола (dealer_arina)");
console.log("   Запрос отправлен на URL:", targetUpdateReq.url);
console.log("   Новое число игроков на целевом столе:", targetUpdateReq.body);
assert.strictEqual(targetUpdateReq.body, 8, "Число игроков на целевом столе должно вырасти с 7 до 8");
assert.strictEqual(table.playersCount, 8, "Число игроков на текущем столе должно уменьшиться с 9 до 8");
console.log("   ✅ Целевой стол атомарно обновлен в Firebase без перезаписи чужого таймера.");

console.log("\n🎉 ТЕСТ COLOR-UP И АТОМАРНОГО РЕБАЛАНСА МТТ УСПЕШНО ПРОЙДЕН!");
