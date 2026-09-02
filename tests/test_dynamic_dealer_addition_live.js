/**
 * UNIT TEST: Dynamic Dealer Addition & Live Sheet Authorization
 * Антикафе «Атмосфера»
 */

const assert = require("assert");

console.log("👥 Тестирование мгновенной авторизации нового ведущего из Google Таблицы...\n");

// 1. Мокируем Google Apps Script окружение и живой лист «Ведущие»
const mockSheetData = [
  ["Имя ведущего", "Telegram Username", "Telegram User ID", "Статус"],
  ["Влад", "@h0raiz0n", "12345678", "Активен"],
  ["Арина", "@arina_makk", "", "Активен"],
  ["Новый Ведущий", "@second_account", "99988877", "Активен"] // Добавлен только что в таблицу
];

global.CONFIG = {
  FIREBASE_DB_URL: "https://atmosphere-poker-default-rtdb.europe-west1.firebasedatabase.app",
  DEALER_BOT_TOKEN: "8581502604:TEST_TOKEN",
  SHEETS: { DEALERS: "Ведущие" },
  DEALERS_REGISTRY: {
    LIST: ["Влад", "Арина"], // Старый статический список
    MAP: { h0raiz0n: "Влад", arina_makk: "Арина" }
  }
};

global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getSheetByName: (name) => {
      if (name === "Ведущие") {
        return {
          getDataRange: () => ({
            getValues: () => mockSheetData
          })
        };
      }
      return null;
    }
  })
};

global.CacheService = {
  _cache: {},
  getScriptCache: () => ({
    get: (k) => global.CacheService._cache[k] || null,
    put: (k, v) => { global.CacheService._cache[k] = v; }
  })
};

global.PropertiesService = {
  _props: {},
  getScriptProperties: () => ({
    getProperty: (k) => global.PropertiesService._props[k] || null,
    setProperty: (k, v) => { global.PropertiesService._props[k] = v; }
  })
};

global.Logger = { log: () => {} };

// Загружаем DealerBot
const fs = require("fs");
const dealerBotCode = fs.readFileSync("c:/vibe/DealerBot.js", "utf8");
eval(dealerBotCode);

let sentMessageText = "";
let sentKeyboard = null;

// Переопределяем customSendDealerTelegram для перехвата сообщений
global.customSendDealerTelegram = (chatId, text, keyboard) => {
  sentMessageText = text;
  sentKeyboard = keyboard;
};

// 2. Проверяем динамическое чтение реестра
console.log("1. Проверка чтения getDynamicDealersRegistry():");
const registry = getDynamicDealersRegistry(true);
assert.strictEqual(registry.MAP["second_account"], "Новый Ведущий", "Новый ведущий должен присутствовать в карте по username");
assert.strictEqual(registry.MAP["99988877"], "Новый Ведущий", "Новый ведущий должен присутствовать в карте по User ID");
console.log("   ✅ Новый ведущий успешно распознан из листа «Ведущие».");

// 3. Симуляция входящего сообщения /start от второго аккаунта
console.log("\n2. Симуляция отправки /start от нового аккаунта (@second_account):");

handleDealerMessage({
  chat: { id: 777123 },
  from: { username: "second_account", id: 99988877 },
  text: "/start"
});

assert(sentMessageText.includes("Привет, <b>Новый Ведущий</b>!"), "Бот должен приветствовать нового ведущего по имени");
assert(sentKeyboard !== null, "Бот должен выдать клавиатуру с Web App");
assert(sentKeyboard[0][0].web_app.url.includes("atmosphere-poker"), "Кнопка должна содержать ссылку на Mini App");
console.log("   ✅ Бот успешно выдал доступ и персональную кнопку новому ведущему!");

// 4. Проверка диагностики Firebase и Токена
console.log("\n3. Проверка автоматической диагностики Firebase URL:");
const codeJs = fs.readFileSync("c:/vibe/Code.js", "utf8");
eval(codeJs);

let alertMessage = "";
global.SpreadsheetApp.getUi = () => ({
  alert: (msg) => { alertMessage = msg; }
});

diagnoseDealerBotAndTv();
assert(alertMessage.includes("2. База Firebase: ✅ Задана"), "Диагностика должна подтвердить наличие Firebase URL");
assert(alertMessage.includes("1. Токен бота: ✅ Задан"), "Диагностика должна подтвердить наличие Токена");
console.log("   ✅ Диагностика подтверждает 100% готовность инфраструктуры.");

console.log("\n🎉 ВСЕ ТЕСТЫ ДИНАМИЧЕСКОЙ АВТОРИЗАЦИИ ВЕДУЩИХ УСПЕШНО ПРОЙДЕНЫ!");
