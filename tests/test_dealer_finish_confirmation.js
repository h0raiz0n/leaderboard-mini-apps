/**
 * UNIT TEST: Dealer Finish Game Confirmation Flow (Protected Focus Sheet)
 * Антикафе «Атмосфера»
 */

const assert = require("assert");

console.log("🛡️ Тестирование защищенного подтверждения завершения игры в пульте дилера...\n");

// Мокаем глобальное окружение браузера
global.POKER_CONFIG = require("../shared/poker-config.js");

const domElements = {
  "finish-confirm-modal": { style: { display: "none" } },
  "finish-summary-text": { textContent: "" },
  "setup-panel": { style: { display: "none" } },
  "control-card": { style: { display: "block" } },
  "game-btn-stack": { style: { display: "flex" } },
  "post-game-panel": { style: { display: "none" } },
  "running-btn-row": { style: { display: "flex" } },
  "btn-pause": { textContent: "" },
  "btn-colorup": { style: { display: "" } },
  "btn-reset": { style: { display: "" } },
  "btn-finish": { style: { display: "" } },
  "identity-round": { textContent: "" },
  "blinds-current": { textContent: "" },
  "blinds-next": { textContent: "" },
  "timer-digits": { textContent: "", style: {} },
  "timer-status": { textContent: "" },
  "post-break-buttons": { style: { display: "" } },
  "post-break-active": { style: { display: "" } },
  "post-break-digits": { textContent: "" },
  "step-confirm-toast": { style: { display: "none" } }
};

let hapticCalls = [];
global.window = {
  Telegram: {
    WebApp: {
      initDataUnsafe: { user: { username: "h0raiz0n", first_name: "Влад" } },
      HapticFeedback: {
        impactOccurred: (style) => hapticCalls.push(`impact:${style}`),
        notificationOccurred: (type) => hapticCalls.push(`notification:${type}`)
      }
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

global.sessionStorage = {
  _store: { atmosphere_pin_auth: "true" },
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); }
};

global.document = {
  getElementById: (id) => domElements[id] || null,
  addEventListener: () => {}
};

const dealerEngine = require("../dealer/dealer.js");
dealerEngine.initDealerIdentity();

// Запускаем стол
dealerEngine.startTable();
let table = dealerEngine.getMyTable();
assert.strictEqual(table.status, "running", "Стол должен быть в статусе running");

// 1. Проверка открытия модалки подтверждения
console.log("1. Тест вызова openFinishModal():");
hapticCalls = [];
dealerEngine.openFinishModal();

assert.strictEqual(domElements["finish-confirm-modal"].style.display, "flex", "Модалка подтверждения должна открыться");
assert(domElements["finish-summary-text"].textContent.includes("Уровень"), "Текст сводки должен содержать текущий уровень");
assert.strictEqual(table.status, "running", "Статус стола не должен меняться при открытии подтверждения");
assert(hapticCalls.includes("impact:heavy"), "Должен сработать heavy тактильный отклик");
console.log(`   ✅ Модалка открыта: display=${domElements["finish-confirm-modal"].style.display}, summary="${domElements["finish-summary-text"].textContent}"`);

// 2. Отмена подтверждения
console.log("\n2. Тест отмены завершения dismissFinishModal():");
hapticCalls = [];
dealerEngine.dismissFinishModal();

assert.strictEqual(domElements["finish-confirm-modal"].style.display, "none", "Модалка должна закрыться при отмене");
assert.strictEqual(table.status, "running", "Стол должен оставаться running после отмены");
assert(hapticCalls.includes("impact:light"), "Должен сработать легкий тактильный отклик при отмене");
console.log("   ✅ Модалка скрыта, турнир продолжается в штатном режиме.");

// 3. Подтверждение завершения турнира
console.log("\n3. Тест подтверждения завершения confirmFinishGame():");
dealerEngine.openFinishModal();
assert.strictEqual(domElements["finish-confirm-modal"].style.display, "flex");

hapticCalls = [];
dealerEngine.confirmFinishGame();

assert.strictEqual(domElements["finish-confirm-modal"].style.display, "none", "Модалка должна закрыться");
assert.strictEqual(table.status, "finished", "Стол должен перейти в статус finished");
assert(hapticCalls.includes("notification:success"), "Должен сработать success тактильный отклик");
console.log("   ✅ Турнир успешно завершен, модалка закрыта, статус стола: finished.");

// 4. Проверка сброса стола при открытой модалке
console.log("\n4. Тест закрытия модалки при сбросе стола resetTable():");
dealerEngine.startTable();
dealerEngine.openFinishModal();
assert.strictEqual(domElements["finish-confirm-modal"].style.display, "flex");

dealerEngine.resetTable();
assert.strictEqual(domElements["finish-confirm-modal"].style.display, "none", "resetTable должен закрывать модалку");
assert.strictEqual(dealerEngine.getMyTable().status, "idle");
console.log("   ✅ resetTable() корректно очищает модалку завершения.");

// 5. Fallback при отсутствии DOM-элемента
console.log("\n5. Тест безопасного fallback при отсутствии DOM модалки:");
const backupModal = domElements["finish-confirm-modal"];
delete domElements["finish-confirm-modal"];

dealerEngine.startTable();
assert.strictEqual(dealerEngine.getMyTable().status, "running");
dealerEngine.openFinishModal();
assert.strictEqual(dealerEngine.getMyTable().status, "finished", "Если модалка отсутствует, игра завершается сразу");
console.log("   ✅ Fallback работает безопасно при непредвиденном отсутствии DOM-элемента.");

domElements["finish-confirm-modal"] = backupModal;

console.log("\n🎉 ВСЕ ТЕСТЫ ЗАЩИЩЕННОГО ЗАВЕРШЕНИЯ ИГРЫ УСПЕШНО ПРОЙДЕНЫ!");
