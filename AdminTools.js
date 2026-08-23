// ==========================================
// ИНСТРУМЕНТЫ АДМИНИСТРАТОРА: УПРАВЛЕНИЕ ИГРАМИ
// ==========================================
// HTML-диалог (GameManager.html) для удобного просмотра, правки и удаления игр
// в DB_Results. Всё, что меняет данные, синхронизируется с сырыми листами форм
// (best-effort), чтобы последующая сверка не «возвращала» удалённое.

/**
 * Открыть боковую панель управления играми.
 */
function openGameManager() {
  var html = HtmlService.createHtmlOutputFromFile('GameManager')
    .setTitle('🎛️ Управление играми')
    .setWidth(760)
    .setHeight(640);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Список форматов для редактора (места + нокауты) из CONFIG.
 */
function adminGetFormats() {
  var out = [];
  for (var key in CONFIG.FORMATS) {
    var c = CONFIG.FORMATS[key];
    out.push({
      key: key,
      formatName: c.formatName,
      places: c.places.map(function (p) { return { name: p.name, pts: p.pts }; }),
      koCount: c.koStartCol !== null ? (c.koCount || 0) : 0
    });
  }
  return out;
}

/**
 * Список игр из DB_Results.
 * @param {Object} opts { date, dealer, q, limit } — фильтры (все необязательные).
 *   Без date показываем последние RECENT_DAYS дней.
 * @returns {Array} [{ gameId, date, format, dealer, rows:[{event,player,points}] }]
 */
function adminListGames(opts) {
  var RECENT_DAYS = 30;
  opts = opts || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var resultsSheet = ss.getSheetByName(CONFIG.SHEETS.RESULTS);
  if (!resultsSheet) return { error: "Нет листа DB_Results" };

  var cutoff = "";
  if (!opts.date) {
    var d = new Date();
    d.setDate(d.getDate() - RECENT_DAYS);
    cutoff = Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }

  var data = resultsSheet.getDataRange().getValues();
  var byGame = {};
  var order = [];

  for (var r = 1; r < data.length; r++) {
    var gid = data[r][CONFIG.DB_COL.GAME_ID] ? String(data[r][CONFIG.DB_COL.GAME_ID]).trim() : "";
    if (!gid) continue;
    var dateStr = normalizeDate(data[r][CONFIG.DB_COL.DATE]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
    if (opts.date && dateStr !== opts.date) continue;
    if (cutoff && dateStr < cutoff) continue;

    var dealer = data[r][CONFIG.DB_COL.DEALER] ? String(data[r][CONFIG.DB_COL.DEALER]).trim() : "";
    if (opts.dealer && dealer.toLowerCase().indexOf(String(opts.dealer).toLowerCase()) < 0) continue;

    if (!byGame[gid]) {
      byGame[gid] = {
        gameId: gid,
        date: dateStr,
        format: data[r][CONFIG.DB_COL.FORMAT] ? String(data[r][CONFIG.DB_COL.FORMAT]).trim() : "",
        dealer: dealer,
        rows: []
      };
      order.push(gid);
    }
    byGame[gid].rows.push({
      event: data[r][CONFIG.DB_COL.EVENT] ? String(data[r][CONFIG.DB_COL.EVENT]).trim() : "",
      player: data[r][CONFIG.DB_COL.PLAYER] ? String(data[r][CONFIG.DB_COL.PLAYER]).trim() : "",
      points: Number(data[r][CONFIG.DB_COL.POINTS]) || 0
    });
  }

  var games = order.map(function (g) { return byGame[g]; });

  // Сортируем строки игры по порядку мест (1,2,3..., нокауты — в конец)
  var EVENT_ORDER = { "1 место": 1, "2 место": 2, "3 место": 3, "4 место": 4, "5 место": 5, "Нокаут": 9 };
  for (var gi = 0; gi < games.length; gi++) {
    games[gi].rows.sort(function (a, b) {
      return (EVENT_ORDER[a.event] || 99) - (EVENT_ORDER[b.event] || 99);
    });
  }

  if (opts.q) {
    var q = String(opts.q).toLowerCase();
    games = games.filter(function (g) {
      return g.rows.some(function (row) { return row.player.toLowerCase().indexOf(q) >= 0; });
    });
  }

  games.sort(function (a, b) {
    return b.date.localeCompare(a.date) || a.gameId.localeCompare(b.gameId);
  });

  if (opts.limit && games.length > opts.limit) games = games.slice(0, opts.limit);
  return games;
}

/**
 * Сохранить игру: перезаписать строки DB_Results для gameId и (best-effort)
 * обновить соответствующую строку в сыром листе формы.
 *
 * @param {string} gameId      gameId существующей игры или ""/null для новой
 * @param {string} dateStr     Дата "ГГГГ-ММ-ДД"
 * @param {string} dealer      Дилер
 * @param {Object} playersObj  { "1 место": "Имя", ..., "ko": ["a","b"] }
 * @param {string} formatName  Формат ("SnG"/"MTT"/"Mystery Bounty"); для новой игры обязателен
 * @returns {Object} { success, gameId, rows, rawUpdated, error? }
 */
function adminSaveGame(gameId, dateStr, dealer, playersObj, formatName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var resultsSheet = ss.getSheetByName(CONFIG.SHEETS.RESULTS);
  if (!resultsSheet) return { success: false, error: "Нет листа DB_Results" };

  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) return { success: false, error: "Некорректная дата: " + dateStr };
  if (!dealer || !String(dealer).trim()) return { success: false, error: "Не указан дилер" };

  gameId = gameId ? String(gameId).trim() : ("M_" + new Date().getTime());
  playersObj = playersObj || {};

  // Определяем формат (существующий по БД, либо заданный для новой игры)
  var formatName2 = formatName ? String(formatName) : "";
  var data = resultsSheet.getDataRange().getValues();
  if (!formatName2) {
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][CONFIG.DB_COL.GAME_ID] || "").trim() === gameId) {
        formatName2 = String(data[r][CONFIG.DB_COL.FORMAT] || "").trim();
        break;
      }
    }
  }
  if (!formatName2) return { success: false, error: "Не определён формат игры" };

  var fmtKey = null;
  for (var k in CONFIG.FORMATS) {
    if (CONFIG.FORMATS[k].formatName === formatName2) { fmtKey = k; break; }
  }
  var cfg = fmtKey ? CONFIG.FORMATS[fmtKey] : null;
  if (!cfg) return { success: false, error: "Неизвестный формат: " + formatName2 };

  // Собираем новые строки (очки/ITM — из правил CONFIG)
  var rows = [];
  for (var pi = 0; pi < cfg.places.length; pi++) {
    var ev = cfg.places[pi].name;
    var pRaw = playersObj[ev];
    var pName = cleanPlayerName(pRaw);
    if (pName && isParticipating(pName)) {
      rows.push([gameId, dateStr, formatName2, String(dealer).trim(), pName, ev, cfg.places[pi].pts, cfg.places[pi].isItm]);
    }
  }
  if (cfg.koStartCol !== null && Array.isArray(playersObj.ko)) {
    for (var ki = 0; ki < cfg.koCount; ki++) {
      var kRaw = playersObj.ko[ki];
      var kName = cleanPlayerName(kRaw);
      if (kName && isParticipating(kName)) {
        rows.push([gameId, dateStr, formatName2, String(dealer).trim(), kName, "Нокаут", cfg.koPts, cfg.koColIsItm]);
      }
    }
  }

  // Удаляем старые строки игры (снизу вверх) и пишем новые
  for (var r2 = data.length - 1; r2 >= 1; r2--) {
    if (String(data[r2][CONFIG.DB_COL.GAME_ID] || "").trim() === gameId) {
      resultsSheet.deleteRow(r2 + 1);
    }
  }
  if (rows.length) {
    resultsSheet.getRange(resultsSheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }

  // Best-effort синхронизация сырого листа формы
  var rawUpdated = false;
  var rawInfo = findRawRowForGameId(gameId);
  if (rawInfo && cfg) {
    try {
      applyGameToRawRow(rawInfo, cfg, String(dealer).trim(), dateStr, playersObj);
      rawUpdated = true;
    } catch (e) {
      rawUpdated = false;
    }
  }

  calculateLeaderboard();
  invalidateAnalyticsCache();
  return { success: true, gameId: gameId, rows: rows.length, rawUpdated: rawUpdated };
}

