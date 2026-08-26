// ==========================================
// ДВИЖОК ЛИДЕРБОРДА
// ==========================================
// Вычисляет статистику из DB_Results и выгружает 9 колонок
// в локальный и публичный листы Leaderboard.
//
// Поддерживает периоды:
//   - 'month' (текущий месяц) — для текущего лидерборда
//   - 'all'   (за всё время)  — для Mini App / аналитики
//
// Правила очков/ачивок централизованы здесь.

/**
 * Вычислить и выгрузить лидерборд за текущий месяц (live-поведение).
 */
function calculateLeaderboard() {
  return computeAndPublishLeaderboard('month', true);
}

/**
 * Внутренняя функция: открывает таблицы, агрегирует результаты, возвращает строки.
 *
 * @param {string} period 'month' (текущий/заданный месяц с бонусами) или 'all'
 * @param {string} [targetMonthStr] Месяц в формате "ГГГГ-ММ". Если задан — считаем
 *                                  лидерборд ЗА ЭТОТ месяц (для верификации истории).
 *                                  Если не задан — берём текущий месяц.
 * @returns {Array<Array>} строки лидерборда (9 колонок)
 */
function computeLeaderboardRows(period, targetMonthStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var playersSheet = ss.getSheetByName(CONFIG.SHEETS.PLAYERS);
  var resultsSheet = ss.getSheetByName(CONFIG.SHEETS.RESULTS);
  var snapSheet = ss.getSheetByName(CONFIG.SHEETS.SNAPSHOTS);

  if (!playersSheet || !resultsSheet) {
    Logger.log("Ошибка: отсутствуют листы PlayersDB / DB_Results!");
    return [];
  }

  // Определяем месяц для фильтрации ('.month'). Если задан targetMonthStr — используем его.
  var now = new Date();
  var currentMonth, currentYear;
  var isCustomMonth = false;
  if (period === 'month' && targetMonthStr) {
    var parts = String(targetMonthStr).split("-");
    if (parts.length === 2) {
      currentYear = Number(parts[0]);
      currentMonth = Number(parts[1]) - 1; // JS: январь=0
      isCustomMonth = true;
    }
  }
  if (currentMonth === undefined || currentYear === undefined) {
    currentMonth = now.getMonth();
    currentYear = now.getFullYear();
  }
  var monthPrefix = String(currentYear) + "-" +
    ((currentMonth + 1) < 10 ? "0" : "") + (currentMonth + 1);

  // Бонусы достижений (ранги, стек, сеты, двойные) начисляются ТОЛЬКО
  // для месячного лидерборда. За всё время показываем только базовые очки.
  var includeBonuses = (period === 'month');

  // 1. Справочник игроков (реальное имя -> ник)
  var playersData = playersSheet.getDataRange().getValues();
  var playerMap = {};
  for (var i = 1; i < playersData.length; i++) {
    var realName = playersData[i][0] ? playersData[i][0].toString().trim() : "";
    var customNick = playersData[i][1] ? playersData[i][1].toString().trim() : "";
    if (realName) playerMap[realName] = customNick !== "" ? customNick : realName;
  }

  // 2. Предыдущие позиции (из снапшотов) — только для месячного лидерборда
  //    Тренд считаем ОТНОСИТЕЛЬНО САМОГО СВЕЖЕГО снапшота строго раньше сегодня.
  //    Для кастомного (исторического) месяца трендов не показываем (нет истории снапшотов).
  var prevPositions = {};
  if (period === 'month' && !isCustomMonth && snapSheet) {
    var snapRows = snapSheet.getDataRange().getValues();
    if (snapRows.length > 1) {
      var todayStr = normalizeDate(now);
      var bestByNick = {};
      for (var s = 1; s < snapRows.length; s++) {
        var sDate = normalizeDate(snapRows[s][0]);   // всегда строка "yyyy-MM-dd"
        var sNick = snapRows[s][1] ? String(snapRows[s][1]) : "";
        var sPos = Number(snapRows[s][2]);
        if (!sNick || isNaN(sPos)) continue;
        if (sDate && sDate < todayStr) {
          if (!bestByNick[sNick] || sDate > bestByNick[sNick].date) {
            bestByNick[sNick] = { date: sDate, pos: sPos };
          }
        }
      }
      for (var nickKey in bestByNick) {
        prevPositions[nickKey] = bestByNick[nickKey].pos;
      }
    }
  }

  // 3. Агрегация DB_Results
  var resultsData = resultsSheet.getDataRange().getValues();
  if (resultsData.length < 2) return [];

  var stats = {};

  function initPlayer(p) {
    if (!stats[p]) {
      stats[p] = {
        realName: p,
        displayName: playerMap[p] || p,
        gamePoints: 0,
        koPoints: 0,
        itmCount: 0,
        gold: 0, silver: 0, bronze: 0,
        knockouts: 0,
        doubleCount: 0,
        formatsCount: {},
        winsByDateDealer: {}
      };
    }
  }

  for (var r = 1; r < resultsData.length; r++) {
    var gameDateStr = normalizeDate(resultsData[r][CONFIG.DB_COL.DATE]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(gameDateStr)) continue;

    // Фильтр периода
    if (period === 'month') {
      if (gameDateStr.substring(0, 7) !== monthPrefix) continue;
    }

    var format = resultsData[r][CONFIG.DB_COL.FORMAT] ? resultsData[r][CONFIG.DB_COL.FORMAT].toString().trim() : "SnG";
    var dealer = resultsData[r][CONFIG.DB_COL.DEALER];
    var player = resultsData[r][CONFIG.DB_COL.PLAYER] ? resultsData[r][CONFIG.DB_COL.PLAYER].toString().trim() : "";
    var event = resultsData[r][CONFIG.DB_COL.EVENT];
    var points = Number(resultsData[r][CONFIG.DB_COL.POINTS]) || 0;
    var isItm = resultsData[r][CONFIG.DB_COL.IS_ITM];

    if (!player || !isParticipating(player)) continue;

    initPlayer(player);
    var pStats = stats[player];

    if (event === "Нокаут") {
      pStats.koPoints += points;
      pStats.knockouts++;
    } else {
      pStats.gamePoints += points;
      pStats.formatsCount[format] = (pStats.formatsCount[format] || 0) + 1;
    }

    if (isItm === "ДА") pStats.itmCount++;

    if (event === "1 место") {
      pStats.gold++;
      var dateStr = gameDateStr;
      var key = dateStr + "_" + dealer;
      pStats.winsByDateDealer[key] = (pStats.winsByDateDealer[key] || 0) + 1;
    } else if (event === "2 место") {
      pStats.silver++;
    } else if (event === "3 место") {
      pStats.bronze++;
    }
  }

  // 4. Расчёт ачивок и сбор строк
  var rows = [];

  for (var playerKey in stats) {
    var p = stats[playerKey];

    // --- Бонусы достижений (ТОЛЬКО для месячного лидерборда) ---
    var doubleBonus = 0, fullSetBonus = 0, itmStackBonus = 0, itmStackCount = 0;
    var rankStr = "—", rankBonus = 0;
    var fullSets = 0, currentThreshold = 3;

    if (includeBonuses) {
      // DOUBLE
      for (var ddKey in p.winsByDateDealer) {
        if (p.winsByDateDealer[ddKey] >= 2) {
          p.doubleCount += Math.floor(p.winsByDateDealer[ddKey] / 2);
        }
      }
      doubleBonus = p.doubleCount * 10;

      // FULL SET
      fullSets = Math.min(p.gold, p.silver, p.bronze);
      fullSetBonus = fullSets * 10;

      // ITM STACK
      itmStackCount = 0; currentThreshold = 3; var step = 4;
      var tempItm = p.itmCount;
      while (tempItm >= currentThreshold) {
        itmStackCount++;
        itmStackBonus += 5;
        currentThreshold += step;
        step++;
      }

      // RANKS
      if (p.itmCount >= 18)      { rankStr = "👑 BOSS (MAX)";            rankBonus = 50; }
      else if (p.itmCount >= 12) { rankStr = "💪 LEGEND (" + p.itmCount + "/18)"; rankBonus = 35; }
      else if (p.itmCount >= 6)  { rankStr = "🦈 SHARK (" + p.itmCount + "/12)"; rankBonus = 15; }
      else                       { rankStr = "🐟 FISH (" + p.itmCount + "/6)";    rankBonus = 0; }
    }

    var totalPoints = p.gamePoints + p.koPoints + doubleBonus + fullSetBonus + itmStackBonus + rankBonus;

    // Детализация
    var fmtArr = [];
    for (var fKey in p.formatsCount) fmtArr.push(p.formatsCount[fKey] + "x" + fKey);
    var fmtStr = fmtArr.length ? " (" + fmtArr.join(", ") + ")" : "";

    var breakdownParts = [];
    if (p.gamePoints > 0) breakdownParts.push("🎮 " + p.gamePoints + fmtStr);
    if (p.koPoints > 0)   breakdownParts.push("🎯 " + p.koPoints + " (Нокауты)");
    if (rankBonus > 0)    breakdownParts.push("🏷️ " + rankBonus + " (Ранг)");
    if (itmStackBonus > 0) breakdownParts.push("💎 " + itmStackBonus + " (Stack)");
    if (fullSetBonus > 0) breakdownParts.push("♠️ " + fullSetBonus + " (Set)");
    if (doubleBonus > 0)  breakdownParts.push("⚡ " + doubleBonus + " (Double)");
    var breakdownStr = breakdownParts.length ? breakdownParts.join(" | ") : "0 очков";

    var itmStackCol = "Уровень " + itmStackCount + " (" + p.itmCount + "/" + currentThreshold + ")";
    var fullSetCol = fullSets + " наб. (🥇" + p.gold + " 🥈" + p.silver + " 🥉" + p.bronze + ")";

    var bonusArr = [];
    if (p.doubleCount > 0) bonusArr.push("⚡x" + p.doubleCount);
    if (p.knockouts > 0)   bonusArr.push("🎯x" + p.knockouts);
    var bonusCol = bonusArr.length ? bonusArr.join("  ") : "—";

    // Структурированные данные достижений — для карточки игрока (прогресс-бары).
    var rankNext = null;
    if (p.itmCount < 6) rankNext = { name: "SHARK", itm: 6, need: 6 - p.itmCount };
    else if (p.itmCount < 12) rankNext = { name: "LEGEND", itm: 12, need: 12 - p.itmCount };
    else if (p.itmCount < 18) rankNext = { name: "BOSS", itm: 18, need: 18 - p.itmCount };
    var needG = Math.max(0, fullSets + 1 - p.gold);
    var needS = Math.max(0, fullSets + 1 - p.silver);
    var needB = Math.max(0, fullSets + 1 - p.bronze);
    var meta = {
      itm: p.itmCount,
      rank: { label: rankStr, bonus: rankBonus, next: rankNext },
      stack: { level: itmStackCount, bonus: itmStackBonus, itm: p.itmCount, nextItm: currentThreshold, need: Math.max(0, currentThreshold - p.itmCount) },
      set: { sets: fullSets, bonus: fullSetBonus, gold: p.gold, silver: p.silver, bronze: p.bronze, needG: needG, needS: needS, needB: needB }
    };

    rows.push({
      name: p.displayName,
      points: totalPoints,
      rank: rankStr,
      itmStack: itmStackCol,
      fullSet: fullSetCol,
      bonuses: bonusCol,
      breakdown: breakdownStr,
      rawItm: p.itmCount,
      meta: meta
    });
  }

  // 5. Сортировка
  rows.sort(function(a, b) {
    if (b.points !== a.points) return b.points - a.points;
    return b.rawItm - a.rawItm;
  });

  // 6. Сборка выходных строк (9 колонок)
  var output = [];
  for (var m = 0; m < rows.length; m++) {
    var row = rows[m];
    var currentPos = m + 1;
    var nick = row.name;
    var trend = "🆕";

    if (prevPositions.hasOwnProperty(nick)) {
      var prevPos = prevPositions[nick];
      var diff = prevPos - currentPos;
      if (diff > 0) trend = "🔼 +" + diff;
      else if (diff < 0) trend = "🔽 " + diff;
      else trend = "➖";
    }

    output.push([
      currentPos, trend, row.name, row.points, row.rank,
      row.itmStack, row.fullSet, row.bonuses, row.breakdown,
      row.meta   // 10-я «служебная» колонка для карточки игрока (не пишется в лист)
    ]);
  }

  return output;
}

