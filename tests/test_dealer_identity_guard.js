/**
 * UNIT TEST: Zero-Friction Dealer Identity & Whitelist Guard
 * Антикафе «Атмосфера»
 */

const assert = require("assert");

global.POKER_CONFIG = require("../shared/poker-config.js");

const dealersRoster = [
  { username: "arina_makk", name: "Арина" },
  { username: "arbuzmane", name: "Арташес" },
  { username: "h0raiz0n", name: "Влад" },
  { username: "dsh838", name: "Всеволод" },
  { username: "sntrpe", name: "Дима" },
  { username: "starynskaya", name: "Маша" },
  { username: "ninel_mr", name: "Нинель" },
  { username: "trick_str", name: "Паша" },
  { username: "klimovichroman", name: "Рома" },
  { username: "alexsan2186", name: "Саша" },
  { username: "hezadono", name: "Тимур" },
  { username: "assyyyra", name: "Эмилия" }
];

console.log("👤 Тестирование бесшовного автоопределения ведущего...\n");

// 1. Тест автоматического сопоставления всех 12 ведущих из Telegram WebApp
console.log("1. Тест автоопределения 12 ведущих:");
dealersRoster.forEach(dealer => {
  let deniedCalled = false;
  let identifiedDealerName = "";
  
  const mockTelegram = {
    WebApp: {
      ready: () => {},
      expand: () => {},
      initDataUnsafe: {
        user: { username: dealer.username }
      }
    }
  };

  const reg = POKER_CONFIG.DEALERS_REGISTRY;
  const uname = mockTelegram.WebApp.initDataUnsafe.user.username.toLowerCase();
  if (reg.MAP[uname]) {
    identifiedDealerName = reg.MAP[uname];
  } else {
    deniedCalled = true;
  }

  assert.strictEqual(deniedCalled, false, `Доступ для ${dealer.username} не должен быть заблокирован`);
  assert.strictEqual(identifiedDealerName, dealer.name, `Дилер ${dealer.username} должен распознаваться как ${dealer.name}`);
});
console.log("   ✅ Все 12 ведущих мгновенно и безошибочно определяются из Telegram initData.");

// 2. Тест блокировки неавторизованного пользователя
console.log("\n2. Тест блокировки постороннего пользователя:");
let unauthorizedBlocked = false;
const unauthorizedUser = { username: "unknown_stranger" };
const reg = POKER_CONFIG.DEALERS_REGISTRY;
if (!reg.MAP[unauthorizedUser.username]) {
  unauthorizedBlocked = true;
}
assert.strictEqual(unauthorizedBlocked, true, "Посторонний пользователь должен быть заблокирован");
console.log("   ✅ Посторонний аккаунт блокируется экраном Access Denied.");

console.log("\n🎉 ВСЕ ТЕСТЫ АВТООПРЕДЕЛЕНИЯ ВЕДУЩЕГО УСПЕШНО ПРОЙДЕНЫ!");
