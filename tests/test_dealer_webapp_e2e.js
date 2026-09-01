/**
 * E2E & UNIT TEST: Dealer WebApp Direct-to-Firebase Logic
 * Антикафе «Атмосфера»
 */

const assert = require("assert");

// Мокаем DOM и Browser окружение
global.document = {
  getElementById: (id) => ({
    textContent: "",
    style: {},
    classList: { add: () => {}, remove: () => {} },
    addEventListener: () => {}
  }),
  querySelectorAll: () => []
};

global.window = {
  Telegram: {
    WebApp: {
      ready: () => {},
      expand: () => {},
      initDataUnsafe: { user: { first_name: "Влад" } },
      HapticFeedback: {
        impactOccurred: () => {},
        notificationOccurred: () => {}
      }
    }
  },
  addEventListener: () => {}
};

global.localStorage = {
  getItem: () => null,
  setItem: () => {}
};

global.POKER_CONFIG = require("../shared/poker-config.js");

const dealerEngine = require("../dealer/dealer.js");
dealerEngine.initDealerIdentity();

console.log("♠️ Тестирование логики прямого пульта дилера (Mini App)...\n");

// 1. Старт игры
console.log("1. Тест старта стола:");
dealerEngine.startTable();
let table = dealerEngine.getMyTable();
assert.strictEqual(table.status, "running");
assert.strictEqual(table.levelIndex, 0);
assert.strictEqual(table.dealerName, "Влад");
console.log("   ✅ Стол успешно запущен в статусе running.");

// 2. Пауза и возобновление
console.log("\n2. Тест паузы и продолжения игры:");
dealerEngine.togglePause();
table = dealerEngine.getMyTable();
assert.strictEqual(table.status, "paused");

dealerEngine.togglePause();
table = dealerEngine.getMyTable();
assert.strictEqual(table.status, "running");
console.log("   ✅ Пауза и продолжение работают штатно.");

// 3. Переход на следующий уровень
console.log("\n3. Тест перехода на следующий раунд:");
dealerEngine.nextLevel();
table = dealerEngine.getMyTable();
assert.strictEqual(table.levelIndex, 1);
console.log("   ✅ Уровень успешно переключен на Раунд 2 (50/100).");

// 4. Финиш игры и гибкий перерыв
console.log("\n4. Тест завершения игры:");
dealerEngine.finishGame();
table = dealerEngine.getMyTable();
assert.strictEqual(table.status, "finished");
assert.strictEqual(table.isBreakActive, false);
console.log("   ✅ Игра завершена без принудительного перерыва.");

// 5. Тест ссылки на предзаполненную форму
console.log("\n5. Тест генерации ссылки на форму:");
const formUrl = dealerEngine.generatePreFilledFormUrl();
assert(formUrl.includes("entry.1615126251"), "Должно присутствовать поле даты");
assert(formUrl.includes("entry.1887911518=%D0%92%D0%BB%D0%B0%D0%B4"), "Должно присутствовать имя ведущего Влад");
console.log("   ✅ Ссылка на Google Form сформирована:", formUrl);

console.log("\n🎉 ВСЕ ТЕСТЫ ПУЛЬТА ДИЛЕРА УСПЕШНО ПРОЙДЕНЫ!");