/**
 * Удалить игру из DB_Results и (best-effort) очистить участников в сыром листе.
 */
function adminDeleteGame(gameId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var resultsSheet = ss.getSheetByName(CONFIG.SHEETS.RESULTS);
  if (!resultsSheet || !gameId) return { success: false, error: "Нет данных" };

  gameId = String(gameId).trim();
  var data = resultsSheet.getDataRange().getValues();
  var deleted = 0;
  for (var r = data.length - 1; r >= 1; r--) {
    if (String(data[r][CONFIG.DB_COL.GAME_ID] || "").trim() === gameId) {
      resultsSheet.deleteRow(r + 1);
      deleted++;
    }
  }

  // Очищаем участников в сырой строке, чтобы сверка/бэкфилл не вернули игру
  var rawUpdated = false;
  var rawInfo = findRawRowForGameId(gameId);
  if (rawInfo) {
    try {
      clearRawRowPlayers(rawInfo);
      rawUpdated = true;
    } catch (e) {}
  }

  if (deleted > 0) {
    calculateLeaderboard();
    invalidateAnalyticsCache();
  }
  return { success: true, deleted: deleted, rawUpdated: rawUpdated };
}

/**
 * Найти сырую строку формы по gameId.
 * Поддерживает ключи: H_<лист>_<дата>_<ts>[_r<idx>] и G_<мс> (по близости timestamp).
 * @returns {Object|null} { sheet, index, row } или null
 */
