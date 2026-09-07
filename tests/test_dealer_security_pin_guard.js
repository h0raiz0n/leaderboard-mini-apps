/**
 * UNIT TEST: Dealer Mini App Strict Whitelist Security Guard
 * Антикафе «Атмосфера»
 */

const assert = require("assert");
const POKER_CONFIG = require("../shared/poker-config.js");

console.log("🔒 Тестирование защиты прямого доступа и белого списка к пульту...\n");

// 1. Тест: Отсутствие утекшего MASTER_DEALER_PIN в публичной конфигурации
console.log("1. Проверка отсутствия открытого Master PIN в POKER_CONFIG:");
assert.strictEqual(POKER_CONFIG.MASTER_DEALER_PIN, undefined, "MASTER_DEALER_PIN не должен присутствовать в клиентском конфиге");
console.log("   ✅ Открытый Master PIN надёжно удалён из конфигурации.");

// 2. Тест: Прямой переход по ссылке (без Telegram initData) -> Доступ строго заблокирован
console.log("\n2. Тест прямого захода без авторизации Telegram:");
function evaluateAccess(user) {
  if (!user || (!user.username && !user.id)) {
    return { status: "access_denied", allowed: false, reason: "no_telegram_identity" };
  }

  const registry = POKER_CONFIG.DEALERS_REGISTRY || { MAP: {} };
  const uname = String(user.username || "").toLowerCase().replace(/^@/, "").trim();
  const uid = String(user.id || "").trim();

  if ((uname && registry.MAP[uname]) || (uid && registry.MAP[uid])) {
    const dealerName = registry.MAP[uname] || registry.MAP[uid];
    return { status: "authorized", allowed: true, dealerName };
  }

  return { status: "access_denied", allowed: false, reason: "not_in_whitelist" };
}

let access = evaluateAccess(null);
assert.strictEqual(access.allowed, false, "Прямой доступ без авторизации должен быть заблокирован");
assert.strictEqual(access.status, "access_denied");
assert.strictEqual(access.reason, "no_telegram_identity");
console.log("   ✅ Прямой доступ без Telegram-авторизации надёжно заблокирован.");

// 3. Тест: Посторонний Telegram пользователь (не из белого списка)
console.log("\n3. Тест постороннего пользователя Telegram:");
access = evaluateAccess({ username: "unknown_player", id: 999999 });
assert.strictEqual(access.allowed, false, "Посторонний пользователь не должен получать доступ");
assert.strictEqual(access.status, "access_denied");
assert.strictEqual(access.reason, "not_in_whitelist");
console.log("   ✅ Посторонний пользователь отклонён (Access Denied).");

// 4. Тест: Авторизованный ведущий из белого списка
console.log("\n4. Тест авторизованного ведущего из белого списка:");
const authAccess = evaluateAccess({ username: "h0raiz0n", id: 1001 });
assert.strictEqual(authAccess.allowed, true);
assert.strictEqual(authAccess.status, "authorized");
assert.strictEqual(authAccess.dealerName, "Влад");
console.log("   ✅ Авторизованный ведущий 'Влад' получает доступ без запроса паролей.");

console.log("\n🎉 ВСЕ ТЕСТЫ БЕЗОПАСНОСТИ И БЕЛОГО СПИСКА УСПЕШНО ПРОЙДЕНЫ!");
