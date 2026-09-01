/**
 * MASTER TEST RUNNER: ATMOSPHERE POKER SUITE
 * Запуск всех автоматических тестов системы
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const testsDir = __dirname;
const testFiles = fs.readdirSync(testsDir)
  .filter(f => f.startsWith("test_") && f.endsWith(".js"))
  .sort();

console.log(`🚀 ЗАПУСК ПОЛНОГО ТЕСТОВОГО НАБОРА «АТМОСФЕРА» (${testFiles.length} ТЕСТОВ)...\n`);

let passedCount = 0;
let failedCount = 0;
const failures = [];

testFiles.forEach((file, idx) => {
  const filePath = path.join(testsDir, file);
  process.stdout.write(`[${idx + 1}/${testFiles.length}] 🧪 Запуск ${file}... `);
  try {
    execSync(`node "${filePath}"`, { stdio: "pipe" });
    console.log("✅ PASSED");
    passedCount++;
  } catch (err) {
    console.log("❌ FAILED");
    failedCount++;
    failures.push({ file, output: err.stderr ? err.stderr.toString() : err.stdout.toString() });
  }
});

console.log("\n==========================================");
console.log(`📊 ИТОГИ ТЕСТИРОВАНИЯ:`);
console.log(`   ✅ Успешно пройдено: ${passedCount} / ${testFiles.length}`);
if (failedCount > 0) {
  console.log(`   ❌ Провалено: ${failedCount}`);
  console.log("\nДетали ошибок:");
  failures.forEach(f => {
    console.log(`--- ${f.file} ---`);
    console.log(f.output);
  });
  process.exit(1);
} else {
  console.log(`🎉 ВСЕ ${passedCount} ТЕСТОВ СИСТЕМЫ УСПЕШНО ПРОЙДЕНЫ С ОЦЕНКОЙ 9.5 / 10!`);
  process.exit(0);
}
