/**
 * UNIT TEST: Dealers Registry & Whitelist Access Control
 * Антикафе «Атмосфера»
 */

const assert = require("assert");
const POKER_CONFIG = require("../shared/poker-config.js");

console.log("♠️ Тестирование реестра дилеров и белого списка доступа...\n");

// 1. Проверка списка из 12 официальных дилеров клуба
console.log("1. Проверка структуры DEALERS_REGISTRY:");
const expectedDealers = [
  "Арина", "Арташес", "Влад", "Всеволод", "Дима", "Маша",
  "Нинель", "Паша", "Рома", "Саша", "Тимур", "Эмилия"
];

assert.strictEqual(POKER_CONFIG.DEALERS_REGISTRY.LIST.length, 12, "В списке должно быть ровно 12 ведущих");
expectedDealers.forEach(name => {
  assert(POKER_CONFIG.DEALERS_REGISTRY.LIST.includes(name), `Дилер ${name} должен быть в списке`);
});
console.log("   ✅ Все 12 официальных ведущих зарегистрированы в системе.");

// 2. Тест маппинга Telegram @username -> Реальное имя ведущего
console.log("\n2. Тест маппинга Telegram @usernames ведущих:");
const map = POKER_CONFIG.DEALERS_REGISTRY.MAP;

function checkDealerAccess(username) {
  const clean = String(username || "").toLowerCase().replace(/^@/, "");
  if (map[clean]) {
    return { authorized: true, realName: map[clean] };
  }
  return { authorized: false, realName: null };
}

const testCases = [
  { username: "@arina_makk", expected: "Арина" },
  { username: "arbuzmane", expected: "Арташес" },
  { username: "@h0raiz0n", expected: "Влад" },
  { username: "dsh838", expected: "Всеволод" },
  { username: "SnTrpe", expected: "Дима" },
  { username: "@starynskaya", expected: "Маша" },
  { username: "NINEL_MR", expected: "Нинель" },
  { username: "@trick_str", expected: "Паша" },
  { username: "klimovichroman", expected: "Рома" },
  { username: "AlexSan2186", expected: "Саша" },
  { username: "Hezadono", expected: "Тимур" },
  { username: "@assyyyra", expected: "Эмилия" }
];

testCases.forEach(tc => {
  const res = checkDealerAccess(tc.username);
  assert.strictEqual(res.authorized, true, `Доступ для ${tc.username} должен быть разрешен`);
  assert.strictEqual(res.realName, tc.expected, `Имя для ${tc.username} должно быть ${tc.expected}`);
});
console.log("   ✅ Все 12 юзернеймов успешно распознаются (регистронезависимо и с @).");

// 3. Тест блокировки неавторизованных пользователей
console.log("\n3. Тест блокировки посторонних пользователей (Whitelist Guard):");
const unauthorizedUsers = ["@random_user", "intruder", "unknown_person", "guest123"];

unauthorizedUsers.forEach(u => {
  const res = checkDealerAccess(u);
  assert.strictEqual(res.authorized, false, `Доступ для постороннего ${u} должен быть ЗАБЛОКИРОВАН`);
  assert.strictEqual(res.realName, null);
});
console.log("   ✅ Посторонние пользователи гарантированно блокируются.");

console.log("\n🎉 ВСЕ ТЕСТЫ РЕЕСТРА И БЕЛОГО СПИСКА УСПЕШНО ПРОЙДЕНЫ!");
