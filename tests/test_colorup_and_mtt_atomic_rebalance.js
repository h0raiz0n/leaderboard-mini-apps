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

// 1. Тест автоматического Color-Up после 100/200
console.log("1. Проверка автоматического входа в Color-Up после уровня 4 (100/200):");
dealer.initDealerIdentity();
dealer.startTable();

const table = dealer.getMyTable();
table.levelIndex = 3; // Уровень 4: 100 / 200
table.colorUpDone = false;
table.isColorUpActive = false;
table.levelEndsAt = Date.now() - 500; // Истек

dealer.checkAutoLevelProgression();

assert.strictEqual(table.colorUpDone, true, "Флаг colorUpDone должен стать true");
assert.strictEqual(table.isColorUpActive, true, "isColorUpActive должен быть активен");
assert.strictEqual(table.status, "paused", "Статус должен перейти в paused");
assert(table.pauseEndsAt > Date.now(), "pauseEndsAt должен быть установлен на будущее время");
assert.strictEqual(table.pauseTotalSec, 120, "Длительность Color-Up должна быть ровно 120 сек (2 мин)");
console.log("   ✅ После уровня 100/200 автоматически включился 2-минутный Color-Up.");

// 2. Тест пропуска Color-Up дилером
console.log("\n2. Проверка пропуска Color-Up дилером (skipColorUp):");
dealer.skipColorUp();

assert.strictEqual(table.isColorUpActive, false, "isColorUpActive должен отключиться");
assert.strictEqual(table.status, "running", "Статус стола должен снова стать running");
assert.strictEqual(table.levelIndex, 4, "Стол должен перейти на уровень 5 (150/300)");
assert.strictEqual(dealer.getActiveStructure().levels[table.levelIndex].label, "150 / 300", "Блайнды должны стать 150/300");
console.log("   ✅ Color-Up успешно пропущен в один клик, начался уровень 150/300.");

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
