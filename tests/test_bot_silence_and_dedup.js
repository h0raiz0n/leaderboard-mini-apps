/**
 * UNIT TEST: Bot Silence, Message Age Filtering & Zero Spam Guard
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

const cacheStore = {};
global.CacheService = {
  getScriptCache: () => ({
    get: (k) => cacheStore[k] || null,
    put: (k, v) => { cacheStore[k] = v; }
  })
};

process.env.DEALER_BOT_TOKEN = "TEST_TOKEN_12345";
global.CONFIG = require("../shared/poker-config.js");
global.getScriptProperty = (k, fb) => global.CONFIG[k] || fb || "TEST_TOKEN_12345";

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

console.log("🔕 Тестирование тишины бота и фильтрации спам-апдейтов...\n");

// 1. Тест игнорирования устаревших сообщений из бэклога (сообщение старше 2 минут)
console.log("1. Тест отсечения устаревших сообщений очереди Telegram:");
lastSentPayload = null;
const oldUpdate = {
  update_id: 2001,
  message: {
    message_id: 10,
    date: Math.floor(Date.now() / 1000) - 3600, // 1 час назад
    chat: { id: 12345 },
    from: { id: 1001, username: "h0raiz0n", first_name: "Влад" },
    text: "/start"
  }
};

const resOld = bot.handleDealerBotWebhook({ postData: { contents: JSON.stringify(oldUpdate) } });
assert.strictEqual(JSON.parse(resOld.output).status, "skipped_old_update", "Старый апдейт должен быть пропущен");
assert.strictEqual(lastSentPayload, null, "Бот НЕ должен отправлять сообщений на старые апдейты");
console.log("   ✅ Старые сообщения из очереди Telegram молча квитируются без отправки пушей.");

// 2. Тест полного игнорирования любого текста, кроме /start
console.log("\n2. Тест тишины бота на случайный текст и спам:");
lastSentPayload = null;
const textUpdate = {
  update_id: 2002,
  message: {
    message_id: 11,
    date: Math.floor(Date.now() / 1000), // свежее
    chat: { id: 12345 },
    from: { id: 1001, username: "h0raiz0n", first_name: "Влад" },
    text: "Привет, как дела?"
  }
};

const resText = bot.handleDealerBotWebhook({ postData: { contents: JSON.stringify(textUpdate) } });
assert.strictEqual(JSON.parse(resText.output).status, "ok");
assert.strictEqual(lastSentPayload, null, "Бот НЕ должен отвечать на случайный текст");
console.log("   ✅ Бот сохраняет 100% тишину на любой текст, кроме явной команды /start.");

// 3. Тест свежей команды /start от авторизованного ведущего
console.log("\n3. Тест свежей команды /start от авторизованного ведущего:");
lastSentPayload = null;
const freshStart = {
  update_id: 2003,
  message: {
    message_id: 12,
    date: Math.floor(Date.now() / 1000),
    chat: { id: 12345 },
    from: { id: 1001, username: "h0raiz0n", first_name: "Влад" },
    text: "/start"
  }
};

const resFresh = bot.handleDealerBotWebhook({ postData: { contents: JSON.stringify(freshStart) } });
assert.strictEqual(JSON.parse(resFresh.output).status, "ok");
assert(lastSentPayload, "Сообщение должно быть отправлено");
assert(lastSentPayload.text.includes("Привет, <b>Влад</b>!"), "Приветствие должно содержать имя ведущего");
assert(lastSentPayload.reply_markup.inline_keyboard[0][0].web_app, "Кнопка Mini App должна присутствовать");
console.log("   ✅ Свежая команда /start открывает пульт для ведущего.");

// 4. Тест дедупликации update_id
console.log("\n4. Тест отсечения дублей update_id:");
lastSentPayload = null;
const resDup = bot.handleDealerBotWebhook({ postData: { contents: JSON.stringify(freshStart) } });
assert.strictEqual(JSON.parse(resDup.output).status, "duplicate_skipped", "Дубликат update_id должен быть отброшен");
assert.strictEqual(lastSentPayload, null, "На дубликат ничего не отправляется");
console.log("   ✅ Повторный update_id мгновенно отбрасывается без лишних запросов.");

console.log("\n🎉 ВСЕ ТЕСТЫ ТИШИНЫ БОТА И ЗАЩИТЫ ОТ СПАМА УСПЕШНО ПРОЙДЕНЫ!");
