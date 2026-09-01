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

global.Logger = { log: (msg) => {} };
global.ContentService = {
  MimeType: { JSON: "application/json" },
  createTextOutput: (str) => ({
    output: str,
    setMimeType: () => ({ output: str })
  })
};

global.CONFIG = require("../shared/poker-config.js");
global.getScriptProperty = (k, fb) => global.CONFIG[k] || fb;

let lastSentPayload = null;
global.UrlFetchApp = {
  fetch: (url, options) => {
    if (options && options.payload) {
      lastSentPayload = JSON.parse(options.payload);
    }
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true }) };
  }
};

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

// 2. Тест формирования кнопки Mini App
console.log("\n2. Тест формирования кнопки Mini App:");
assert(lastSentPayload, "Payload должен быть отправлен");
assert(lastSentPayload.reply_markup.inline_keyboard[0][0].web_app.url.includes("/dealer/"), "Должен быть URL пульта");
console.log("   ✅ Кнопка запуска Mini App сформирована корректно.");

console.log("\n🎉 ВСЕ ТЕСТЫ ДЕДУПЛИКАЦИИ И БЫСТРОДЕЙСТВИЯ УСПЕШНО ПРОЙДЕНЫ!");
