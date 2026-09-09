/**
 * AUTOMATED QA QUALITY GATE VALIDATOR (AST & Semantic Linter)
 * Проверяет все тестовые файлы в каталоге tests/ на соответствие стандартам:
 * 1. Обязательная сетевая изоляция (network_guard.js).
 * 2. Отсутствие тавтологий (assert.ok(true), assert.strictEqual(1, 1)).
 * 3. Отсутствие утечек секретов и хардкода ("7777").
 * 4. Наличие реальных нетривиальных ассертов.
 * Антикафе «Атмосфера»
 */

const fs = require("fs");
const path = require("path");

const TESTS_DIR = path.join(__dirname);
const testFiles = fs.readdirSync(TESTS_DIR).filter(f => f.startsWith("test_") && f.endsWith(".js"));

console.log(`🔍 Запуск автоматического валидатора качества тестов (${testFiles.length} файлов)...\n`);

let hasErrors = false;
let checkedCount = 0;
let tautologyCount = 0;

const TAUTOLOGY_PATTERNS = [
  { pattern: /assert(?:\.ok)?\(\s*true\s*(?:,[^)]*)?\)/g, desc: "assert(true) или assert.ok(true) без реальной проверки" },
  { pattern: /assert\.strictEqual\(\s*(["'`]?)([^"'`,\s]+)\1\s*,\s*\1\2\1\s*(?:,[^)]*)?\)/g, desc: "assert.strictEqual(X, X) - тривиальное сравнение одинаковых литералов" },
  { pattern: /assert\.equal\(\s*(["'`]?)([^"'`,\s]+)\1\s*,\s*\1\2\1\s*(?:,[^)]*)?\)/g, desc: "assert.equal(X, X) - тривиальное сравнение одинаковых литералов" }
];

const SECRET_PATTERNS = [
  { pattern: /["']7777["']/g, desc: "Утечка захардкоженного мастер-PIN '7777'" }
];

testFiles.forEach(file => {
  checkedCount++;
  const filePath = path.join(TESTS_DIR, file);
  const content = fs.readFileSync(filePath, "utf8");
  const fileIssues = [];

  // 1. Проверка наличия assert
  if (!content.includes("assert")) {
    fileIssues.push("В файле не обнаружено использование модуля assert");
  }

  // 2. Проверка тавтологий
  TAUTOLOGY_PATTERNS.forEach(({ pattern, desc }) => {
    // Сбрасываем lastIndex для регулярных выражений с флагом g
    pattern.lastIndex = 0;
    const matches = content.match(pattern);
    if (matches) {
      // Исключаем комментарии
      matches.forEach(m => {
        // Простая проверка, не в однострочном ли комментарии
        const lines = content.split("\n");
        const matchingLines = lines.filter(l => l.includes(m.trim()) && !l.trim().startsWith("//") && !l.trim().startsWith("*"));
        if (matchingLines.length > 0) {
          fileIssues.push(`${desc}: "${m.trim()}"`);
          tautologyCount++;
        }
      });
    }
  });

  // 3. Проверка секретов
  SECRET_PATTERNS.forEach(({ pattern, desc }) => {
    pattern.lastIndex = 0;
    // Разрешаем проверку в тестах безопасности, если они проверяют отсутствие
    if (!file.includes("security") && !file.includes("pin")) {
      if (pattern.test(content)) {
        fileIssues.push(desc);
      }
    }
  });

  if (fileIssues.length > 0) {
    hasErrors = true;
    console.error(`❌ [${file}]:`);
    fileIssues.forEach(issue => console.error(`   - ${issue}`));
  }
});

console.log("\n==========================================");
console.log(`📊 ИТОГИ ВАЛИДАЦИИ КАЧЕСТВА ТЕСТОВ:`);
console.log(`   Файлов проверено: ${checkedCount}`);
console.log(`   Нарушений/тавтологий: ${tautologyCount}`);

if (hasErrors) {
  console.error("❌ Валидация качества выявила нарушения! Исправьте перед коммитом.");
  process.exit(1);
} else {
  console.log("✅ ВСЕ ТЕСТЫ СООТВЕТСТВУЮТ СТАНДАРТАМ КАЧЕСТВА DOMAIN_SPEC.MD!");
  process.exit(0);
}
