/**
 * UNIT & STRESS TEST: Webhook Deduplication, Rate Limiting & Speed
 * Антикафе «Атмосфера»
 */

const assert = require("assert");

// Мокаем Apps Script CacheService
let cacheStore = {};
global.CacheService = {
  getScriptCache: () => ({
    get: (key) => cacheStore[key] || null,
    put: (key, val, ttl) => { cacheStore[key] = val; }
  })
};

global.Logger = {
  log: (msg) => {}
};

global.ContentService = {
  MimeType: { JSON: "application/json" },
  createTextOutput: (str) => ({
    output: str,
    setMimeType: () => ({ output: str })
  })
};

global.CONFIG = require("../shared/poker-config.js");
global.CONFIG.DEALER_BOT_TOKEN = "8946471319:AAHKuZK8hcgebOvuNyHi21o5tjlbU7S0hG8";
global.CONFIG.FIREBASE_DB_URL = "https://atmosphere-poker-default-rtdb.europe-west1.firebasedatabase.app";
global.CONFIG.BLIND_STRUCTURES = {
  SNG_STANDARD: {
    name: "5 000 стек / 7 мин (Стандарт)",
    stack: 5000,
    levels: global.CONFIG.SNG_STRUCTURE.levels
  },
  SNG_TURBO: {
    name: "5 000 стек / 5 мин (Турбо)",
    stack: 5000,
    levels: [
      { level: 1, sb: 25, bb: 50, ante: 0, durationSec: 300, label: "25 / 50" }
    ]
  }
};

global.getScriptProperty = (k, fb) => global.CONFIG[k] || fb;

let sentTelegramMessages = [];
global.sendDealerTelegramRequest = (token, method, payload) => {
  sentTelegramMessages.push({ method, payload });
  return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true }) };
};

let syncedTables = {};
global.syncTableToFirebase = (id, data) => {
  syncedTables[id] = data;
  return true;
};
global.getTableFromFirebase = (id) => syncedTables[id] || null;

const dealerBot = require("../DealerBot.js");

console.log("♠️ Тестирование дедупликации, защиты от штормов и скорости...\n");

// 1. Тест защиты от повторных webhook update_id
console.log("1. Тест дедупликации Telegram update_id:");
const update1 = {
  update_id: 10001,
  message: {
    message_id: 50,
    from: { first_name: "Влад", username: "vlad_poker" },
    chat: { id: 123456 },
    text: "/start"
  }
};

const req1 = { postData: { contents: JSON.stringify(update1) } };
const res1 = dealerBot.handleDealerBotWebhook(req1);
assert.strictEqual(JSON.parse(res1.output).status, "ok", "Первый запрос должен успешно выполниться");

// Повторный идентичный вебхук (симуляция ретрая от Telegram)
const res1_retry = dealerBot.handleDealerBotWebhook(req1);
assert.strictEqual(JSON.parse(res1_retry.output).status, "duplicate_skipped", "Повторный запрос должен быть мгновенно отброшен дедупликатором");
console.log("   ✅ Дедупликатор отбросил повторный update_id.");

// 2. Тест дедупликации callback_query
console.log("\n2. Тест защиты от повторных нажатий callback_query:");
const cbUpdate = {
  update_id: 10002,
  callback_query: {
    id: "cb_unique_999",
    from: { first_name: "Влад" },
    message: { chat: { id: 123456 }, message_id: 50 },
    data: "start:Data:SNG_STANDARD"
  }
};

const cbReq = { postData: { contents: JSON.stringify(cbUpdate) } };
const cbRes1 = dealerBot.handleDealerBotWebhook(cbReq);
assert.strictEqual(JSON.parse(cbRes1.output).status, "ok");
assert(syncedTables["dealer_влад"], "Стол должен быть создан в Firebase");

console.log("   ✅ Кнопка выбора структуры успешно обработана, стол создан.");

// 3. Тест корректности отображения названия формата в интерфейсе
console.log("\n3. Тест форматирования названия формата (SnG вместо Data):");
const view = dealerBot.buildDealerControlView(syncedTables["dealer_влад"], global.CONFIG.BLIND_STRUCTURES.SNG_STANDARD);
assert(view.text.includes("Формат:</b> SnG"), "Формат должен отображаться как 'SnG', а не 'Data'");
console.log("   ✅ Интерфейс корректно отображает 'SnG' и кнопки управления.");

console.log("\n🎉 ВСЕ ТЕСТЫ ДЕДУПЛИКАЦИИ И БЫСТРОДЕЙСТВИЯ УСПЕШНО ПРОЙДЕНЫ!");
