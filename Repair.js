// ==========================================
// РЕМОНТ И СВЕРКА ДАННЫХ
// ==========================================
// Восстанавливает пропавшие строки в DB_Results по данным сырых листов форм.
//
// Сценарий потери: live-запись (processFormSubmit) получила неполный ответ формы
// (поле места пустое / "Not participating"), позже ответ отредактировали и вписали
// игрока. Сырой лист стал полным, а DB_Results — нет (курсор бэкфилла уже прошёл
// строку, а processFormSubmit при редактировании не перезапускается).

var RECONCILE_TS_WINDOW_MS = 60000; // окно совпадения live-игры по timestamp, 60 сек

/**
 * Сверка сырых листов (Data/MTT/Mystery) с DB_Results.
 * Для каждой сырой строки находит соответствующую игру в DB_Results и, если в
 * ней не хватает (событие|игрок), дополняет её (в режиме commit).
 *
 * Сопоставление "сырая строка -> игра в DB":
 *  1. Единый ключ unifiedGameId (новые игры с единым gameId);
 *  2. иначе live-игра G_<мс> с близким timestamp (в пределах окна) и той же
 *     датой+дилером+форматом;
 *  3. иначе строка пропускается (отчёт).
 *
 * @param {boolean} commit true — писать в DB_Results; false — только отчёт.
 * @returns {Object} отчёт { success, commit, games:[...], skippedRawRows:[...] }
 */
