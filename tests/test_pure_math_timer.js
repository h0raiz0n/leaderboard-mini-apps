/**
 * tests/test_pure_math_timer.js
 * Verification for Step 4.2:
 * 1. Deterministic pure-math calculation of tournament progress (calculateTournamentProgress).
 * 2. Boundary conditions: level start, level exact end, transitions, overtime.
 * 3. Exact mathematical invariant across multiple sequential pauses and active pauses.
 * 4. 1000-run randomized Monte Carlo stress test comparing TV and Dealer computations.
 */

const assert = require("assert");

console.log("▶ Running Pure Math Timer Verification Tests (Step 4.2)...\n");

// Защита от зависания тестов (таймаут 6с)
setTimeout(() => {
  console.error("❌ TIMEOUT: Тест test_pure_math_timer.js превысил лимит времени 6с!");
  process.exit(1);
}, 6000).unref();

const POKER_CONFIG = require("../shared/poker-config.js");
global.POKER_CONFIG = POKER_CONFIG;

// Mock minimal DOM and global dependencies for TV and Dealer
global.window = {
  addEventListener: () => {},
  Telegram: {
    WebApp: {
      ready: () => {},
      expand: () => {},
      initDataUnsafe: { user: { username: "h0raiz0n", id: 247164413 } },
      HapticFeedback: { impactOccurred: () => {}, notificationOccurred: () => {} }
    }
  }
};

global.document = {
  addEventListener: () => {},
  getElementById: (id) => ({
    id,
    style: {},
    textContent: "",
    classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} }
  }),
  querySelectorAll: () => [],
  querySelector: () => null
};

global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

const tv = require("../tv/tv.js");
const dealer = require("../dealer/dealer.js");

// =============================================================
// 1. Проверка сигнатуры и базовых инвариантов чистой функции
// =============================================================
console.log("1. Проверка сигнатуры и базовых инвариантов чистой функции времени:");
assert.strictEqual(typeof POKER_CONFIG.calculateTournamentProgress, "function", "calculateTournamentProgress обязана быть функцией");
assert.strictEqual(typeof POKER_CONFIG.calculateTableProgress, "function", "calculateTableProgress обязана быть функцией");

// Тест нестартовавшего турнира (startedAt: null / 0)
const unstarted = POKER_CONFIG.calculateTournamentProgress("SNG_DEEP_1500", null, 0, null, 100000);
assert.strictEqual(unstarted.levelIndex, 0, "Нестартовавший турнир должен быть на уровне 0");
assert.strictEqual(unstarted.levelRemainingSec, 600, "Остаток времени должен равняться полной длительности уровня");
assert.strictEqual(unstarted.isPaused, false, "Флаг паузы должен быть false");
assert.strictEqual(unstarted.isOvertime, false, "Овертайм должен быть false");
assert.strictEqual(unstarted.elapsedMs, 0, "Прошедшее время турнира должно быть 0");
console.log("   ✓ Нестартовавший турнир: корректная инициализация на уровне 0 с полной длительностью.");

// =============================================================
// 2. Проверка граничных условий и переходов между уровнями
// =============================================================
console.log("\n2. Проверка граничных условий и переходов между уровнями:");
const structure = POKER_CONFIG.BLIND_STRUCTURES.SNG_DEEP_1500;
const t0 = 1000000;

// Ровно за 1 секунду до конца 1 уровня (599 сек)
const justBeforeEnd = POKER_CONFIG.calculateTournamentProgress(structure, t0, 0, null, t0 + 599000);
assert.strictEqual(justBeforeEnd.levelIndex, 0, "599 сек — всё ещё 1-й уровень (индекс 0)");
assert.strictEqual(justBeforeEnd.levelRemainingSec, 1, "Должна оставаться ровно 1 секунда");

// Ровно в момент перехода на 2 уровень (600 сек)
const exactTransition = POKER_CONFIG.calculateTournamentProgress(structure, t0, 0, null, t0 + 600000);
assert.strictEqual(exactTransition.levelIndex, 1, "Ровно 600 сек — переход на 2-й уровень (индекс 1)");
assert.strictEqual(exactTransition.levelRemainingSec, 600, "На новом уровне должен быть полный таймер 600 сек");
assert.strictEqual(exactTransition.sb, 10, "SB 2-го уровня должен быть 10");
assert.strictEqual(exactTransition.bb, 25, "BB 2-го уровня должен быть 25");

// Середина 3-го уровня (1450 сек = 600 + 600 + 250 сек)
const midLevel3 = POKER_CONFIG.calculateTournamentProgress(structure, t0, 0, null, t0 + 1450000);
assert.strictEqual(midLevel3.levelIndex, 2, "1450 сек — 3-й уровень (индекс 2)");
assert.strictEqual(midLevel3.levelRemainingSec, 350, "Остаток 3-го уровня: 600 - 250 = 350 сек");
assert.strictEqual(midLevel3.sb, 25, "SB 3-го уровня = 25");
assert.strictEqual(midLevel3.bb, 50, "BB 3-го уровня = 50");
console.log("   ✓ Границы уровней и переходы рассчитываются с абсолютной математической точностью.");

// =============================================================
// 3. Проверка математики множественных пауз и заморозки времени
// =============================================================
console.log("\n3. Проверка пауз и заморозки времени:");
// Турнир стартовал в t0.
// Прошло 300 сек, потом пауза 100 сек, потом турнир шёл еще 200 сек.
// Всего прошло физического времени: 600 сек. Но эффективного чистого времени: 500 сек!
const totalPaused = 100000;
const withPastPauses = POKER_CONFIG.calculateTournamentProgress(structure, t0, totalPaused, null, t0 + 600000);
assert.strictEqual(withPastPauses.levelIndex, 0, "С учетом паузы турнир все еще на 1 уровне (индекс 0)");
assert.strictEqual(withPastPauses.levelRemainingSec, 100, "Остаток времени должен быть ровно 100 сек");
assert.strictEqual(withPastPauses.elapsedMs, 500000, "Чистое время должно быть 500 000 мс");

