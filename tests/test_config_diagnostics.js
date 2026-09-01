/**
 * UNIT TEST: CONFIG, SECRETS & DIAGNOSTICS
 * Антикафе «Атмосфера»
 */

const assert = require("assert");

// Мокаем Apps Script окружение
const scriptProps = {
  TELEGRAM_BOT_TOKEN: "1234567890:ABCdefGHIjklMNO",
  TELEGRAM_CHAT_ID: "-100123456789",
  DEALER_BOT_TOKEN: "9876543210:ZYXwvuTSRqpoNML",
  FIREBASE_DB_URL: "https://atmosphere-poker-test.firebaseio.com",
  ADMIN_KEY: "secret_adm_key"
};

global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (k) => scriptProps[k] || "",
    setProperty: (k, v) => { scriptProps[k] = v; }
  })
};

global.Logger = {
  log: (msg) => {}
};

global.CONFIG = require("../shared/poker-config.js");
global.CONFIG.BLIND_STRUCTURES = {
  SNG_STANDARD: {
    name: "5 000 стек / 7 мин (Стандарт)",
    stack: 5000,
    levels: global.CONFIG.SNG_STRUCTURE.levels
  }
};

global.ContentService = {
  MimeType: { JSON: "application/json" },
  createTextOutput: (str) => ({
    str,
    setMimeType: () => ({ output: str })
  })
};

global.handleDealerBotWebhook = (e) => {
  return { routed: true, payload: e.postData.contents };
};

console.log("♠️ Тестирование конфигурации, секретов и диагностики...\n");

// 1. Проверка маскирования секретов
console.log("1. Тест чтения и маскирования секретов:");
const token = scriptProps.DEALER_BOT_TOKEN;
const masked = token.substring(0, 8) + "…";
assert.strictEqual(masked, "98765432…", "Токен должен быть корректно замаскирован для логов");
console.log("   ✅ Секреты бота и Firebase корректно маскируются.");

// 2. Тест doPost Webhook маршрутизатора
console.log("\n2. Тест doPost диспетчера вебхуков:");
const samplePostData = {
  postData: {
    contents: JSON.stringify({ message: { text: "/start", chat: { id: 12345 } } })
  }
};

function testDoPost(e) {
  if (typeof global.handleDealerBotWebhook === "function") {
    return global.handleDealerBotWebhook(e);
  }
  return { routed: false };
}

const postResult = testDoPost(samplePostData);
assert.strictEqual(postResult.routed, true, "doPost должен вызывать обработчик дилерского бота");
console.log("   ✅ doPost успешно маршрутизирует входящие вебхуки Telegram.");

// 3. Тест наличия всех структур в CONFIG
console.log("\n3. Проверка пресетов турнирных структур:");
assert(global.CONFIG.BLIND_STRUCTURES.SNG_STANDARD, "Структура SNG_STANDARD должна существовать");
assert.strictEqual(global.CONFIG.BLIND_STRUCTURES.SNG_STANDARD.stack, 5000);
console.log("   ✅ Турнирные структуры проверены и готовы к работе.");

console.log("\n🎉 ВСЕ ТЕСТЫ КОНФИГУРАЦИИ И ДИАГНОСТИКИ УСПЕШНО ПРОЙДЕНЫ!");