function reconcileRawToDb(commit) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var resultsSheet = ss.getSheetByName(CONFIG.SHEETS.RESULTS);
  if (!resultsSheet) return { success: false, error: "нет листа DB_Results" };

  var dbData = resultsSheet.getDataRange().getValues();
  var dbGames = {};   // key: "date|format|dealer|gameId" -> {gameId,date,format,dealer,rows:{}}
  var gByGroup = {};  // key: "date|format|dealer" -> [{gameId, ms}] для live G_*
  var gMs = {};       // gameId -> ms (числовая часть G_<мс>)

  for (var r = 1; r < dbData.length; r++) {
    var gid = dbData[r][CONFIG.DB_COL.GAME_ID] ? String(dbData[r][CONFIG.DB_COL.GAME_ID]).trim() : "";
    if (!gid) continue;
    var dateS = normalizeDate(dbData[r][CONFIG.DB_COL.DATE]);
    var fmtS = dbData[r][CONFIG.DB_COL.FORMAT] ? String(dbData[r][CONFIG.DB_COL.FORMAT]).trim() : "";
    var dlrS = dbData[r][CONFIG.DB_COL.DEALER] ? String(dbData[r][CONFIG.DB_COL.DEALER]).trim() : "";
    var gk = dateS + "|" + fmtS + "|" + dlrS + "|" + gid;
    if (!dbGames[gk]) {
      dbGames[gk] = { gameId: gid, date: dateS, format: fmtS, dealer: dlrS, rows: {} };
    }
    var ep = String(dbData[r][CONFIG.DB_COL.EVENT]).trim() + "|" + String(dbData[r][CONFIG.DB_COL.PLAYER]).trim();
    dbGames[gk].rows[ep] = true;
    if (gid.indexOf("G_") === 0) {
      var ms = Number(gid.substring(2));
      if (!isNaN(ms)) {
        gMs[gid] = ms;
        var grp = dateS + "|" + fmtS + "|" + dlrS;
        if (!gByGroup[grp]) gByGroup[grp] = [];
        // Один раз на игру (иначе число кандидатов раздувается числом мест)
        var already = false;
        for (var gi = 0; gi < gByGroup[grp].length; gi++) {
          if (gByGroup[grp][gi].gameId === gid) { already = true; break; }
        }
        if (!already) gByGroup[grp].push({ gameId: gid, ms: ms });
      }
    }
  }

  var result = { success: true, commit: !!commit, games: [], skippedRawRows: [], replacementCandidates: [] };
  var rowsToAppend = [];

  for (var sheetKey in CONFIG.FORMATS) {
    var cfg = CONFIG.FORMATS[sheetKey];
    var rawSheet = ss.getSheetByName(sheetKey);
    if (!rawSheet) continue;
    var rawData = rawSheet.getDataRange().getValues();
    if (rawData.length <= 1) continue;

    for (var i = 1; i < rawData.length; i++) {
      var row = rawData[i];
      if (!row[1]) continue; // нет даты — пропускаем

      var normalized = normalizeFormRow(sheetKey, row, "");
      if (!normalized.items.length) continue; // игра без участников — нечего сверять

      var dateS2 = normalizeDate(row[1]);
      var fmtS2 = normalized.format;
      var dlrS2 = normalized.dealer;
      var matchGame = null;

      // 1) Единый ключ (новые игры)
      var ugid = unifiedGameId(sheetKey, row);
      matchGame = dbGames[dateS2 + "|" + fmtS2 + "|" + dlrS2 + "|" + ugid];

      // 1а) Старый ключ бэкфилла (H_..._r<строка>) — игры до миграции на единый ключ
      if (!matchGame) {
        var lgid = legacyHistoricalGameId(sheetKey, row, i);
        matchGame = dbGames[dateS2 + "|" + fmtS2 + "|" + dlrS2 + "|" + lgid];
      }

      // 2) live-игра G_<мс> с близким timestamp
      if (!matchGame) {
        var rawMs = null;
        if (row[0]) {
          var parsed = new Date(row[0]);
          if (!isNaN(parsed.getTime())) rawMs = parsed.getTime();
        }
        if (rawMs) {
          var group = gByGroup[dateS2 + "|" + fmtS2 + "|" + dlrS2];
          var candidates = [];
          if (group) {
            var seenCand = {};
            for (var ci = 0; ci < group.length; ci++) {
              if (seenCand[group[ci].gameId]) continue;
              if (Math.abs(group[ci].ms - rawMs) <= RECONCILE_TS_WINDOW_MS) {
                seenCand[group[ci].gameId] = true;
                candidates.push(group[ci]);
              }
            }
          }
          if (candidates.length === 1) {
            matchGame = dbGames[dateS2 + "|" + fmtS2 + "|" + dlrS2 + "|" + candidates[0].gameId];
          }
        }
      }

      if (!matchGame) {
        result.skippedRawRows.push({
          sheet: sheetKey, row: i + 1, date: dateS2, dealer: dlrS2,
          players: normalized.items.map(function(it) { return it.event + ":" + it.player; })
        });
        continue;
      }

      // 3) Отсутствующие (событие|игрок) в этой игре
      var missing = [];
      for (var it = 0; it < normalized.items.length; it++) {
        var item = normalized.items[it];
        if (!matchGame.rows[item.event + "|" + item.player]) {
          // ПРОВЕРКА на "замену": в игре уже есть ДРУГОЙ игрок на этом же месте —
          // это случай редактирования с заменой, а не пропущенная строка.
          var hasOtherAtEvent = false;
          for (var ek in matchGame.rows) {
            if (ek.indexOf(item.event + "|") === 0) { hasOtherAtEvent = true; break; }
          }
          if (hasOtherAtEvent) {
            result.replacementCandidates.push({
              gameId: matchGame.gameId, date: dateS2, dealer: dlrS2,
              event: item.event, rawPlayer: item.player,
              dbPlayer: Object.keys(matchGame.rows).filter(function(k) {
                return k.indexOf(item.event + "|") === 0;
              })[0]
            });
            continue;
          }
          missing.push({ event: item.event, player: item.player, points: item.points, isItm: item.isItm });
        }
      }

      if (missing.length) {
        result.games.push({
          gameId: matchGame.gameId,
          date: dateS2,
          format: fmtS2,
          dealer: dlrS2,
          missing: missing
        });
        if (commit) {
          for (var m = 0; m < missing.length; m++) {
            rowsToAppend.push([
              matchGame.gameId, row[1], fmtS2, dlrS2,
              missing[m].player, missing[m].event, missing[m].points, missing[m].isItm
            ]);
            matchGame.rows[missing[m].event + "|" + missing[m].player] = true;
          }
        }
      }
    }
  }

  if (commit && rowsToAppend.length > 0) {
    resultsSheet.getRange(resultsSheet.getLastRow() + 1, 1, rowsToAppend.length, 8).setValues(rowsToAppend);
  }

  if (commit && result.games.length) {
    calculateLeaderboard();
    invalidateAnalyticsCache();
  }

  return result;
}

/**
 * Обёртка для меню: сверка в режиме предпросмотра.
 */
function reconcilePreview() {
  var res = reconcileRawToDb(false);
  var lines = [];
  for (var i = 0; i < res.games.length; i++) {
    var g = res.games[i];
    var parts = [];
    for (var j = 0; j < g.missing.length; j++) {
      parts.push(g.missing[j].event + " → " + g.missing[j].player + " (+" + g.missing[j].points + ")");
    }
    lines.push(g.date + " | " + g.format + " | " + g.dealer + " | " + g.gameId + " | " + parts.join(", "));
  }
  var msg = res.games.length
    ? "Найдено несоответствий: " + res.games.length + "\n\n" + lines.slice(0, 20).join("\n")
    : "Несоответствий не найдено.";
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    Logger.log(msg);
  }
}

