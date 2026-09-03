/**
 * UNIT & INTEGRATION TEST: Post-Game Break Overtime & 1-Hour Auto-Close
 * Антикафе «Атмосфера»
 */

const assert = require("assert");

console.log("☕ Тестирование овертайма перерыва (+MM:SS) и автозакрытия через 1 час...\n");

// 1. Моделирование фильтра столов на ТВ
console.log("1. Тест фильтрации столов на ТВ при овертайме перерыва:");

function isTableVisibleOnTv(table, now) {
  const isStaleGame = table.startedAt && (now - table.startedAt > 3.5 * 3600 * 1000);
  if (isStaleGame) return false;

  if (table.status === "running" || table.status === "paused") return true;
  if (table.isBreakActive && table.breakEndsAt && (table.breakEndsAt > now)) return true;
  if (table.isPostGameBreak && table.nextGameAt && (now - table.nextGameAt < 3600 * 1000)) return true;
  return false;
}

const breakStart = 1000000;
const breakDuration = 10 * 60 * 1000; // 10 мин
const nextGameAt = breakStart + breakDuration;

const postBreakTable = {
  id: "dealer_vlad",
  dealerName: "Влад",
  format: "SnG",
  status: "finished",
  isPostGameBreak: true,
  nextGameAt: nextGameAt,
  startedAt: breakStart - 3600 * 1000
};

// А. Во время активного перерыва (через 5 минут после старта)
const duringBreak = breakStart + 5 * 60 * 1000;
assert.strictEqual(isTableVisibleOnTv(postBreakTable, duringBreak), true, "Стол должен быть виден во время перерыва");
console.log("   ✅ Во время планового перерыва: стол виден на ТВ.");

// Б. В момент 00:00 (ровно nextGameAt)
assert.strictEqual(isTableVisibleOnTv(postBreakTable, nextGameAt), true, "Стол должен быть виден в момент 00:00");
console.log("   ✅ В момент 00:00 перерыва: стол НЕ пропадает с ТВ.");

// В. Овертайм 15 минут задержки
const overtime15Min = nextGameAt + 15 * 60 * 1000;
assert.strictEqual(isTableVisibleOnTv(postBreakTable, overtime15Min), true, "Стол должен быть виден при задержке 15 минут");
console.log("   ✅ При задержке перерыва на 15 мин: стол остается на ТВ.");

// Г. Овертайм 59 минут задержки
const overtime59Min = nextGameAt + 59 * 60 * 1000;
assert.strictEqual(isTableVisibleOnTv(postBreakTable, overtime59Min), true, "Стол должен быть виден на 59-й минуте задержки");
console.log("   ✅ На 59-й минуте задержки: стол виден на ТВ.");

// Д. Овертайм превысил 60 минут (автозакрытие)
const overtime61Min = nextGameAt + 61 * 60 * 1000;
assert.strictEqual(isTableVisibleOnTv(postBreakTable, overtime61Min), false, "Стол должен быть скрыт после 1 часа задержки");
console.log("   ✅ После 60 минут задержки: стол автоматически закрывается и гаснет с ТВ.");

// 2. Тест форматирования овертайм-таймера
console.log("\n2. Тест форматирования таймера задержки (+MM:SS):");

function formatBreakTimer(nextGameAt, now) {
  const isOvertime = now >= nextGameAt;
  if (!isOvertime) {
    const rem = Math.max(0, Math.floor((nextGameAt - now) / 1000));
    const m = Math.floor(rem / 60);
    const s = rem % 60;
    return {
      formatted: `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
      isOvertime: false,
      status: "☕ Перерыв перед следующей игрой"
    };
  } else {
    const overdueSec = Math.floor((now - nextGameAt) / 1000);
    const m = Math.floor(overdueSec / 60);
    const s = overdueSec % 60;
    return {
      formatted: `+${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
      isOvertime: true,
      status: `☕ Перерыв задерживается (+${m} мин)`
    };
  }
}

const t1 = formatBreakTimer(nextGameAt, nextGameAt - 125 * 1000); // 2 мин 5 сек до конца
assert.strictEqual(t1.formatted, "02:05");
assert.strictEqual(t1.isOvertime, false);
console.log("   ✅ До конца перерыва: 02:05 (isOvertime = false).");

const t2 = formatBreakTimer(nextGameAt, nextGameAt + 135 * 1000); // 2 мин 15 сек задержки
assert.strictEqual(t2.formatted, "+02:15");
assert.strictEqual(t2.isOvertime, true);
assert.strictEqual(t2.status, "☕ Перерыв задерживается (+2 мин)");
console.log("   ✅ Задержка перерыва: +02:15 с правильным статусом.");

console.log("\n🎉 ВСЕ ТЕСТЫ ОВЕРТАЙМА ПЕРЕРЫВА И АВТОЗАКРЫТИЯ УСПЕШНО ПРОЙДЕНЫ!");
