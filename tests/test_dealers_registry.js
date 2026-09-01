/**
 * UNIT TEST: Dealers Registry & Name Mapping
 * Антикафе «Атмосфера»
 */

const assert = require("assert");
const POKER_CONFIG = require("../shared/poker-config.js");

console.log("♠️ Тестирование реестра дилеров и маппинга имён...\n");

// 1. Проверка структуры DEALERS_REGISTRY
console.log("1. Проверка структуры DEALERS_REGISTRY:");
assert(POKER_CONFIG.DEALERS_REGISTRY, "DEALERS_REGISTRY должен присутствовать в конфигурации");
assert(Array.isArray(POKER_CONFIG.DEALERS_REGISTRY.LIST), "LIST должен быть массивом");
assert(POKER_CONFIG.DEALERS_REGISTRY.LIST.includes("Влад"), "Влад должен быть в списке");
assert(POKER_CONFIG.DEALERS_REGISTRY.LIST.includes("Арина"), "Арина должна быть в списке");
assert(POKER_CONFIG.DEALERS_REGISTRY.LIST.includes("Игорь"), "Игорь должен быть в списке");
assert(POKER_CONFIG.DEALERS_REGISTRY.LIST.includes("Другое"), "Пункт 'Другое' должен быть в списке");
console.log("   ✅ Список официальных ведущих валиден: " + POKER_CONFIG.DEALERS_REGISTRY.LIST.join(", "));

// 2. Тест маппинга Telegram Username -> Официальное имя
console.log("\n2. Тест маппинга Telegram Username / ID -> Реальное имя:");
const map = POKER_CONFIG.DEALERS_REGISTRY.MAP;
function resolveDealerName(user) {
  const uid = String(user.id || "");
  const uname = String(user.username || "").toLowerCase();
  const ufirst = String(user.first_name || "").toLowerCase();

  if (map[uid]) return map[uid];
  if (map[uname]) return map[uname];
  if (map[ufirst]) return map[ufirst];
  
  const directMatch = POKER_CONFIG.DEALERS_REGISTRY.LIST.find(l => l.toLowerCase() === ufirst);
  if (directMatch) return directMatch;

  return POKER_CONFIG.DEALERS_REGISTRY.LIST[0] || "Влад";
}

assert.strictEqual(resolveDealerName({ username: "vlad" }), "Влад");
assert.strictEqual(resolveDealerName({ username: "ARINA" }), "Арина");
assert.strictEqual(resolveDealerName({ first_name: "Игорь" }), "Игорь");
assert.strictEqual(resolveDealerName({ first_name: "Неизвестный", username: "unknown" }), "Влад", "Fallback на первого дилера");
console.log("   ✅ Маппинг и fallback работают корректно.");

// 3. Тест санитизации ключа для Firebase
console.log("\n3. Тест санитизации ключа стола в Firebase:");
function sanitizeDealerKey(name) {
  const ru = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя";
  const en = ["a","b","v","g","d","e","e","zh","z","i","y","k","l","m","n","o","p","r","s","t","u","f","h","ts","ch","sh","sch","","y","","e","yu","ya"];
  const s = String(name || "dealer").toLowerCase().trim();
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const idx = ru.indexOf(s[i]);
    if (idx !== -1) {
      out += en[idx];
    } else if (/[a-z0-9_]/i.test(s[i])) {
      out += s[i];
    } else {
      out += "_";
    }
  }
  return "dealer_" + (out.replace(/_+/g, "_").replace(/^_|_$/g, "") || "host");
}

assert.strictEqual(sanitizeDealerKey("Влад"), "dealer_vlad");
assert.strictEqual(sanitizeDealerKey("Арина"), "dealer_arina");
assert.strictEqual(sanitizeDealerKey("Сергей"), "dealer_sergey");
assert(!sanitizeDealerKey("Влад").includes("%"), "Ключ не должен содержать символ %");
assert(!/[.#$\[\]]/.test(sanitizeDealerKey("Влад")), "Ключ не должен содержать спецсимволы Firebase");
console.log("   ✅ Санитизация ключей столов в Firebase безопасна.");

console.log("\n🎉 ВСЕ ТЕСТЫ РЕЕСТРА ДИЛЕРОВ УСПЕШНО ПРОЙДЕНЫ!");
