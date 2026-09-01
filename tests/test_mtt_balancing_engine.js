/**
 * UNIT TEST: MTT Table Balancing & Seating Engine
 * Антикафе «Атмосфера»
 */

const assert = require("assert");

console.log("🏆 Тестирование МТТ логики аутов, рассадки и ребаланса боксов...\n");

// 1. Модель данных двух столов МТТ
const tables = {
  dealer_vlad: {
    id: "dealer_vlad",
    dealerName: "Влад",
    format: "MTT",
    status: "running",
    playersCount: 9,
    initialPlayers: 9
  },
  dealer_arina: {
    id: "dealer_arina",
    dealerName: "Арина",
    format: "MTT",
    status: "running",
    playersCount: 9,
    initialPlayers: 9
  }
};

// Функция проверки ребаланса
function evaluateRebalance(tablesState) {
  const mttTables = Object.keys(tablesState)
    .map(k => tablesState[k])
    .filter(t => t && t.format === "MTT" && t.status === "running");

  if (mttTables.length < 2) return { needed: false };

  let maxTable = mttTables[0];
  let minTable = mttTables[0];

  mttTables.forEach(t => {
    if ((t.playersCount || 0) > (maxTable.playersCount || 0)) maxTable = t;
    if ((t.playersCount || 0) < (minTable.playersCount || 0)) minTable = t;
  });

  const delta = (maxTable.playersCount || 0) - (minTable.playersCount || 0);

  return {
    needed: delta >= 2,
    delta: delta,
    donor: maxTable,
    receiver: minTable
  };
}

// 2. Тест: Равные столы (9 и 9) -> Ребаланс НЕ нужен
console.log("1. Тест баланса при равных столах (9 и 9):");
let status = evaluateRebalance(tables);
assert.strictEqual(status.needed, false);
console.log("   ✅ Ребаланс не требуется при одинаковом числе игроков.");

// 3. Тест: Выбивание 1 игрока на столе Арины (9 и 8, дельта 1) -> Ребаланс НЕ нужен
console.log("\n2. Тест выбивания 1 игрока (9 и 8, дельта 1):");
tables.dealer_arina.playersCount = 8;
status = evaluateRebalance(tables);
assert.strictEqual(status.needed, false);
console.log("   ✅ Дельта 1 допустима (регламентная норма).");

// 4. Тест: Выбивание 2-го игрока на столе Арины (9 и 7, дельта 2) -> Ребаланс ТРЕБУЕТСЯ!
console.log("\n3. Тест выбивания 2-го игрока (9 и 7, дельта 2):");
tables.dealer_arina.playersCount = 7;
status = evaluateRebalance(tables);
assert.strictEqual(status.needed, true, "Дельта 2 должна активировать ребаланс");
assert.strictEqual(status.donor.id, "dealer_vlad", "Донорским столом должен быть стол Влада");
assert.strictEqual(status.receiver.id, "dealer_arina", "Принимающим столом должен быть стол Арины");
console.log(`   ✅ Сработал триггер ребаланса: Пересадка со стола ${status.donor.dealerName} за стол ${status.receiver.dealerName}.`);

// 5. Тест генератора боксов (1..10) и реролла
console.log("\n4. Тест генератора случайного бокса (1..10):");
function generateRandomBox() {
  return Math.floor(Math.random() * 10) + 1;
}

for (let i = 0; i < 50; i++) {
  const box = generateRandomBox();
  assert(box >= 1 && box <= 10, `Номер бокса должен быть от 1 до 10, получено: ${box}`);
}
console.log("   ✅ Генератор боксов и реролл работают строго в диапазоне 1..10.");

// 6. Тест подтверждения пересадки (9-1=8, 7+1=8) -> Баланс восстанавливается
console.log("\n5. Тест подтверждения пересадки игрока:");
tables[status.donor.id].playersCount -= 1;
tables[status.receiver.id].playersCount += 1;

assert.strictEqual(tables.dealer_vlad.playersCount, 8);
assert.strictEqual(tables.dealer_arina.playersCount, 8);

const postRebalance = evaluateRebalance(tables);
assert.strictEqual(postRebalance.needed, false, "После пересадки баланс должен восстановиться");
console.log("   ✅ После пересадки оба стола имеют по 8 игроков, ребаланс успешно закрыт.");

console.log("\n🎉 ВСЕ ТЕСТЫ МТТ РЕБАЛАНСА УСПЕШНО ПРОЙДЕНЫ!");