/**
 * Обёртка для меню: сверка с применением (дополняет DB_Results).
 */
function reconcileCommit() {
  var res = reconcileRawToDb(true);
  try {
    SpreadsheetApp.getUi().alert(
      "Сверка завершена.\n\nДополнено игр: " + res.games.length +
      "\nСтрок добавлено: " + countMissing(res) + "\n\nДанные пересчитаны."
    );
  } catch (e) {
    Logger.log("reconcileCommit: " + JSON.stringify(res));
  }
}

function countMissing(res) {
  var n = 0;
  for (var i = 0; i < res.games.length; i++) n += res.games[i].missing.length;
  return n;
}

/**
 * Ремонт «битых» gameId в DB_Results.
 *
 * Причина: формы иногда отдают дату текстом "ДД/ММ/ГГГГ", которую normalizeDate()
 * (до фикса) не парсила — gameId получался H_<лист>_ДД/ММ/ГГГГ_no_ts, а у разных
 * игр одного дня возникала коллизия (одинаковый gameId).
 *
 * Стратегия (не трогаем ничего лишнего):
 *  - Находим строки с gameId, содержащим '/' или 'no_ts'.
 *  - Для каждой строки ищем источник в сырых листах форм: тот же лист-формат,
 *    та же нормализованная дата, то же (событие|игрок) и те же очки.
 *  - Строки, совпавшие с одним и тем же сырым рядом, — одна игра; назначаем ей
 *    уникальный детерминированный gameId = H_<лист>_<дата>[_<ts>]_r<строка>.
 *    Если у сырой строки есть парсящийся timestamp — используем формат legacy
 *    (H_..._<ts>_r<строка>), чтобы идемпотентность бэкфилла работала и дальше.
 *  - Несовпавшие строки оставляем без изменений и возвращаем в отчёте.
 *
 * @param {boolean} commit true — писать; false — только отчёт.
 * @returns {Object} отчёт { success, commit, brokenRows, groups, unmatched }
 */
