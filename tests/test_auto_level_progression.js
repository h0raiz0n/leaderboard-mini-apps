/**
 * E2E UNIT TEST: Automatic Blind Level Progression & Chime (TDv3 Standard)
 * Покерный клуб «Атмосфера»
 * 
 * Проверяет:
 * 1. Автоматический переход на следующий уровень блайндов по истечении таймера.
 * 2. Отсутствие необходимости ручного нажатия «Следующий уровень» дилером.
 * 3. Корректную отработку как на пульте дилера, так и на ТВ-дашборде.
 */

const assert = require("assert");

console.log("🔔 Тестирование автоматического перехода уровней блайндов (стандарт TDv3)...\n");

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

let capturedHtml = "";
global.document = {
  getElementById: (id) => {
    if (id === "tv-viewport") {
      return {
        dataset: {},
        get innerHTML() { return capturedHtml; },
        set innerHTML(v) { capturedHtml = v; }
      };
    }
    return { style: {}, textContent: "", addEventListener: () => {} };
  },
  querySelectorAll: () => [],
  addEventListener: () => {}
};

global.fetch = async () => ({ ok: true, json: async () => ({}) });
global.POKER_CONFIG = require("../shared/poker-config.js");

const dealer = require("../dealer/dealer.js");
const tv = require("../tv/tv.js");

// 1. Тест авто-перехода в пульте дилера
console.log("1. Тест автоперехода уровня в пульте дилера (dealer.js):");
dealer.initDealerIdentity();
dealer.startTable();

const table = dealer.getMyTable();
assert.strictEqual(table.levelIndex, 0, "На старте уровень должен быть 0 (25/50)");

// Симулируем истечение времени уровня (таймер ушел в прошлое на 500 мс)
table.levelEndsAt = Date.now() - 500;

dealer.checkAutoLevelProgression();

assert.strictEqual(table.levelIndex, 1, "Уровень должен АВТОМАТИЧЕСКИ переключиться на 1 (50/100)");
assert(table.levelEndsAt > Date.now(), "Новый levelEndsAt должен быть установлен на будущее время");
assert.strictEqual(table.durationSec, 420, "Длительность нового уровня должна быть 420 сек");
console.log("   ✅ Пульт дилера автоматически переключил уровень с 0 на 1 без ручных кликов.");

// 2. Тест авто-перехода на ТВ-дашборде (tv.js)
console.log("\n2. Тест автоперехода уровня на ТВ-дашборде (tv.js):");
const tvTables = {
  dealer_vlad: {
    id: "dealer_vlad",
    dealerName: "Влад",
    format: "SnG",
    status: "running",
    levelIndex: 1,
    durationSec: 420,
    levelEndsAt: Date.now() - 1000 // Истек 1 секунду назад
  }
};

tv.setActiveTables(tvTables);
tv.renderTables();

assert.strictEqual(tvTables.dealer_vlad.levelIndex, 2, "ТВ должен АВТОМАТИЧЕСКИ переключить уровень с 1 на 2");
assert(tvTables.dealer_vlad.levelEndsAt > Date.now(), "ТВ должен выставить таймер следующего уровня на будущее");
console.log("   ✅ ТВ-дашборд автоматически перевел уровень на следующий (75/150).");

console.log("\n🎉 ТЕСТ АВТОМАТИЧЕСКОГО ПЕРЕКЛЮЧЕНИЯ УРОВНЕЙ БЛАЙНДОВ УСПЕШНО ПРОЙДЕН!");