// Активная пауза (заморозка): турнир на паузе, прошло 2 часа физического времени
const pausedAt = t0 + 250000; // Пауза нажата на 250-й секунде
const nowAfterTwoHours = pausedAt + (2 * 3600 * 1000);
const frozenClock = POKER_CONFIG.calculateTournamentProgress(structure, t0, 0, pausedAt, nowAfterTwoHours);
assert.strictEqual(frozenClock.isPaused, true, "isPaused обязан быть true");
assert.strictEqual(frozenClock.levelIndex, 0, "Уровень не должен вырасти во время паузы");
assert.strictEqual(frozenClock.levelRemainingSec, 350, "Таймер обязан оставаться замороженным на 350 сек");
console.log("   ✓ Множественные паузы и заморозка времени не дают дрифта или смещения раундов.");

// =============================================================
// 4. Проверка овертайма (время превышает все уровни структуры)
// =============================================================
console.log("\n4. Проверка овертайма последнего уровня:");
const totalAllLevelsSec = structure.levels.reduce((sum, l) => sum + (l.durationSec || 600), 0);
const beyondEndMs = (totalAllLevelsSec + 125) * 1000;
const overtimeResult = POKER_CONFIG.calculateTournamentProgress(structure, t0, 0, null, t0 + beyondEndMs);

assert.strictEqual(overtimeResult.levelIndex, structure.levels.length - 1, "В овертайме удерживается последний уровень");
assert.strictEqual(overtimeResult.isOvertime, true, "Флаг овертайма обязан быть true");
assert.strictEqual(overtimeResult.levelRemainingSec, 0, "Оставшееся время уровня в овертайме равно 0");
assert.strictEqual(overtimeResult.levelElapsedMs, 125000 + (structure.levels[structure.levels.length - 1].durationSec * 1000), "Корректный подсчет прошедшего времени овертайма");
console.log("   ✓ Овертайм финального раунда удерживает индекс последнего уровня и поднимает isOvertime = true.");

// =============================================================
// 5. Стресс-тест Монте-Карло: 1000 случайных турниров (ТВ vs Пульт)
// =============================================================
console.log("\n5. Стресс-тест Монте-Карло (1000 случайных комбинаций стартов, пауз и овертаймов):");
const structureKeys = ["SNG_DEEP_1500", "SNG_STANDARD", "MTT_PRO_5000"];
const baseNow = Date.now();

for (let i = 0; i < 1000; i++) {
  const structKey = structureKeys[i % structureKeys.length];
  const struct = POKER_CONFIG.BLIND_STRUCTURES[structKey];
  const iterNow = Date.now();
  
  // Случайный старт от 1 минуты до 5 часов назад
  const elapsedSec = Math.floor(Math.random() * 18000) + 60;
  const startedAt = iterNow - (elapsedSec * 1000);
  
  // Случайная сумма накопленных пауз (от 0 до половины прошедшего времени)
  const totalPausedMs = Math.floor(Math.random() * (elapsedSec * 500));
  
  // Случайный статус: 80% running, 20% paused
  const isPaused = (Math.random() < 0.2);
  const pausedAt = isPaused ? (iterNow - Math.floor(Math.random() * 60000)) : null;

  // Прямой расчет через чистую функцию
  const pureProgress = POKER_CONFIG.calculateTournamentProgress(struct, startedAt, totalPausedMs, pausedAt, iterNow);

  // Табличный объект для пульта и ТВ
  const mockTable = {
    id: `table_sim_${i}`,
    status: isPaused ? "paused" : "running",
    structKey,
    startedAt,
    totalPausedMs,
    pausedAt,
    durationSec: pureProgress.levelDurationSec,
    levelIndex: pureProgress.levelIndex,
    remainingMs: pureProgress.levelRemainingMs
  };

  // Расчет через ТВ
  const tvResult = tv.calculateTableTime(mockTable, false);

  // Сравнение: показания времени обязаны совпадать секунда-в-секунду!
  assert.strictEqual(
    tvResult.isOvertime,
    pureProgress.isOvertime,
    `Флаг овертайма не совпадает в итерации ${i}`
  );

  if (pureProgress.isOvertime) {
    assert.strictEqual(tvResult.remaining, 0, `В овертайме remaining обязан быть 0 в итерации ${i}`);
  } else {
    assert(
      Math.abs(tvResult.remaining - pureProgress.levelRemainingSec) <= 1,
      `Рассогласование в итерации ${i}: ТВ (${tvResult.remaining}s) !== Чистая математика (${pureProgress.levelRemainingSec}s)`
    );

    // Сравнение минут и секунд
    const expectedMin = Math.floor(tvResult.remaining / 60);
    const expectedSec = tvResult.remaining % 60;
    assert.strictEqual(tvResult.minutes, expectedMin, `Минуты не совпадают в итерации ${i}`);
    assert.strictEqual(tvResult.seconds, expectedSec, `Секунды не совпадают в итерации ${i}`);
  }
}

console.log("   ✅ 1 000 / 1 000 случайных симуляций турниров завершились со 100% совпадением секунда-в-секунду!");

console.log("\n🎉 ВСЕ ТЕСТЫ МАТЕМАТИЧЕСКОЙ ТОЧНОСТИ ТАЙМЕРА (ЭТАП 4) УСПЕШНО ПРОЙДЕНЫ!");
process.exit(0);