function repairBrokenGameIds(commit) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var resultsSheet = ss.getSheetByName(CONFIG.SHEETS.RESULTS);
  if (!resultsSheet) return { success: false, error: "нет листа DB_Results" };

  var dbData = resultsSheet.getDataRange().getValues();

  // 1) «Битые» строки DB
  var brokenRows = [];
  for (var r = 1; r < dbData.length; r++) {
    var gid = dbData[r][CONFIG.DB_COL.GAME_ID] ? String(dbData[r][CONFIG.DB_COL.GAME_ID]).trim() : "";
    if (gid.indexOf("/") > -1 || gid.indexOf("no_ts") > -1) {
      brokenRows.push({
        dbRow: r + 1,
        gid: gid,
        date: normalizeDate(dbData[r][CONFIG.DB_COL.DATE]),
        format: dbData[r][CONFIG.DB_COL.FORMAT] ? String(dbData[r][CONFIG.DB_COL.FORMAT]).trim() : "",
        dealer: dbData[r][CONFIG.DB_COL.DEALER] ? String(dbData[r][CONFIG.DB_COL.DEALER]).trim() : "",
        player: dbData[r][CONFIG.DB_COL.PLAYER] ? String(dbData[r][CONFIG.DB_COL.PLAYER]).trim() : "",
        event: dbData[r][CONFIG.DB_COL.EVENT] ? String(dbData[r][CONFIG.DB_COL.EVENT]).trim() : "",
        points: Number(dbData[r][CONFIG.DB_COL.POINTS]) || 0,
        isItm: dbData[r][CONFIG.DB_COL.IS_ITM] ? String(dbData[r][CONFIG.DB_COL.IS_ITM]).trim() : ""
      });
    }
  }
  if (!brokenRows.length) return { success: true, commit: !!commit, brokenRows: [], groups: [], unmatched: [] };

  // 2) Индекс сырых строк: (лист, dataIdx) -> { date, format, dealer, signature:{event|player:points}, items }
  var rawIndex = [];
  for (var sheetKey in CONFIG.FORMATS) {
    var cfg = CONFIG.FORMATS[sheetKey];
    var rawSheet = ss.getSheetByName(sheetKey);
    if (!rawSheet) continue;
    var rawData = rawSheet.getDataRange().getValues();
    for (var i = 1; i < rawData.length; i++) {
      var dateS = normalizeDate(rawData[i][1]);
      if (!dateS) continue;
      var norm = normalizeFormRow(sheetKey, rawData[i], "");
      if (!norm.items.length) continue;
      var sig = {};
      for (var it = 0; it < norm.items.length; it++) {
        sig[norm.items[it].event + "|" + norm.items[it].player] = Number(norm.items[it].points) || 0;
      }
      rawIndex.push({
        sheetKey: sheetKey, dataIdx: i, sheetRow: i + 1, date: dateS,
        format: norm.format, dealer: norm.dealer,
        signature: sig, items: norm.items,
        // ts для legacy-формата gameId (если парсится)
        ts: parseRawTimestamp(rawData[i][0])
      });
    }
  }

  // 3) Кандидаты сырого источника для одной битой строки
  function rawCandidates(br) {
    var res = [];
    for (var k = 0; k < rawIndex.length; k++) {
      var ri = rawIndex[k];
      if (ri.format !== br.format) continue;
      if (ri.date !== br.date) continue;
      var key = br.event + "|" + br.player;
      if (ri.signature.hasOwnProperty(key) && ri.signature[key] === br.points) {
        res.push(ri);
      }
    }
    return res;
  }

  // 4) Группировка битых строк по gameId и выбор источника пересечением кандидатов.
  //    Если в группе реально одна игра — пересечение кандидатов всех её строк
  //    даст ровно один сырой ряд (даже если отдельные строки неоднозначны).
  var byGid = {};      // gid -> [brokenRow]
  var gidOrder = [];
  for (var b = 0; b < brokenRows.length; b++) {
    var g = brokenRows[b].gid;
    if (!byGid[g]) { byGid[g] = []; gidOrder.push(g); }
    byGid[g].push(brokenRows[b]);
  }

  var groupsArr = [];
  var unmatched = [];
  for (var gi = 0; gi < gidOrder.length; gi++) {
    var members = byGid[gidOrder[gi]];
    var common = null; // пересечение кандидатов
    for (var mm = 0; mm < members.length; mm++) {
      var cset = rawCandidates(members[mm]);
      if (common === null) {
        common = {};
        for (var c0 = 0; c0 < cset.length; c0++) common[cset[c0].sheetKey + ":" + cset[c0].dataIdx] = cset[c0];
      } else {
        var next = {};
        for (var c1 = 0; c1 < cset.length; c1++) {
          var key2 = cset[c1].sheetKey + ":" + cset[c1].dataIdx;
          if (common[key2]) next[key2] = cset[c1];
        }
        common = next;
      }
    }

    var commonKeys = [];
    for (var ck in common) commonKeys.push(common[ck]);

    if (commonKeys.length === 1) {
      var cand = commonKeys[0];
      var gg = {
        sheetKey: cand.sheetKey,
        dataIdx: cand.dataIdx,
        sheetRow: cand.sheetRow,
        date: cand.date,
        oldGameId: gidOrder[gi],
        newGameId: buildRepairedGameId(cand.sheetKey, cand.date, cand.ts, cand.dataIdx),
        rows: members.map(function(m) { return m.dbRow; }),
        players: members.map(function(m) { return m.event + ": " + m.player; })
      };
      groupsArr.push(gg);
    } else {
      unmatched.push({
        gid: gidOrder[gi],
        dbRows: members.map(function(m) { return m.dbRow; }),
        candidates: commonKeys.map(function(c) { return c.sheetKey + ":" + c.sheetRow + " (" + c.date + ")"; })
      });
    }
  }

  // 5) Commit: обновляем gameId у строк групп
  var updatedCells = 0;
  if (commit) {
    for (var g = 0; g < groupsArr.length; g++) {
      var gg2 = groupsArr[g];
      for (var rr = 0; rr < gg2.rows.length; rr++) {
        resultsSheet.getRange(gg2.rows[rr], CONFIG.DB_COL.GAME_ID + 1).setValue(gg2.newGameId);
        updatedCells++;
      }
    }
    if (updatedCells > 0) {
      calculateLeaderboard();
      invalidateAnalyticsCache();
    }
  }

  return {
    success: true,
    commit: !!commit,
    brokenRows: brokenRows,
    groups: groupsArr,
    unmatched: unmatched,
    updatedCells: updatedCells
  };
}

/**
 * Парсинг timestamp сырой строки формы -> мс или "" если не парсится.
 */
