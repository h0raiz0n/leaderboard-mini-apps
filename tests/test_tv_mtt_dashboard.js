/**
 * UNIT TEST: TV 4K Dashboard MTT Metrics & Rebalance Banner
 * Антикафе «Атмосфера»
 */

const assert = require("assert");

console.log("📺 Тестирование ТВ-дашборда 4K в режиме МТТ...\n");

// 1. Модель данных двух активных столов МТТ
const mockTables = {
  dealer_vlad: {
    id: "dealer_vlad",
    dealerName: "Влад",
    format: "MTT",
    structKey: "SNG_STANDARD",
    status: "running",
    levelIndex: 2,
    playersCount: 9,
    initialPlayers: 9,
    startedAt: Date.now() - 60000,
    durationSec: 420
  },
  dealer_arina: {
    id: "dealer_arina",
    dealerName: "Арина",
    format: "MTT",
    structKey: "SNG_STANDARD",
    status: "running",
    levelIndex: 2,
    playersCount: 7,
    initialPlayers: 9,
    startedAt: Date.now() - 60000,
    durationSec: 420
  }
};

// Функция агрегации статистики для ТВ
function computeTvMttHud(tables) {
  const mttTables = Object.values(tables).filter(t => t.format === "MTT" && (t.status === "running" || t.status === "paused"));
  
  let totalPlayers = 0;
  let totalStarting = 0;
  mttTables.forEach(t => {
    totalPlayers += (t.playersCount || 9);
    totalStarting += (t.initialPlayers || 9);
  });

  const startingStack = 5000;
  const totalChips = totalStarting * startingStack;
  const avgStack = totalPlayers > 0 ? Math.round(totalChips / totalPlayers) : startingStack;

  let rebalanceNeeded = false;
  let donorName = "";
  let receiverName = "";

  if (mttTables.length >= 2) {
    let maxT = mttTables[0];
    let minT = mttTables[0];
    mttTables.forEach(t => {
      if ((t.playersCount || 9) > (maxT.playersCount || 9)) maxT = t;
      if ((t.playersCount || 9) < (minT.playersCount || 9)) minT = t;
    });
    const delta = (maxT.playersCount || 9) - (minT.playersCount || 9);
    if (delta >= 2) {
      rebalanceNeeded = true;
      donorName = maxT.dealerName;
      receiverName = minT.dealerName;
    }
  }

  const isFinalTableFormed = totalPlayers <= 10 && mttTables.length > 1;

  return {
    totalPlayers,
    totalStarting,
    totalChips,
    avgStack,
    rebalanceNeeded,
    donorName,
    receiverName,
    isFinalTableFormed
  };
}

// 2. Тест подсчета общего числа игроков и среднего стека
console.log("1. Тест агрегации игроков и среднего стека:");
const hud = computeTvMttHud(mockTables);
assert.strictEqual(hud.totalPlayers, 16, "Общее число оставшихся игроков должно быть 16 (9 + 7)");
assert.strictEqual(hud.totalStarting, 18, "Начальное число игроков должно быть 18 (9 + 9)");
assert.strictEqual(hud.totalChips, 90000, "Общее число фишек в игре: 18 * 5000 = 90 000");
assert.strictEqual(hud.avgStack, 5625, "Средний стек: 90 000 / 16 = 5 625");
console.log(`   ✅ Игроков: ${hud.totalPlayers}/${hud.totalStarting}, Средний стек: ${hud.avgStack.toLocaleString("ru-RU")} фишек.`);

// 3. Тест выявления ребаланса на ТВ
console.log("\n2. Тест алерта ребаланса на ТВ:");
assert.strictEqual(hud.rebalanceNeeded, true, "Дельта 2 должна сформировать баннер ребаланса");
assert.strictEqual(hud.donorName, "Влад");
assert.strictEqual(hud.receiverName, "Арина");
console.log(`   ✅ Баннер ребаланса: Пересадка со стола ${hud.donorName} за стол ${hud.receiverName}.`);

// 4. Тест формирования финального стола
console.log("\n3. Тест детекции формирования финального стола (<= 10 игроков):");
mockTables.dealer_vlad.playersCount = 5;
mockTables.dealer_arina.playersCount = 5;
const finalHud = computeTvMttHud(mockTables);
assert.strictEqual(finalHud.totalPlayers, 10);
assert.strictEqual(finalHud.isFinalTableFormed, true, "10 игроков за 2 столами должны активировать объединение в финальный стол");
console.log("   ✅ Детектор финального стола успешно срабатывает при <= 10 игроках.");

console.log("\n🎉 ВСЕ ТЕСТЫ ТВ-ДАШБОРДА МТТ УСПЕШНО ПРОЙДЕНЫ!");