/**
 * Публикация лидерборда в локальный и публичный листы.
 */
function publishLeaderboard(rows, period) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lbSheet = ss.getSheetByName(CONFIG.SHEETS.LEADERBOARD);
  if (!lbSheet) return;

  // 1) Локальный лист
  // В строках может быть 10-я служебная колонка (meta для карточки игрока) —
  // в лист пишем только первые 9.
  var sheetRows = rows.map(function(r) { return r.slice(0, 9); });
  var lastLbRow = lbSheet.getLastRow();
  if (lastLbRow > 1) lbSheet.getRange(2, 1, lastLbRow - 1, 9).clearContent();
  if (sheetRows.length > 0) lbSheet.getRange(2, 1, sheetRows.length, 9).setValues(sheetRows);

  // Детерминированные ширины колонок (при каждом пересчёте)
  applyWidthsToSheet(lbSheet);

  // 2) Публичный лист
  var pubId = getScriptProperty('PUBLIC_SPREADSHEET_ID', CONFIG.PUBLIC_SPREADSHEET_ID);
  if (!pubId || pubId.indexOf("ВСТАВЬ") > -1) {
    Logger.log("⚠️ Не задан PUBLIC_SPREADSHEET_ID");
    return;
  }

  try {
    var pubSpreadsheet = SpreadsheetApp.openById(pubId);
    var pubSheet = pubSpreadsheet.getSheetByName(CONFIG.SHEETS.LEADERBOARD);
    if (!pubSheet) {
      Logger.log("Ошибка: в публичной таблице нет листа 'Leaderboard'");
      return;
    }
    var lastPubRow = pubSheet.getLastRow();
    if (lastPubRow > 1) pubSheet.getRange(2, 1, lastPubRow - 1, 9).clearContent();
    if (sheetRows.length > 0) {
      pubSheet.getRange(2, 1, sheetRows.length, 9).setValues(sheetRows);

      // Детерминированные ширины колонок и в публичном листе
      applyWidthsToSheet(pubSheet);
      Logger.log("Публичный лидерборд обновлён (" + sheetRows.length + " строк)");
    }
  } catch (e) {
    Logger.log("КРИТИЧЕСКАЯ ОШИБКА выгрузки в публичную таблицу: " + e.message);
  }
}

