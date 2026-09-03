/**
 * SECURITY AUDIT TEST: Token Isolation & Secret Sanitization
 * Антикафе «Атмосфера»
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("🔒 Тестирование изоляции секретов и кибербезопасности...\n");

// 1. Проверка отсутствия токенов в клиентских файлах
console.log("1. Проверка клиентских файлов на утечки токенов:");
const clientFiles = [
  "shared/poker-config.js",
  "tv/index.html",
  "tv/tv.js",
  "tv/styles.css",
  "dealer/index.html",
  "dealer/dealer.js",
  "dealer/styles.css",
  "index.html",
  "Config.js",
  "Setup.js",
  "api/dealer-bot.js",
  ".env.example"
];

const tokenRegex = /[0-9]{9,11}:[A-Za-z0-9_-]{34,36}/g;

clientFiles.forEach(relPath => {
  const fullPath = path.join(__dirname, "..", relPath);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, "utf8");
    const matches = content.match(tokenRegex);
    assert(!matches, `КРИТИЧЕСКАЯ УЯЗВИМОСТЬ: Боевой токен бота найден в файле ${relPath}!`);
    console.log(`   ✅ ${relPath}: чист от секретов.`);
  }
});

// 2. Проверка .gitignore
console.log("\n2. Проверка .gitignore на исключение .env и секретов:");
const gitignorePath = path.join(__dirname, "..", ".gitignore");
assert(fs.existsSync(gitignorePath), ".gitignore должен существовать");
const gitignoreContent = fs.readFileSync(gitignorePath, "utf8");
assert(gitignoreContent.includes(".env"), ".gitignore должен содержать .env");
assert(gitignoreContent.includes(".credentials"), ".gitignore должен содержать .credentials");
console.log("   ✅ .gitignore надежно исключает .env и приватные ключи.");

// 3. Проверка POKER_CONFIG структуры
console.log("\n3. Проверка POKER_CONFIG на клиенте:");
const POKER_CONFIG = require("../shared/poker-config.js");
assert(!POKER_CONFIG.DEALER_BOT_TOKEN, "POKER_CONFIG не должен содержать DEALER_BOT_TOKEN");
assert(POKER_CONFIG.DEALERS_REGISTRY, "POKER_CONFIG должен содержать DEALERS_REGISTRY");
console.log("   ✅ POKER_CONFIG безопасен для загрузки в браузер.");

console.log("\n🎉 ВСЕ ТЕСТЫ БЕЗОПАСНОСТИ И ИЗОЛЯЦИИ СЕКРЕТОВ УСПЕШНО ПРОЙДЕНЫ!");