function findRawRowForGameId(gameId) {
  var gid = String(gameId || "");
  if (!gid) return null;
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var m = gid.match(/^H_([A-Za-z]+)_(\d{4}-\d{2}-\d{2})_(\d+)(?:_r(\d+))?$/);
  if (m) {
    var sheetKey = m[1];
    var dateStr = m[2];
    var ts = m[3];
    var idx = m[4] ? Number(m[4]) : null;
    var rawSheet = ss.getSheetByName(sheetKey);
    if (!rawSheet) return null;
    var data = rawSheet.getDataRange().getValues();
    if (idx !== null) {
      if (idx >= 0 && idx < data.length && normalizeDate(data[idx][1]) === dateStr) {
        return { sheet: sheetKey, index: idx, row: data[idx] };
      }
      return null;
    }
    for (var i = 1; i < data.length; i++) {
      var t = null;
      if (data[i][0]) {
        var pd = new Date(data[i][0]);
        if (!isNaN(pd.getTime())) t = String(pd.getTime());
      }
      if (t === ts && normalizeDate(data[i][1]) === dateStr) {
        return { sheet: sheetKey, index: i, row: data[i] };
      }
    }
    return null;
  }

  var gm = gid.match(/^G_(\d+)$/);
  if (gm) {
    var ms = Number(gm[1]);
    for (var sk in CONFIG.FORMATS) {
      var sh = ss.getSheetByName(sk);
      if (!sh) continue;
      var d2 = sh.getDataRange().getValues();
      for (var j = 1; j < d2.length; j++) {
        if (d2[j][0]) {
          var pd2 = new Date(d2[j][0]);
          if (!isNaN(pd2.getTime()) && Math.abs(pd2.getTime() - ms) <= 60000) {
            return { sheet: sk, index: j, row: d2[j] };
          }
        }
      }
    }
  }
  return null;
}

/**
 * Записать состав игры в сырую строку формы (колонки даты/дилера/мест).
 */
function applyGameToRawRow(rawInfo, cfg, dealer, dateStr, playersObj) {
  var rawSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(rawInfo.sheet);
  var rowNum = rawInfo.index + 1;

  rawSheet.getRange(rowNum, 2).setValue(new Date(dateStr));
  rawSheet.getRange(rowNum, 3).setValue(dealer);

  for (var pi = 0; pi < cfg.places.length; pi++) {
    var ev = cfg.places[pi].name;
    var val = playersObj[ev] ? cleanPlayerName(playersObj[ev]) : "";
    rawSheet.getRange(rowNum, cfg.startCol + pi + 1).setValue(val && isParticipating(val) ? val : "Not participating");
  }

  if (cfg.koStartCol !== null && Array.isArray(playersObj.ko)) {
    for (var ki = 0; ki < cfg.koCount; ki++) {
      var kVal = playersObj.ko[ki] ? cleanPlayerName(playersObj.ko[ki]) : "";
      rawSheet.getRange(rowNum, cfg.koStartCol + ki + 1).setValue(kVal && isParticipating(kVal) ? kVal : "Not participating");
    }
  }
}

/**
 * Очистить участников в сырой строке (все места -> "Not participating").
 */
function clearRawRowPlayers(rawInfo) {
  var rawSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(rawInfo.sheet);
  var rowNum = rawInfo.index + 1;
  var cfg = CONFIG.FORMATS[rawInfo.sheet];
  if (!cfg) return;
  for (var pi = 0; pi < cfg.places.length; pi++) {
    rawSheet.getRange(rowNum, cfg.startCol + pi + 1).setValue("Not participating");
  }
  if (cfg.koStartCol !== null) {
    for (var ki = 0; ki < cfg.koCount; ki++) {
      rawSheet.getRange(rowNum, cfg.koStartCol + ki + 1).setValue("Not participating");
    }
  }
}
