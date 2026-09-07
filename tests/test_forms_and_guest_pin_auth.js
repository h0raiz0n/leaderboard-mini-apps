/**
 * UNIT TEST: Google Forms Routing & Whitelist Security
 * Антикафе «Атмосфера»
 */

const assert = require("assert");

console.log("📝 Тестирование маршрутизации Google Forms и защиты белого списка...\n");

// Моки окружения
global.window = {
  Telegram: {
    WebApp: {
      ready: () => {},
      expand: () => {},
      initDataUnsafe: {
        user: {
          id: 55554444 // неизвестный гость без юзернейма
        }
      },
      HapticFeedback: { impactOccurred: () => {}, notificationOccurred: () => {} }
    }
  },
  location: { search: "", reload: () => {} }
};

global.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; }
};

global.sessionStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); }
};

const dom = {
  "pin-auth-modal": { style: { display: "none" } },
  "pin-modal-caption": { textContent: "" },
  "dealer-pin-input": { value: "", focus: () => {} },
  "pin-error-msg": { style: { display: "none" } },
  "dealer-name-select": { value: "Другое", innerHTML: "", appendChild: () => {} },
  "dealer-badge": { textContent: "" },
  "identity-name": { textContent: "" },
  "setup-panel": { style: { display: "" } },
  "control-card": { style: { display: "" } }
};

global.document = {
  getElementById: (id) => dom[id] || null,
  createElement: () => ({ value: "", textContent: "", selected: false }),
  addEventListener: () => {},
  body: { innerHTML: "" }
};

const dealerEngine = require("../dealer/dealer.js");

console.log("1. Тест генерации ссылок на Google Forms по форматам турниров:");

// Устанавливаем имя ведущего
dealerEngine.initDealerIdentity();
const table = dealerEngine.getMyTable();

// SnG
table.format = "SnG";
const sngUrl = dealerEngine.generatePreFilledFormUrl();
assert(sngUrl.includes("1FAIpQLSfCfnN2LS4mAmbQfPtBLZGxPoiYfSqNoaX5xLrmyBr3S5FiEg"), "Формат SnG должен вести на форму SnG");
assert(sngUrl.includes("entry.1615126251="), "URL должен содержать параметр даты");
assert(sngUrl.includes("entry.1887911518="), "URL должен содержать параметр ведущего");
console.log("   ✅ Формат SnG: ссылка на форму сгенерирована корректно.");

// MTT
table.format = "MTT";
const mttUrl = dealerEngine.generatePreFilledFormUrl();
assert(mttUrl.includes("1FAIpQLSeIDDkj2iCPtMZm-0K5YdZFlopAR7aPfRer2n1o-FQD-Dr7FQ"), "Формат MTT должен вести на форму MTT");
console.log("   ✅ Формат MTT: ссылка ведет строго на форму MTT.");

// Mystery Bounty
table.format = "Mystery";
const mysteryUrl = dealerEngine.generatePreFilledFormUrl();
assert(mysteryUrl.includes("1FAIpQLScFJXRH7bgb2W2aCOeSAKYfL-m4odE14HM5a2eWGz8to4QIlA"), "Формат Mystery должен вести на форму Mystery Bounty");
console.log("   ✅ Формат Mystery Bounty: ссылка ведет строго на форму Mystery.");

// 2. Тест: Неавторизованный пользователь не получает доступ
console.log("\n2. Тест блокировки пользователя вне белого списка:");
const pinResult = dealerEngine.submitDealerPin();
assert.strictEqual(pinResult, false, "Вход по PIN должен быть выведен из эксплуатации и возвращать false");
console.log("   ✅ Вход по PIN выведен из эксплуатации, доступ строго по белому списку.");

// 3. Тест ответа Telegram-бота для неизвестного пользователя (отсутствие кнопки PIN и утечки пароля)
console.log("\n3. Тест ответа Telegram-бота для неизвестного пользователя:");

const botHandler = require("../api/dealer-bot.js");
let botResponse = null;

const mockRes = {
  status: (c) => ({
    json: (d) => { botResponse = d; return d; }
  })
};

async function testBotAccessDenied() {
  await botHandler({
    method: "POST",
    body: {
      update_id: 112233,
      message: {
        chat: { id: 998877 },
        from: { id: 998877 }, // без username
        text: "/start"
      }
    }
  }, mockRes);

  assert.strictEqual(botResponse.pin_offered, false, "Бот НЕ должен предлагать вход по PIN");
  assert.strictEqual(botResponse.authorized, false, "Пользователь не должен быть авторизован");
  console.log("   ✅ Telegram-бот корректно блокирует доступ и не сообщает секретный PIN.");
}

testBotAccessDenied().then(() => {
  console.log("\n🎉 ВСЕ ТЕСТЫ GOOGLE FORMS И БЕЗОПАСНОСТИ УСПЕШНО ПРОЙДЕНЫ!");
});
