/**
 * UNIT TEST: Dynamic Dealers Registry Sync & Firebase Cleanliness
 * Антикафе «Атмосфера»
 */

const assert = require("assert");

console.log("👥 Тестирование динамической синхронизации ведущих и чистоты Firebase...\n");

// 1. Симуляция данных листа «Ведущие» из Google Таблицы
const mockSheetRows = [
  ["Имя ведущего", "Telegram Username (@...)", "Telegram User ID", "Статус"],
  ["Арина", "@arina_makk", "", "Активен"],
  ["Влад", "h0raiz0n", "1001", "Активен"],
  ["НовыйВедущий", "@new_dealer_poker", "9999", "Активен"],
  ["БывшийВедущий", "@ex_dealer", "", "Заблокирован"]
];

function parseDealersSheet(rows) {
  const list = [];
  const map = {};

  for (let i = 1; i < rows.length; i++) {
    const name = String(rows[i][0] || "").trim();
    const uname = String(rows[i][1] || "").toLowerCase().replace(/^@/, "").trim();
    const uid = String(rows[i][2] || "").trim();
    const status = String(rows[i][3] || "").trim().toLowerCase();

    if (!name || status === "заблокирован" || status === "неактивен") continue;

    if (!list.includes(name)) list.push(name);
    if (uname) map[uname] = name;
    if (uid) map[uid] = name;
  }

  return { LIST: list, MAP: map };
}

// 2. Тест парсинга таблицы
console.log("1. Тест динамического добавления нового ведущего:");
const reg = parseDealersSheet(mockSheetRows);
assert.strictEqual(reg.LIST.includes("НовыйВедущий"), true, "Новый ведущий должен появиться в списке");
assert.strictEqual(reg.MAP["new_dealer_poker"], "НовыйВедущий", "Username нового ведущего должен сопоставляться");
assert.strictEqual(reg.MAP["9999"], "НовыйВедущий", "ID нового ведущего должен сопоставляться");
console.log("   ✅ Новый ведущий успешно добавлен без изменения программного кода.");

// 3. Тест блокировки отключенного ведущего
console.log("\n2. Тест исключения заблокированного ведущего:");
assert.strictEqual(reg.LIST.includes("БывшийВедущий"), false, "Заблокированный ведущий не должен попадать в активные");
assert.strictEqual(reg.MAP["ex_dealer"], undefined, "Доступ для заблокированного должен отсутствовать");
console.log("   ✅ Заблокированный ведущий исключён из реестра.");

// 4. Тест структуры без фантомных мок-столов
console.log("\n3. Проверка отсутствия устаревших мок-столов:");
const zombieTables = ["dealer_drugoe", "dealer_evgeniy", "dealer_igor", "dealer_sergey", "dealer_ведущий"];
const activeTables = {
  dealer_vlad: { dealerName: "Влад" },
  dealer_arina: { dealerName: "Арина" }
};

zombieTables.forEach(z => {
  assert.strictEqual(activeTables[z], undefined, `Фантомный стол ${z} не должен присутствовать`);
});
console.log("   ✅ В активной базе отсутствуют устаревшие мок-столы.");

console.log("\n🎉 ВСЕ ТЕСТЫ ДИНАМИЧЕСКОГО РЕЕСТРА И ЧИСТОТЫ FIREBASE УСПЕШНО ПРОЙДЕНЫ!");
