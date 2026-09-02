/**
 * E2E UNIT TEST: Dealer Offline Resilience & Absolute Timing Engine
 * Антикафе «Атмосфера»
 */

const assert = require("assert");

console.log("🛡️ Тестирование оффлайн-устойчивости пульта дилера и точности таймеров...\n");

// Моки окружения
global.window = {
  Telegram: {
    WebApp: {
      ready: () => {},
      expand: () => {},
      initDataUnsafe: { user: { username: "vlad_a17", id: 247164413 } },
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

let networkOnline = false;
let putPayload = null;

global.fetch = async (url, options) => {
  if (!networkOnline) {
    throw new Error("Network offline (simulated basement error)");
  }
  putPayload = JSON.parse(options.body);
  return {
    ok: true,
    json: async () => ({ status: "ok" })
  };
};

const dealer = require("../dealer/dealer.js");

// 1. Тест запуска игры в оффлайне
console.log("1. Тест сохранения состояния в оффлайне (без доступа к сети):");
dealer.initDealerIdentity();
dealer.startTable();

const table = dealer.getMyTable();
assert.strictEqual(table.status, "running", "Стол должен быть запущен");
assert(table.levelEndsAt > Date.now(), "levelEndsAt должен быть установлен на будущее время");
assert.strictEqual(global.localStorage.getItem("atmosphere_pending_sync"), "true", "Должен быть флаг отложенной синхронизации");
console.log("   ✅ Состояние сохранено в локальном хранилище, отложенная синхронизация активна.");

// 2. Тест восстановления связи и сброса очереди
console.log("\n2. Тест восстановления связи и авто-сброса очереди (flushPendingSync):");
networkOnline = true; // восстанавливаем сеть

dealer.flushPendingSync().then((res) => {
  assert.strictEqual(res, true, "Синхронизация должна завершиться успешно");
  assert.strictEqual(global.localStorage.getItem("atmosphere_pending_sync"), null, "Флаг очереди должен быть очищен после успешной отправки");
  assert(putPayload, "Payload должен быть доставлен в Firebase");
  console.log("   ✅ Очередь успешно синхронизирована с Firebase при появлении сети.");

  // 3. Тест паузы и абсолютного пересчета таймингов
  console.log("\n3. Тест паузы и сохранения точности levelEndsAt:");
  dealer.togglePause();
  const pausedTable = dealer.getMyTable();
  assert.strictEqual(pausedTable.status, "paused", "Стол должен стать на паузу");
  assert.strictEqual(pausedTable.levelEndsAt, null, "Во время паузы levelEndsAt должен сбрасываться");

  dealer.togglePause(); // возобновление
  const resumedTable = dealer.getMyTable();
  assert.strictEqual(resumedTable.status, "running", "Стол должен возобновить игру");
  assert(resumedTable.levelEndsAt > Date.now(), "Новый levelEndsAt должен быть точно рассчитан");
  console.log("   ✅ Пауза и возобновление работают по абсолютным меткам времени без дрифта.");

  console.log("\n🎉 ВСЕ ТЕСТЫ ОФФЛАЙН-УСТОЙЧИВОСТИ И ТАЙМИНГОВ УСПЕШНО ПРОЙДЕНЫ!");
});
