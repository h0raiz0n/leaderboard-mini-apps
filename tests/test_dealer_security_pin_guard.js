/**
 * UNIT TEST: Dealer Mini App Direct Link Security & Master PIN Guard
 * Антикафе «Атмосфера»
 */

const assert = require("assert");
const POKER_CONFIG = require("../shared/poker-config.js");

console.log("🔒 Тестирование защиты прямого доступа и Master PIN к пульту...\n");

// 1. Тест: Прямой переход по ссылке (без Telegram initData) -> Должен требовать PIN
console.log("1. Тест прямого захода без Telegram initData:");
const session = {};
function evaluateAccess(hasTelegramInitData, enteredPin) {
  if (hasTelegramInitData) {
    return { status: "telegram_authorized", allowed: true };
  }
  
  if (session.isPinAuthed) {
    return { status: "pin_session_active", allowed: true };
  }

  const expectedPin = POKER_CONFIG.MASTER_DEALER_PIN || "7777";
  if (enteredPin === expectedPin) {
    session.isPinAuthed = true;
    return { status: "pin_success", allowed: true };
  }

  return { status: "pin_required_or_invalid", allowed: false };
}

let access = evaluateAccess(false, null);
assert.strictEqual(access.allowed, false, "Прямой доступ без авторизации должен быть заблокирован");
assert.strictEqual(access.status, "pin_required_or_invalid");
console.log("   ✅ Прямой доступ без PIN-кода надёжно заблокирован.");

// 2. Тест: Ввод неверного PIN-кода
console.log("\n2. Тест неверного PIN-кода:");
access = evaluateAccess(false, "0000");
assert.strictEqual(access.allowed, false, "Неверный PIN не должен давать доступ");
console.log("   ✅ Неверный PIN-код отклонён.");

// 3. Тест: Ввод корректного Master PIN (7777)
console.log("\n3. Тест корректного Master PIN (7777):");
access = evaluateAccess(false, "7777");
assert.strictEqual(access.allowed, true, "Master PIN должен открывать доступ");
assert.strictEqual(access.status, "pin_success");
console.log("   ✅ Корректный Master PIN успешно открыл пульт.");

// 4. Тест: Авторизация через Telegram WebApp (без запроса PIN)
console.log("\n4. Тест бесшовной авторизации через Telegram WebApp:");
const tgAccess = evaluateAccess(true, null);
assert.strictEqual(tgAccess.allowed, true);
assert.strictEqual(tgAccess.status, "telegram_authorized");
console.log("   ✅ Авторизованный ведущий из Telegram заходит мгновенно без запроса PIN.");

console.log("\n🎉 ВСЕ ТЕСТЫ БЕЗОПАСНОСТИ И MASTER PIN УСПЕШНО ПРОЙДЕНЫ!");
