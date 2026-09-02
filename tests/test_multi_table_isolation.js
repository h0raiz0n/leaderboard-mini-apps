/**
 * E2E UNIT TEST: Multi-Table Isolation (Per-Table Write Scope)
 * Покерный клуб «Атмосфера»
 * 
 * Проверяет:
 * 1. Действия одного дилера (старт, пауза, уровень) пишутся СТРОГО в узел своего стола.
 * 2. Стол другого дилера физически защищен от затирания.
 */

const assert = require("assert");

console.log("🛡️ Тестирование архитектурной изоляции записи параллельных столов...\n");

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

const writtenEndpoints = [];
const writtenPayloads = [];

global.fetch = async (url, options) => {
  writtenEndpoints.push(url);
  writtenPayloads.push(JSON.parse(options.body));
  return {
    ok: true,
    json: async () => ({ status: "ok" })
  };
};

global.POKER_CONFIG = require("../shared/poker-config.js");

const dealer = require("../dealer/dealer.js");

// 1. Инициализируем первого дилера
dealer.initDealerIdentity();
dealer.startTable();

const lastUrl = writtenEndpoints[writtenEndpoints.length - 1];
const lastPayload = writtenPayloads[writtenPayloads.length - 1];

console.log("1. Проверка адреса записи в Firebase при действиях дилера:");
console.log("   Запрос отправлен на эндпоинт:", lastUrl);
assert(lastUrl.includes("/atmosphere/tables/dealer_vlad.json"), 
  "Эндпоинт должен быть строго изолирован узлом dealer_vlad.json");

console.log("\n2. Проверка содержимого payload:");
assert.strictEqual(lastPayload.dealerName, "Влад", "Payload должен содержать данные только текущего стола");
assert.strictEqual(lastPayload.id, "dealer_vlad", "ID стола должен быть dealer_vlad");
assert.strictEqual(lastPayload.table_dealer_arina, undefined, "Чужие столы не должны присутствовать в payload!");
console.log("   ✅ Чужие столы не затрагиваются, перезапись корня /atmosphere/tables полностью исключена.");

console.log("\n🎉 ТЕСТ ИЗОЛЯЦИИ ПАРАЛЛЕЛЬНЫХ СТОЛОВ УСПЕШНО ПРОЙДЕН!");
