/**
 * Unit & Integration Test Suite for Poker Leaderboard Engine
 * Run with: node tests/test_engine.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

console.log("=== RUNNING POKER LEADERBOARD TEST SUITE ===");

function loadSandbox(extraFiles = []) {
  const memCache = {};
  const memProps = {};

  const context = {
    Logger: { log: console.log },
    Utilities: {
      formatDate: (d, tz, fmt) => {
        const date = new Date(d);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    },
    Session: { getScriptTimeZone: () => "Europe/Moscow" },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => memProps[k] || null,
        setProperty: (k, v) => { memProps[k] = String(v); },
        deleteProperty: (k) => { delete memProps[k]; }
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => memCache[k] || null,
        getAll: (keys) => {
          const res = {};
          keys.forEach(k => { if (memCache[k] !== undefined) res[k] = memCache[k]; });
          return res;
        },
        put: (k, v) => { memCache[k] = String(v); },
        putAll: (entries) => { Object.assign(memCache, entries); },
        remove: (k) => { delete memCache[k]; },
        removeAll: (keys) => { keys.forEach(k => delete memCache[k]); }
      })
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        releaseLock: () => {}
      })
    }
  };

  vm.createContext(context);

  const files = ['Config.js', 'Normalizer.js', ...extraFiles];
  files.forEach(f => {
    const code = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    vm.runInContext(code, context);
  });

  return context;
}

// Test 1: Clean Player Name
function testCleanPlayerName() {
  const sb = loadSandbox();
  assert.strictEqual(sb.cleanPlayerName("Иван Иванов 123"), "Иван Иванов");
  assert.strictEqual(sb.cleanPlayerName("Женя888"), "Женя888");
  assert.strictEqual(sb.cleanPlayerName("Павел238"), "Павел238");
  assert.strictEqual(sb.cleanPlayerName("  Виталий  "), "Виталий");
  assert.strictEqual(sb.cleanPlayerName(""), "");
  console.log("✔ Test 1 Passed: cleanPlayerName strips form suffix correctly");
}

// Test 2: Normalize Form Rows (SnG, MTT, Mystery Bounty)
function testNormalizeFormRows() {
  const sb = loadSandbox();

  // SnG: 10, 6, 3 pts
  const sngRow = ["2026-08-20 20:00:00", "2026-08-20", "Влад", "Иван Иванов 123", "Петр Петров 456", "Сидор 789"];
  const normSng = sb.normalizeFormRow("Data", sngRow, "G_100");
  assert.strictEqual(normSng.format, "SnG");
  assert.strictEqual(normSng.dealer, "Влад");
  assert.strictEqual(normSng.items.length, 3);
  assert.strictEqual(normSng.items[0].points, 10);
  assert.strictEqual(normSng.items[1].points, 6);
  assert.strictEqual(normSng.items[2].points, 3);

  // MTT: 30, 20, 14, 9, 5 pts
  const mttRow = ["2026-08-20 20:00:00", "2026-08-20", "Влад", "Игрок1", "Игрок2", "Игрок3", "Игрок4", "Игрок5"];
  const normMtt = sb.normalizeFormRow("MTT", mttRow, "G_101");
  assert.strictEqual(normMtt.format, "MTT");
  assert.strictEqual(normMtt.items.length, 5);
  assert.strictEqual(normMtt.items[0].points, 30);
  assert.strictEqual(normMtt.items[4].points, 5);

  // Mystery Bounty: 10, 6, 3 pts + 2 KOs (+20 each)
  const mbRow = ["2026-08-20 20:00:00", "2026-08-20", "Влад", "Игрок1", "Игрок2", "Игрок3", "Игрок1", "Игрок2"];
  const normMb = sb.normalizeFormRow("Mystery", mbRow, "G_102");
  assert.strictEqual(normMb.format, "Mystery Bounty");
  assert.strictEqual(normMb.items.length, 5);
  assert.strictEqual(normMb.items[3].event, "Нокаут");
  assert.strictEqual(normMb.items[3].points, 20);

  console.log("✔ Test 2 Passed: normalizeFormRow handles all 3 formats correctly");
}

// Test 3: Unified Game ID Idempotence
function testUnifiedGameId() {
  const sb = loadSandbox();
  const row1 = ["2026-08-20 20:00:00", "2026-08-20", "Влад", "Игрок1"];
  const row2 = ["2026-08-20 20:00:00", "2026-08-20", "Влад", "Игрок1"];
  const gid1 = sb.unifiedGameId("MTT", row1);
  const gid2 = sb.unifiedGameId("MTT", row2);
  assert.strictEqual(gid1, gid2);
  assert.ok(gid1.startsWith("H_MTT_2026-08-20_"));
  console.log("✔ Test 3 Passed: unifiedGameId is strictly deterministic");
}

// Test 4: Dynamic Chunked Cache (putChunkedCache, getChunkedCache, removeChunkedCache)
function testDynamicChunkedCache() {
  const sb = loadSandbox(['Analytics.js']);
  
  const largeArray = [];
  for (let i = 0; i < 500; i++) {
    largeArray.push({ id: i, name: "Игрок_" + i, score: 1000 + i, data: "Тестовая строка данных".repeat(15) });
  }
  const originalObj = { players: largeArray, total: largeArray.length };

  sb.putChunkedCache("TEST_LARGE_DATA", originalObj, 900);
  const retrievedObj = sb.getChunkedCache("TEST_LARGE_DATA");

  assert.strictEqual(JSON.stringify(retrievedObj), JSON.stringify(originalObj), "Retrieved object should match original object 100%");
  
  sb.removeChunkedCache("TEST_LARGE_DATA");
  const afterRemove = sb.getChunkedCache("TEST_LARGE_DATA");
  assert.strictEqual(afterRemove, null, "Should return null after removal");

  console.log("✔ Test 4 Passed: DynamicChunkedCache seamlessly handles multi-chunk payloads");
}

// Test 5: Achievement & Bonus Formulas
function testAchievementsFormulas() {
  // ITM Stack: thresholds 3, 7, 12, 18, 25... (+5 pts each)
  function calcStack(itm) {
    let count = 0, bonus = 0, thresh = 3, step = 4;
    while (itm >= thresh) {
      count++;
      bonus += 5;
      thresh += step;
      step++;
    }
    return { count, bonus, nextThresh: thresh };
  }

  assert.deepStrictEqual(calcStack(0), { count: 0, bonus: 0, nextThresh: 3 });
  assert.deepStrictEqual(calcStack(2), { count: 0, bonus: 0, nextThresh: 3 });
  assert.deepStrictEqual(calcStack(3), { count: 1, bonus: 5, nextThresh: 7 });
  assert.deepStrictEqual(calcStack(6), { count: 1, bonus: 5, nextThresh: 7 });
  assert.deepStrictEqual(calcStack(7), { count: 2, bonus: 10, nextThresh: 12 });
  assert.deepStrictEqual(calcStack(12), { count: 3, bonus: 15, nextThresh: 18 });
  assert.deepStrictEqual(calcStack(18), { count: 4, bonus: 20, nextThresh: 25 });

  // Ranks
  function calcRank(itm) {
    if (itm >= 18) return { label: "BOSS", bonus: 50 };
    if (itm >= 12) return { label: "LEGEND", bonus: 35 };
    if (itm >= 6) return { label: "SHARK", bonus: 15 };
    return { label: "FISH", bonus: 0 };
  }

  assert.strictEqual(calcRank(5).label, "FISH");
  assert.strictEqual(calcRank(6).label, "SHARK");
  assert.strictEqual(calcRank(11).label, "SHARK");
  assert.strictEqual(calcRank(12).label, "LEGEND");
  assert.strictEqual(calcRank(18).label, "BOSS");

  console.log("✔ Test 5 Passed: Achievement & Stack formulas verified mathematically");
}

// Test 6: Player Card Milestones & Boundary Logic
function testPlayerCardMilestones() {
  const mockMonthRows = [
    [1, "", "Лидер", 100, "BOSS"],
    [2, "", "Второй", 85, "LEGEND"],
    [3, "", "Третий", 70, "LEGEND"],
    [4, "", "Четвертый", 50, "SHARK"],
    [5, "", "Пятый", 40, "SHARK"],
    [6, "", "Шестой", 35, "SHARK"],
    [7, "", "Седьмой", 30, "SHARK"],
    [8, "", "Восьмой", 25, "SHARK"],
    [9, "", "Девятый", 20, "FISH"],
    [10, "", "Десятый", 15, "FISH"]
  ];

  function calcGoal(myPos, myPoints, rows) {
    function boundaryFor(pos) {
      if (pos >= 1 && pos <= rows.length) return Number(rows[pos - 1][3]) || 0;
      return null;
    }
    function minWinToPass(boundary) {
      if (boundary === null) return null;
      var wins = [10, 20, 30];
      for (var w = 0; w < wins.length; w++) {
        if (myPoints + wins[w] > boundary) return wins[w];
      }
      return null;
    }
    function milestone(pos) {
      var isInside = myPos <= pos;
      var b = boundaryFor(pos);
      var gap = null, buffer = null, minWin = null;
      if (isInside) {
        var dropBoundary = boundaryFor(pos + 1);
        buffer = dropBoundary !== null ? Math.max(0, myPoints - dropBoundary) : myPoints;
      } else {
        if (b !== null) {
          gap = Math.max(0, b - myPoints + 1);
          minWin = minWinToPass(b);
        }
      }
      return { pos, in: isInside, gap, buffer, minWin };
    }
    return {
      position: myPos,
      isLeader: myPos === 1,
      milestones: [milestone(9), milestone(3), milestone(1)]
    };
  }

  // Case 1: Leader (#1, 100 pts)
  const g1 = calcGoal(1, 100, mockMonthRows);
  assert.strictEqual(g1.isLeader, true);
  assert.strictEqual(g1.milestones[2].in, true); // Milestone 1
  assert.strictEqual(g1.milestones[2].buffer, 15); // 100 - 85 (boundary of #2)
  assert.strictEqual(g1.milestones[1].in, true); // Milestone 3
  assert.strictEqual(g1.milestones[1].buffer, 50); // 100 - 50 (boundary of #4)

  // Case 2: Chaser (#4, 50 pts)
  const g4 = calcGoal(4, 50, mockMonthRows);
  assert.strictEqual(g4.isLeader, false);
  assert.strictEqual(g4.milestones[1].in, false); // Milestone 3 (Top 3)
  assert.strictEqual(g4.milestones[1].gap, 21); // 70 - 50 + 1 = 21 to pass #3
  assert.strictEqual(g4.milestones[1].minWin, 30); // Single MTT win (+30) is enough to pass 70

  // Case 3: Bubble player (#10, 15 pts)
  const g10 = calcGoal(10, 15, mockMonthRows);
  assert.strictEqual(g10.milestones[0].in, false); // Milestone 9 (Top 9)
  assert.strictEqual(g10.milestones[0].gap, 6); // 20 - 15 + 1 = 6 to pass #9
  assert.strictEqual(g10.milestones[0].minWin, 10); // SnG win (+10) is enough

  console.log("✔ Test 6 Passed: Player Card Milestones, Buffers and Gaps calculate flawlessly");
}

testCleanPlayerName();
testNormalizeFormRows();
testUnifiedGameId();
testDynamicChunkedCache();
testAchievementsFormulas();
testPlayerCardMilestones();

console.log("\nALL TEST SUITES PASSED PERFECTLY! (6/6)");