function parseRawTimestamp(v) {
  if (!v) return "";
  try {
    var d = new Date(v);
    return isNaN(d.getTime()) ? "" : String(d.getTime());
  } catch (e) {
    return "";
  }
}

/**
 * Детерминированный gameId для ремонта битых строк.
 * С парсящимся timestamp — legacy-формат (сохраняет идемпотентность бэкфилла),
 * иначе H_<лист>_<дата>_r<строка> (без '/' и 'no_ts', уникален по строке сырого листа).
 */
function buildRepairedGameId(sheetKey, dateStr, ts, dataIdx) {
  return ts ? ("H_" + sheetKey + "_" + dateStr + "_" + ts + "_r" + dataIdx)
            : ("H_" + sheetKey + "_" + dateStr + "_r" + dataIdx);
}

/**
 * Обёртка: ремонт битых gameId, только отчёт.
 */
function repairBrokenPreview() {
  return repairBrokenGameIds(false);
}

/**
 * Обёртка: ремонт битых gameId с применением.
 */
function repairBrokenCommit() {
  var res = repairBrokenGameIds(true);
  var lines = [];
  for (var i = 0; i < res.groups.length; i++) {
    lines.push(res.groups[i].sheetKey + " row" + res.groups[i].sheetRow + " (" + res.groups[i].date + ") -> " + res.groups[i].newGameId + " | dbRows: " + res.groups[i].rows.join(","));
  }
  var msg = "Ремонт битых gameId.\n\nГрупп игр: " + res.groups.length +
    "\nСтрок обновлено: " + res.updatedCells +
    "\nБез источника (не тронуто): " + res.unmatched.length +
    "\n\n" + lines.slice(0, 30).join("\n");
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    Logger.log(msg);
  }
  return res;
}

/**
 * Заполнить пропущенные места в сырых листах (Data/MTT/Mystery) и синхронизировать
 * DB_Results через reconcileRawToDb(true).
 *
 * Сценарий: в игре не указано место ("Not participating" или пусто), а позже выяснилось,
 * кто его занял. Заполняем ячейку в сыром листе (источник правды) и дописываем
 * строку в DB_Results — так лидерборд и аудит остаются консистентными.
 *
 * @param {string} dateStr        Дата "ГГГГ-ММ-ДД"
 * @param {string} dealerName     Дилер (по колонке 2 сырых листов)
 * @param {string} eventName      Событие, например "1 место"
 * @param {string} playerRealName Игрок (реальное имя)
 * @param {boolean} commit        true — писать; false — только отчёт
 * @returns {Object} отчёт { changed:[...], synced: результат reconcileRawToDb }
 */
function fillMissingPlace(dateStr, dealerName, eventName, playerRealName, commit) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var report = {
    date: dateStr, dealer: dealerName, event: eventName, player: playerRealName,
    commit: !!commit, changed: []
  };
  if (!dateStr || !dealerName || !eventName || !playerRealName) {
    report.error = "Не указаны дата/дилер/событие/игрок";
    return report;
  }

  var lowDealer = String(dealerName).toLowerCase().trim();

  for (var sheetKey in CONFIG.FORMATS) {
    var cfg = CONFIG.FORMATS[sheetKey];
    var placeIdx = -1;
    for (var pi = 0; pi < cfg.places.length; pi++) {
      if (cfg.places[pi].name === eventName) { placeIdx = pi; break; }
    }
    if (placeIdx < 0) continue; // события (например "Нокаут") не заполняем

    var col = cfg.startCol + placeIdx; // 0-based индекс колонки в сырой строке
    var rawSheet = ss.getSheetByName(sheetKey);
    if (!rawSheet) continue;
    var data = rawSheet.getDataRange().getValues();
    if (data.length <= 1) continue;

    for (var i = 1; i < data.length; i++) {
      if (normalizeDate(data[i][1]) !== dateStr) continue;
      var rowDealer = data[i][2] ? String(data[i][2]).trim().toLowerCase() : "";
      if (rowDealer !== lowDealer) continue;

      var cellVal = data[i][col] ? String(data[i][col]).trim() : "";
      if (cellVal === "" || !isParticipating(cellVal)) {
        report.changed.push({ sheet: sheetKey, row: i + 1, oldValue: cellVal || "(пусто)" });
        if (commit) {
          rawSheet.getRange(i + 1, col + 1).setValue(playerRealName);
        }
      }
    }
  }

  if (commit && report.changed.length) {
    report.synced = reconcileRawToDb(true);
  } else if (commit) {
    report.synced = { note: "Нет ячеек для заполнения" };
  }

  return report;
}