/**
 * Полный цикл: вычислить + выгрузить.
 */
function computeAndPublishLeaderboard(period, publish) {
  var rows = computeLeaderboardRows(period);
  if (publish) {
    publishLeaderboard(rows, period);
  }
  return rows;
}

// ==========================================
// ДИАГНОСТИКА
// ==========================================

/**
 * Показывает реальную картину в DB_Results, чтобы найти причину завышения очков:
 * задвоения, превышение масштаба ачивок, разбивку по форматам/месяцам.
 * Ничего не изменяет.
 */
function diagnoseLeaderboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var resultsSheet = ss.getSheetByName(CONFIG.SHEETS.RESULTS);
  var playersSheet = ss.getSheetByName(CONFIG.SHEETS.PLAYERS);
  if (!resultsSheet) { Logger.log("Нет DB_Results"); return; }

  var data = resultsSheet.getDataRange().getValues();
  if (data.length < 2) { Logger.log("DB_Results пуст"); return; }

  var now = new Date();
  var curMonth = now.getMonth();
  var curYear = now.getFullYear();

  var report = ["=== ДИАГНОСТИКА ЛИДЕРБОРДА ==="];
  report.push("Всего строк в DB_Results (с заголовком): " + data.length);
  report.push("Строк данных (без заголовка): " + (data.length - 1));

  // ---- Уникальные gameId ----
  var allGameIds = new Set();
  var monthGameIds = new Set();
  var monthRows = 0;
  var monthKOs = 0;
  var monthPointsByFormat = {};
  var monthPlayers = new Set();

  var gameIdRowCount = {};  // сколько строк приходится на один gameId
  var hCount = 0, gCount = 0;

  for (var r = 1; r < data.length; r++) {
    var gid = data[r][CONFIG.DB_COL.GAME_ID];
    var rawDate = data[r][CONFIG.DB_COL.DATE];
    var d = new Date(rawDate);
    if (gid) {
      allGameIds.add(String(gid));
      gameIdRowCount[String(gid)] = (gameIdRowCount[String(gid)] || 0) + 1;
      if (String(gid).indexOf("H_") === 0) hCount++;
      else gCount++;
    }

    if (isNaN(d.getTime())) continue;
    var isMonth = (d.getMonth() === curMonth && d.getFullYear() === curYear);
    if (!isMonth) continue;

    monthRows++;
    if (gid) monthGameIds.add(String(gid));

    var fmt = data[r][CONFIG.DB_COL.FORMAT] ? String(data[r][CONFIG.DB_COL.FORMAT]).trim() : "SnG";
    var pts = Number(data[r][CONFIG.DB_COL.POINTS]) || 0;
    var ev = data[r][CONFIG.DB_COL.EVENT];
    var player = data[r][CONFIG.DB_COL.PLAYER] ? String(data[r][CONFIG.DB_COL.PLAYER]).trim() : "";

    if (ev === "Нокаут") monthKOs++;
    monthPointsByFormat[fmt] = (monthPointsByFormat[fmt] || 0) + pts;
    if (player) monthPlayers.add(player);
  }

  report.push("\n--- УНИКАЛЬНЫЕ ИГРЫ (gameId) ---");
  report.push("Всего уникальных gameId: " + allGameIds.size);
  report.push("Строк с ключом H_ (бэкфилл/единый): " + hCount);
  report.push("Строк с ключом G_ (старый live): " + gCount);

  // Задвоения: gameId с неожиданно большим числом строк
  report.push("\n--- ПОДОЗРЕНИЯ НА ЗАДВОЕНИЕ ---");
  var suspicious = 0;
  for (var gid2 in gameIdRowCount) {
    if (gameIdRowCount[gid2] > 12) { // >12 строк на 1 игру (10 мест + KO) — почти наверняка дубль
      suspicious++;
      if (suspicious <= 5) {
        report.push("  gameId " + gid2 + " -> " + gameIdRowCount[gid2] + " строк");
      }
    }
  }
  report.push(suspicious === 0 ? "Явных задвоений не обнаружено (>12 строк/игру)." : "Найдено подозрительных gameId: " + suspicious);

  // ---- Текущий месяц ----
  report.push("\n--- ТЕКУЩИЙ МЕСЯЦ (" + (curMonth + 1) + "." + curYear + ") ---");
  report.push("Строк за текущий месяц: " + monthRows);
  report.push("Уникальных игр (gameId) за месяц: " + monthGameIds.size);
  report.push("Участников за месяц: " + monthPlayers.size);
  report.push("Нокаутов за месяц: " + monthKOs);
  var fmtStr = "";
  for (var f in monthPointsByFormat) fmtStr += "  " + f + "=" + monthPointsByFormat[f] + " очк.";
  report.push("Очки за месяц по форматам:" + (fmtStr || " (нет)"));

  // ---- Топ-5 за месяц (только очки игры+KO, без ачивок) ----
  report.push("\n--- ТОП-5 ЗА МЕСЯЦ (очки без ачивок) ---");
  var agg = {};
  for (var r2 = 1; r2 < data.length; r2++) {
    var rawDate2 = data[r2][CONFIG.DB_COL.DATE];
    var d2 = new Date(rawDate2);
    if (isNaN(d2.getTime())) continue;
    if (!(d2.getMonth() === curMonth && d2.getFullYear() === curYear)) continue;
    var pl = data[r2][CONFIG.DB_COL.PLAYER] ? String(data[r2][CONFIG.DB_COL.PLAYER]).trim() : "";
    if (!pl || !isParticipating(pl)) continue;
    var pts2 = Number(data[r2][CONFIG.DB_COL.POINTS]) || 0;
    if (!agg[pl]) agg[pl] = 0;
    agg[pl] += pts2;
  }
  var top = Object.keys(agg).sort(function(a, b) { return agg[b] - agg[a]; }).slice(0, 5);
  for (var t = 0; t < top.length; t++) {
    report.push("  " + (t + 1) + ". " + top[t] + " = " + agg[top[t]] + " очков");
  }

  // ---- Игроки в PlayersDB ----
  if (playersSheet) {
    var pData = playersSheet.getDataRange().getValues();
    report.push("\n--- PLAYERSDB ---");
    report.push("Строк игроков (без заголовка): " + Math.max(pData.length - 1, 0));
  }

  report.push("\n=== КОНЕЦ ДИАГНОСТИКИ ===");
  Logger.log(report.join("\n"));
  try {
    SpreadsheetApp.getUi().alert("Диагностика завершена. Откройте View > Logs, чтобы увидеть цифры.\n\n" + report.slice(0, 14).join("\n"));
  } catch (e) {}
}
