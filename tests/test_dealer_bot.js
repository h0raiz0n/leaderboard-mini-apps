/**
 * UNIT TEST: Dealer Bot Mini App Launcher & Whitelist Guard
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

process.env.DEALER_BOT_TOKEN = "TEST_TOKEN_12345";
global.CONFIG = require("../shared/poker-config.js");
global.getScriptProperty = (k, fb) => (k === "DEALER_BOT_TOKEN" ? "TEST_TOKEN_12345" : fb);

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

console.log("♠️ Тестирование Telegram-бота и белого списка доступа...\n");

// 1. Тест авторизованного ведущего (@h0raiz0n -> Влад)
console.log("1. Тест авторизованного ведущего (@h0raiz0n):");
const authUpdate = {
  update_id: 101,
  message: {
    message_id: 1,
    chat: { id: 12345 },
    from: { id: 1001, username: "h0raiz0n", first_name: "Влад" },
    text: "/start"
  }
};

lastSentPayload = null;
const resAuth = bot.handleDealerBotWebhook({ postData: { contents: JSON.stringify(authUpdate) } });
assert.strictEqual(JSON.parse(resAuth.output).status, "ok");
assert(lastSentPayload, "Сообщение должно быть отправлено");
assert(lastSentPayload.text.includes("Привет, <b>Влад</b>!"), "Приветствие должно содержать имя Влад");
assert(lastSentPayload.reply_markup.inline_keyboard[0][0].web_app.url.includes("/dealer/"), "Кнопка должна содержать путь к пульту /dealer/");
console.log("   ✅ Авторизованный ведущий получает приветствие и кнопку пульта.");

// 2. Тест блокировки постороннего пользователя (@intruder)
console.log("\n2. Тест блокировки неавторизованного пользователя (@intruder):");
const unauthUpdate = {
  update_id: 102,
  message: {
    message_id: 2,
    chat: { id: 99999 },
    from: { id: 9999, username: "intruder", first_name: "Незнакомец" },
    text: "/start"
  }
};

lastSentPayload = null;
const resUnauth = bot.handleDealerBotWebhook({ postData: { contents: JSON.stringify(unauthUpdate) } });
assert.strictEqual(JSON.parse(resUnauth.output).status, "ok");
assert(lastSentPayload, "Ответ о блокировке должен быть отправлен");
assert(lastSentPayload.text.includes("Доступ ограничен"), "Должен сообщать об ограничении доступа");
assert(!lastSentPayload.reply_markup, "Кнопка пульта НЕ должна выдаваться");
console.log("   ✅ Посторонний пользователь корректно заблокирован без выдачи пульта.");

console.log("\n🎉 ВСЕ ТЕСТЫ БОТА И ДОСТУПА УСПЕШНО ПРОЙДЕНЫ!");
