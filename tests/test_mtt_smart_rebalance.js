/**
 * E2E UNIT TEST: Smart MTT Active Seat Rebalancing
 * Антикафе «Атмосфера»
 */

const assert = require("assert");

console.log("🎲 Тестирование умного ребаланса МТТ с пулом только занятых боксов...\n");

// Моки DOM окружения
global.window = {
  Telegram: {
    WebApp: {
      ready: () => {},
      expand: () => {},
      initDataUnsafe: { user: { username: "vlad_a17", id: 247164413 } },
      HapticFeedback: { impactOccurred: () => {}, notificationOccurred: () => {} }
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

let currentBoxNumText = "";
global.document = {
  getElementById: (id) => {
    if (id === "rebalance-box-num") {
      return {
        get textContent() { return currentBoxNumText; },
        set textContent(v) { currentBoxNumText = v; }
      };
    }
    return { style: {}, textContent: "", addEventListener: () => {} };
  },
  querySelectorAll: () => [],
  addEventListener: () => {}
};

const dealer = require("../dealer/dealer.js");

dealer.initDealerIdentity();
const table = dealer.getMyTable();
table.format = "MTT";
table.status = "running";
table.playersCount = 5; // Только 5 игроков за столом

console.log("1. Тест генерации бокса для стола с 5 игроками (100 итераций):");
for (let i = 0; i < 100; i++) {
  dealer.rerollRebalanceBox();
  const boxNum = parseInt(currentBoxNumText.replace("№ ", ""), 10);
  assert(boxNum >= 1 && boxNum <= 5, `Выбранный бокс ${boxNum} должен быть в диапазоне 1..5`);
}
console.log("   ✅ За 100 итераций бокс всегда находился в диапазоне 1..5 (никогда не выбирались пустые боксы 6..10).");

console.log("\n2. Тест изменения количества игроков:");
table.playersCount = 3;
dealer.rerollRebalanceBox();
const boxNum3 = parseInt(currentBoxNumText.replace("№ ", ""), 10);
assert(boxNum3 >= 1 && boxNum3 <= 3, "Бокс должен быть 1..3");
console.log(`   ✅ При 3 игроках выбран бокс № ${boxNum3} (диапазон 1..3).`);

console.log("\n🎉 ВСЕ ТЕСТЫ УМНОГО РЕБАЛАНСА МТТ УСПЕШНО ПРОЙДЕНЫ!");
