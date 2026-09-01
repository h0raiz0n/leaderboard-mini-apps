/**
 * UNIT TEST: Dealer Bot Mini App Launcher
 * Антикафе «Атмосфера»
 */

const assert = require("assert");

global.Logger = { log: (msg) => {} };
global.ContentService = {
  MimeType: { JSON: "application/json" },
  createTextOutput: (str) => ({
    output: str,
    setMimeType: () => ({ output: str })
  })
};

global.CacheService = {
  getScriptCache: () => ({
    get: () => null,
    put: () => {}
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

const bot = require("../DealerBot.js");

console.log("♠️ Тестирование Telegram-бота для запуска Mini App...\n");

// 1. Тест отправки кнопки Mini App по команде /start
console.log("1. Тест кнопки запуска Mini App:");
const update = {
  update_id: 101,
  message: {
    message_id: 1,
    chat: { id: 12345 },
    from: { first_name: "Влад" },
    text: "/start"
  }
};

const res = bot.handleDealerBotWebhook({ postData: { contents: JSON.stringify(update) } });
assert.strictEqual(JSON.parse(res.output).status, "ok");
assert(lastSentPayload, "Сообщение должно быть отправлено");
assert(lastSentPayload.text.includes("Привет, <b>Влад</b>!"), "Приветствие должно содержать имя");
assert(lastSentPayload.reply_markup.inline_keyboard[0][0].web_app, "Кнопка должна содержать web_app");
assert.strictEqual(lastSentPayload.reply_markup.inline_keyboard[0][0].web_app.url, "https://h0raiz0n.github.io/leaderboard-mini-apps/dealer/");

console.log("   ✅ Бот успешно отправляет приветствие и кнопку запуска Mini App.");
console.log("\n🎉 ВСЕ ТЕСТЫ БОТА УСПЕШНО ПРОЙДЕНЫ!");
