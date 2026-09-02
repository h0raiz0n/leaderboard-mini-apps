// ==========================================
// АНАЛИТИКА И API ДЛЯ TELEGRAM MINI APP
// ==========================================
// Слой агрегации данных за всё время + JSON-эндпоинт (doGet)
// для Telegram Mini App, зала славы и статистики.

/**
 * Собрать полную агрегацию по всем игрокам за всё время.
 * Результат кэшируется (CacheService) на CONFIG.ANALYTICS_CACHE_TTL секунд,
 * чтобы частые запросы Mini App не пересчитывали всё заново.
 * При добавлении данных (игра/бэкфилл) кэш сбрасывается через invalidateAnalyticsCache().
 * @returns {Array} массив объектов с полной статистикой по каждому игроку
 */
var ALL_TIME_STATS_CACHE_KEY = "ALL_TIME_STATS_V5";
var CHUNK_SIZE = 90000; // 90 KB на чанк (укладывается в лимит 100 KB CacheService)

/**
 * Запись в кэш с автоматическим динамическим разбиением на чанки.
 * Позволяет кэшировать JSON любого размера (300KB, 1MB, 5MB).
 */
function putChunkedCache(prefix, dataObj, ttlSec) {
  var cache = CacheService.getScriptCache();
  var str = JSON.stringify(dataObj);
  var totalLen = str.length;
  var numChunks = Math.ceil(totalLen / CHUNK_SIZE);
  ttlSec = ttlSec || 900;

  removeChunkedCache(prefix);

  var entries = {};
  var metaKey = prefix + "__meta";
  entries[metaKey] = JSON.stringify({ count: numChunks, len: totalLen, ts: Date.now() });

  for (var i = 0; i < numChunks; i++) {
    var chunkKey = prefix + "__c" + i;
    entries[chunkKey] = str.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
  }

  try {
    cache.putAll(entries, ttlSec);
  } catch (e) {
    Logger.log("Failed to put chunked cache for " + prefix + ": " + e.message);
  }
}

/**
 * Чтение из кэша с автоматической сборкой динамических чанков.
 */
function getChunkedCache(prefix) {
  var cache = CacheService.getScriptCache();
  try {
    var metaRaw = cache.get(prefix + "__meta");
    if (!metaRaw) return null;
    var meta = JSON.parse(metaRaw);
    if (!meta || !meta.count) return null;

    var keys = [];
    for (var i = 0; i < meta.count; i++) {
      keys.push(prefix + "__c" + i);
    }
    var chunkMap = cache.getAll(keys);
    var parts = [];
    for (var j = 0; j < meta.count; j++) {
      var k = prefix + "__c" + j;
      if (chunkMap[k] === undefined || chunkMap[k] === null) {
        return null; // неполный или вытесненный кэш
      }
      parts.push(chunkMap[k]);
    }
    return JSON.parse(parts.join(""));
  } catch (e) {
    return null;
  }
}

/**
 * Очистка всех динамических чанков по префиксу.
 */
function removeChunkedCache(prefix) {
  var cache = CacheService.getScriptCache();
  try {
    var metaRaw = cache.get(prefix + "__meta");
    var keysToRemove = [prefix, prefix + "__meta"];
    if (metaRaw) {
      var meta = JSON.parse(metaRaw);
      if (meta && meta.count) {
        for (var i = 0; i < meta.count; i++) {
          keysToRemove.push(prefix + "__c" + i);
        }
      }
    }
    for (var k = 0; k < 20; k++) {
      keysToRemove.push(prefix + "__c" + k);
    }
    cache.removeAll(keysToRemove);
  } catch (e) {}
}

// TTL кэшей API. Данные меняются ТОЛЬКО при записи (игра/бэкфилл/сверка/правка),
// а каждая запись сбрасывает и прогревает кэши (см. invalidateAnalyticsCache).
var CACHE_TTL = {
  current: 900,   // месячный лидерборд
  hof: 900,       // история всех игр
  dealers: 900,   // дилеры
  mttpodium: 900, // MTT-подиум (карточка игрока)
  player: 120     // карточка игрока
};

function computeAllTimeStats() {
  return cachedJson(ALL_TIME_STATS_CACHE_KEY, CONFIG.ANALYTICS_CACHE_TTL || 900, function() {
    return computeAllTimeStatsRaw();
  });
}

/**
 * Прогрев всех кэшей аналитики (all-time, месячный, зал славы, дилеры, MTT-подиум).
 */
function warmAllCaches() {
  computeAllTimeStats();
  cachedJson("DGET_current", CACHE_TTL.current, function() { return computeLeaderboardRows('month'); });
  cachedJson("DGET_all_slim", CACHE_TTL.current, function() { return slimAllStats(computeAllTimeStats()); });
  cachedJson("DGET_halloffame", CACHE_TTL.hof, function() { return computeHallOfFame(); });
  cachedJson("DGET_dealers_cur", CACHE_TTL.dealers, function() { return computeDealersHeatmap(""); });
  cachedJson("DGET_mttpodium", CACHE_TTL.mttpodium, function() { return computeMttPodiumStats(); });
}

/**
 * Сброс кэша аналитики + ПРОГРЕВ ПРИ ЗАПИСИ.
 */
function invalidateAnalyticsCache() {
  try {
    removeChunkedCache(ALL_TIME_STATS_CACHE_KEY);
    removeChunkedCache("DGET_current");
    removeChunkedCache("DGET_all_slim");
    removeChunkedCache("DGET_halloffame");
    removeChunkedCache("DGET_dealers_cur");
    removeChunkedCache("DGET_mttpodium");
  } catch (e) {}

  try {
    warmAllCaches();
    try { PropertiesService.getScriptProperties().deleteProperty("CACHE_DIRTY"); } catch (e) {}
  } catch (e) {
    try { PropertiesService.getScriptProperties().setProperty("CACHE_DIRTY", "1"); } catch (e2) {}
  }
}

/**
 * Фоновый прогрев кэшей по расписанию (страховка).
 */
function warmCachesIfDirty() {
  var props = PropertiesService.getScriptProperties();
  var dirty = props.getProperty("CACHE_DIRTY") === "1";
  var out = { skipped: !dirty };
  if (dirty) {
    props.deleteProperty("CACHE_DIRTY");
    try {
      warmAllCaches();
      out.warmed = true;
    } catch (e) {
      out.warmed = false;
      out.error = e.message;
      try { props.setProperty("CACHE_DIRTY", "1"); } catch (e2) {}
    }
  }
  try {
    calculateLeaderboard();
    out.sheetSynced = true;
  } catch (e) {
    out.sheetSynced = false;
    out.sheetError = e.message;
  }
  return out;
}

/**
 * Кэшированный вызов для JSON-эндпоинта через DynamicChunkedCache.
 */
function cachedJson(key, ttlSec, fn) {
  var hit = getChunkedCache(key);
  if (hit !== null && hit !== undefined) return hit;

  var data = fn();
  if (data !== null && data !== undefined) {
    putChunkedCache(key, data, ttlSec);
  }
  return data;
}

/**
 * Список установленных триггеров проекта (диагностика через ?type=triggers).
 */
function listTriggers() {
  var out = [];
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      var t = triggers[i];
      out.push({
        handler: t.getHandlerFunction(),
        event: t.getEventType().toString(),
        source: t.getTriggerSource().toString(),
        sourceId: t.getTriggerSourceId() || ""
      });
    }
  } catch (e) {
    return { error: e.message };
  }
  return out;
}

/**
 * ДИАГНОСТИКА: срезы данных за дату из DB_Results, BackfillLog и сырых листов.
 * Используется для расследования расхождений (например, «записали только одно
 * из трёх первых мест»). Только чтение, ничего не изменяет.
 */
function debugRowsForDate(dateStr, playerFilter) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = { date: dateStr, playerFilter: playerFilter || "" };
  var pf = playerFilter ? String(playerFilter).toLowerCase() : "";

  try {
    var resultsSheet = ss.getSheetByName(CONFIG.SHEETS.RESULTS);
    var results = [];
    if (resultsSheet) {
      var rData = resultsSheet.getDataRange().getValues();
      for (var r = 1; r < rData.length; r++) {
        var pv = rData[r][CONFIG.DB_COL.PLAYER] ? String(rData[r][CONFIG.DB_COL.PLAYER]).trim() : "";
        if ((!dateStr || normalizeDate(rData[r][CONFIG.DB_COL.DATE]) === dateStr) &&
            (!pf || pv.toLowerCase().indexOf(pf) >= 0)) {
          results.push({
            gameId: rData[r][CONFIG.DB_COL.GAME_ID],
            date: normalizeDate(rData[r][CONFIG.DB_COL.DATE]),
            format: rData[r][CONFIG.DB_COL.FORMAT],
            dealer: rData[r][CONFIG.DB_COL.DEALER],
            player: pv,
            event: rData[r][CONFIG.DB_COL.EVENT],
            points: rData[r][CONFIG.DB_COL.POINTS],
            isItm: rData[r][CONFIG.DB_COL.IS_ITM]
          });
        }
      }
    }
    out.resultsCount = results.length;
    out.results = results;
  } catch (e) { out.resultsError = e.message; }

  try {
    var logSheet = ss.getSheetByName(CONFIG.SHEETS.BACKFILL_LOG);
    var backfill = [];
    if (logSheet) {
      var lData = logSheet.getDataRange().getValues();
      for (var l = 1; l < lData.length; l++) {
        if (!dateStr || normalizeDate(lData[l][2]) === dateStr) {
          var lineupStr = lData[l][6] ? String(lData[l][6]) : "";
          if (!pf || lineupStr.toLowerCase().indexOf(pf) >= 0) {
            backfill.push({
              gameId: lData[l][0], sheet: lData[l][1], date: normalizeDate(lData[l][2]),
              dealer: lData[l][3], format: lData[l][4], result: lData[l][5], lineup: lineupStr
            });
          }
        }
      }
    }
    out.backfillCount = backfill.length;
    out.backfill = backfill;
  } catch (e) { out.backfillError = e.message; }

  try {
    var raw = {};
    for (var key in CONFIG.FORMATS) {
      var sh = ss.getSheetByName(key);
      var rows = [];
      if (sh) {
        var d = sh.getDataRange().getValues();
        for (var i = 1; i < d.length; i++) {
          if (!dateStr || normalizeDate(d[i][1]) === dateStr) {
            rows.push({ row: i + 1, dealer: d[i][2] ? String(d[i][2]).trim() : "", values: d[i] });
          }
        }
      }
      raw[key] = rows;
    }
    out.raw = raw;
  } catch (e) { out.rawError = e.message; }

  return out;
}

/**
 * Облегчённая версия строк месячного лидерборда для списка:
 * [позиция, тренд, имя, очки, ранг]. Полные 9 колонок нужны только
 * карточке игрока (там они берутся из отдельного кэша DGET_current).
 */
function slimCurrentRows(rows) {
  if (!rows) return rows;
  return rows.map(function (r) {
    return [r[0], r[1], r[2], r[3], r[4]];
  });
}

/**
 * Облегчённая версия статистики «за всё время» для списка:
 * только поля, которые нужны таблице. Полный объект (места, даты побед,
 * форматы) используется карточкой игрока — она тянется отдельно.
 */
function slimAllStats(list) {
  if (!list) return list;
  return list.map(function (p) {
    return {
      player: p.player,
      position: p.position,
      totalPoints: p.totalPoints,
      games: p.games,
      itm: p.itm
    };
  });
}

/**
 * Собственно тяжёлая агрегация (без кэша).
 */
function computeAllTimeStatsRaw() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var playersSheet = ss.getSheetByName(CONFIG.SHEETS.PLAYERS);
  var resultsSheet = ss.getSheetByName(CONFIG.SHEETS.RESULTS);
  if (!playersSheet || !resultsSheet) return [];

  // Ники
  var playersData = playersSheet.getDataRange().getValues();
  var nickMap = {};
  for (var i = 1; i < playersData.length; i++) {
    var rn = playersData[i][0] ? playersData[i][0].toString().trim() : "";
    var cn = playersData[i][1] ? playersData[i][1].toString().trim() : "";
    if (rn) nickMap[rn] = cn !== "" ? cn : rn;
  }

  var results = resultsSheet.getDataRange().getValues();
  var agg = {};

  function init(name) {
    if (!agg[name]) {
      agg[name] = {
        player: nickMap[name] || name,
        realName: name,
        games: 0,            // число игр (уникальных gameId) с участием
        place1: 0, place2: 0, place3: 0, place4: 0, place5: 0,
        itm: 0, knockouts: 0,
        koPoints: 0, gamePoints: 0, mttPlacePoints: 0,
        pointsByFormat: {}, // очки за места по форматам (SnG/MTT/Mystery Bounty)
        totalPoints: 0,
        formats: {},
        winsByFormat: {},
        firstWinDate: null,
        lastWinDate: null
      };
    }
  }

  var seenGames = {};

  for (var r = 1; r < results.length; r++) {
    var player = results[r][CONFIG.DB_COL.PLAYER] ? results[r][CONFIG.DB_COL.PLAYER].toString().trim() : "";
    if (!player || !isParticipating(player)) continue;

    var format = results[r][CONFIG.DB_COL.FORMAT] ? results[r][CONFIG.DB_COL.FORMAT].toString().trim() : "SnG";
    var event = results[r][CONFIG.DB_COL.EVENT];
    var points = Number(results[r][CONFIG.DB_COL.POINTS]) || 0;
    var gameId = results[r][CONFIG.DB_COL.GAME_ID];

    init(player);
    var a = agg[player];

    // точки
    if (event === "Нокаут") { a.koPoints += points; a.knockouts++; }
    else {
      a.gamePoints += points;
      a.pointsByFormat[format] = (a.pointsByFormat[format] || 0) + points;
      if (format === "MTT") a.mttPlacePoints += points;
    }

    if (event === "1 место")      { a.place1++; }
    else if (event === "2 место") { a.place2++; }
    else if (event === "3 место") { a.place3++; }
    else if (event === "4 место") { a.place4++; }
    else if (event === "5 место") { a.place5++; }

    // ITM считаем по флагу IS_ITM в DB_Results (единый источник),
    // а не по имени события — так правила очков можно менять в Config.
    if (String(results[r][CONFIG.DB_COL.IS_ITM]) === "ДА") a.itm++;

    if (event === "1 место") {
      a.winsByFormat[format] = (a.winsByFormat[format] || 0) + 1;
      var wDate = normalizeDate(results[r][CONFIG.DB_COL.DATE]);
      if (!a.firstWinDate || wDate < a.firstWinDate) a.firstWinDate = wDate;
      if (!a.lastWinDate || wDate > a.lastWinDate) a.lastWinDate = wDate;
    }

    // форматы
    if (event !== "Нокаут") a.formats[format] = (a.formats[format] || 0) + 1;

    // уникальные игры (gameId)
    var gkey = gameId;
    if (gkey) {
      if (!seenGames[gkey]) seenGames[gkey] = new Set();
      seenGames[gkey].add(player);
    }
  }

  // считаем уникальные игры на игрока и итог очков
  var playerGames = {};
  for (var gid in seenGames) {
    seenGames[gid].forEach(function(player) {
      playerGames[player] = (playerGames[player] || 0) + 1;
    });
  }

  var out = [];
  for (var name in agg) {
    var a = agg[name];
    a.games = playerGames[name] || 0;
    a.totalPoints = a.gamePoints + a.koPoints;
    out.push(a);
  }

  out.sort(function(x, y) { return y.totalPoints - x.totalPoints; });
  out.forEach(function(o, idx) { o.position = idx + 1; });
  return out;
}

/**
 * История всех игр и турниров (SnG, MTT, Mystery Bounty).
 * Призовые места (1-5) и нокауты.
 * @param {string} [onlyFormat] ограничить по формату (например "MTT"). Если не задан — все форматы.
 * @returns {Array} записи игр, новые сверху
 */
function computeHallOfFame(onlyFormat) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var playersSheet = ss.getSheetByName(CONFIG.SHEETS.PLAYERS);
  var resultsSheet = ss.getSheetByName(CONFIG.SHEETS.RESULTS);
  if (!resultsSheet) return [];

  var playersData = playersSheet ? playersSheet.getDataRange().getValues() : [];
  var nickMap = {};
  for (var i = 1; i < playersData.length; i++) {
    var rn = playersData[i][0] ? playersData[i][0].toString().trim() : "";
    var cn = playersData[i][1] ? playersData[i][1].toString().trim() : "";
    if (rn) nickMap[rn] = cn !== "" ? cn : rn;
  }

  var placeLabels = {
    "1 место": 1, "2 место": 2, "3 место": 3, "4 место": 4, "5 место": 5
  };

  var results = resultsSheet.getDataRange().getValues();
  var wins = [];

  for (var r = 1; r < results.length; r++) {
    var player = results[r][CONFIG.DB_COL.PLAYER] ? results[r][CONFIG.DB_COL.PLAYER].toString().trim() : "";
    var event = results[r][CONFIG.DB_COL.EVENT] ? results[r][CONFIG.DB_COL.EVENT].toString().trim() : "";
    var format = results[r][CONFIG.DB_COL.FORMAT] ? results[r][CONFIG.DB_COL.FORMAT].toString().trim() : "SnG";
    var dealer = results[r][CONFIG.DB_COL.DEALER];
    var gameId = results[r][CONFIG.DB_COL.GAME_ID];
    var place = placeLabels[event] || 0;

    if (!player || !event) continue;
    if (!isParticipating(player)) continue;
    if (onlyFormat && format !== onlyFormat) continue;

    wins.push({
      gameId: gameId ? String(gameId).trim() : "",
      date: normalizeDate(results[r][CONFIG.DB_COL.DATE]),
      player: nickMap[player] || player,
      format: format,
      event: event,
      place: place,
      dealer: dealer ? dealer.toString().trim() : "",
      points: Number(results[r][CONFIG.DB_COL.POINTS]) || 0
    });
  }

  // Сортировка: свежие сверху, по дате, затем по gameId, затем по местам (1..5, затем нокауты)
  wins.sort(function(a, b) {
    var byDate = (b.date || "").localeCompare(a.date || "");
    if (byDate !== 0) return byDate;
    var gidCmp = (b.gameId || "").localeCompare(a.gameId || "");
    if (gidCmp !== 0) return gidCmp;
    var pA = a.place || 99;
    var pB = b.place || 99;
    return pA - pB;
  });
  return wins;
}

/**
 * Тепловая карта дилеров за месяц (сезон). Группирует число игр по
 * (дилер → дата) и по (дилер → формат). Сезон = календарный месяц.
 * @param {string} [monthStr] месяц "ГГГГ-ММ"; по умолчанию текущий.
 * @returns {Object} с полями: dealers[], dates[], matrix, byMonth
 */
function computeDealersHeatmap(monthStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var resultsSheet = ss.getSheetByName(CONFIG.SHEETS.RESULTS);
  if (!resultsSheet) return { dealers: [], dates: [], matrix: [], byMonth: [] };

  // Определяем целевой месяц
  var year, month;
  if (monthStr && /^\d{4}-\d{1,2}$/.test(String(monthStr))) {
    var parts = String(monthStr).split("-");
    year = Number(parts[0]); month = Number(parts[1]) - 1;
  } else {
    var now = new Date();
    year = now.getFullYear(); month = now.getMonth();
  }

  var results = resultsSheet.getDataRange().getValues();

  // Соберём все уникальные даты и дилеров месяца
  var datesSet = {};     // "yyyy-MM-dd" -> true
  var dealersSet = {};   // дилер -> true
  var cellCount = {};    // "дилер|дата" -> число игр (уникальных gameId)
  var byMonth = {};      // "дилер" -> { games, dates:{дата:число}, formats:{} }

  var seenGameByDealerDate = {};

  for (var r = 1; r < results.length; r++) {
    var d = new Date(results[r][CONFIG.DB_COL.DATE]);
    if (isNaN(d.getTime())) continue;
    if (d.getMonth() !== month || d.getFullYear() !== year) continue;

    var dateStr = normalizeDate(d);
    var dealer = results[r][CONFIG.DB_COL.DEALER] ? String(results[r][CONFIG.DB_COL.DEALER]).trim() : "?";
    var format = results[r][CONFIG.DB_COL.FORMAT] ? String(results[r][CONFIG.DB_COL.FORMAT]).trim() : "SnG";
    var gameId = results[r][CONFIG.DB_COL.GAME_ID];

    datesSet[dateStr] = true;
    dealersSet[dealer] = true;

    // Считаем уникальные игры (gameId) дилера за дату
    var gKey = dealer + "|" + dateStr + "|" + gameId;
    if (!seenGameByDealerDate[gKey]) {
      seenGameByDealerDate[gKey] = true;
      cellCount[dealer + "|" + dateStr] = (cellCount[dealer + "|" + dateStr] || 0) + 1;

      if (!byMonth[dealer]) byMonth[dealer] = { games: 0, dates: {}, formats: {} };
      byMonth[dealer].games++;
      byMonth[dealer].dates[dateStr] = (byMonth[dealer].dates[dateStr] || 0) + 1;
      byMonth[dealer].formats[format] = (byMonth[dealer].formats[format] || 0) + 1;
    }
  }

  var dates = Object.keys(datesSet).sort();
  var dealers = Object.keys(dealersSet).sort();

  // Матрица dealer x date
  var matrix = dealers.map(function(dlr) {
    return dates.map(function(dt) {
      return cellCount[dlr + "|" + dt] || 0;
    });
  });

  var byMonthArr = dealers.map(function(dlr) {
    var b = byMonth[dlr] || { games: 0, dates: {}, formats: {} };
    return { dealer: dlr, games: b.games, dates: b.dates, formats: b.formats };
  });

  return { dealers: dealers, dates: dates, matrix: matrix, byMonth: byMonthArr, month: (year + "-" + String(month + 1).padStart(2, "0")) };
}

/**
 * Призовые места (1-5) по MTT для каждого игрока (для процентиля и карточки).
 * @returns {Object} { byPlayer: { имя: { podiumCount, places: {...} } }, total }
 */
function computeMttPodiumStats() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var resultsSheet = ss.getSheetByName(CONFIG.SHEETS.RESULTS);
  var byPlayer = {};
  var total = 0;
  if (!resultsSheet) return { byPlayer: byPlayer, total: 0 };

  var results = resultsSheet.getDataRange().getValues();
  var placeLabels = { "1 место": 1, "2 место": 2, "3 место": 3, "4 место": 4, "5 место": 5 };

  for (var r = 1; r < results.length; r++) {
    var format = results[r][CONFIG.DB_COL.FORMAT] ? String(results[r][CONFIG.DB_COL.FORMAT]).trim() : "SnG";
    if (format !== "MTT") continue;
    var player = results[r][CONFIG.DB_COL.PLAYER] ? String(results[r][CONFIG.DB_COL.PLAYER]).trim() : "";
    var event = results[r][CONFIG.DB_COL.EVENT];
    var place = placeLabels[event];
    if (!player || !place) continue;
    if (!isParticipating(player)) continue;

    if (!byPlayer[player]) byPlayer[player] = { podiumCount: 0, places: {} };
    byPlayer[player].podiumCount++;
    byPlayer[player].places[place] = (byPlayer[player].places[place] || 0) + 1;
    total++;
  }
  return { byPlayer: byPlayer, total: total };
}

/**
 * Вернуть отображаемое имя (ник) по реальному имени из PlayersDB.
 * @param {string} realName реальное имя игрока.
 * @returns {string} ник (или имя, если ник не задан)
 */
function nickNameOf(realName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var playersSheet = ss.getSheetByName(CONFIG.SHEETS.PLAYERS);
  if (!playersSheet) return realName;
  var data = playersSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var rn = data[i][0] ? String(data[i][0]).trim() : "";
    var cn = data[i][1] ? String(data[i][1]).trim() : "";
    if (rn === realName) return cn !== "" ? cn : rn;
  }
  return realName;
}

/**
 * Полная история игр игрока (свежие сверху).
 * @param {string} realName реальное имя игрока.
 * @returns {Array} массив {gameId, date, format, event, points, isItm, dealer}
 */
function computePlayerGamesHistory(realName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var resultsSheet = ss.getSheetByName(CONFIG.SHEETS.RESULTS);
  if (!resultsSheet || !realName) return [];

  var results = resultsSheet.getDataRange().getValues();
  var games = [];
  for (var r = 1; r < results.length; r++) {
    var player = results[r][CONFIG.DB_COL.PLAYER] ? String(results[r][CONFIG.DB_COL.PLAYER]).trim() : "";
    if (player !== realName) continue;
    games.push({
      gameId: results[r][CONFIG.DB_COL.GAME_ID],
      date: normalizeDate(results[r][CONFIG.DB_COL.DATE]),
      format: results[r][CONFIG.DB_COL.FORMAT] ? String(results[r][CONFIG.DB_COL.FORMAT]).trim() : "SnG",
      event: results[r][CONFIG.DB_COL.EVENT] ? String(results[r][CONFIG.DB_COL.EVENT]).trim() : "",
      points: Number(results[r][CONFIG.DB_COL.POINTS]) || 0,
      isItm: results[r][CONFIG.DB_COL.IS_ITM] ? String(results[r][CONFIG.DB_COL.IS_ITM]).trim() : "НЕТ",
      dealer: results[r][CONFIG.DB_COL.DEALER] ? String(results[r][CONFIG.DB_COL.DEALER]).trim() : ""
    });
  }
  // Свежие сверху
  games.sort(function(a, b) {
    return (b.date || "").localeCompare(a.date || "");
  });
  return games;
}

/**
 * Карточка игрока: данные за текущий месяц + за всё время + процентили.
 * Ищет игрока по нику или реальному имени (без учёта регистра).
 * @param {string} query ник или реальное имя.
 * @returns {Object|null} объект карточки или null, если игрок не найден.
 */
function computePlayerCard(query) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var playersSheet = ss.getSheetByName(CONFIG.SHEETS.PLAYERS);
  var resultsSheet = ss.getSheetByName(CONFIG.SHEETS.RESULTS);
  if (!playersSheet || !resultsSheet || !query) return null;

  var q = String(query).trim().toLowerCase();
  var playersData = playersSheet.getDataRange().getValues();
  var realName = null;
  for (var i = 1; i < playersData.length; i++) {
    var rn = playersData[i][0] ? String(playersData[i][0]).trim() : "";
    var cn = playersData[i][1] ? String(playersData[i][1]).trim() : "";
    if (!rn) continue;
    if (rn.toLowerCase() === q || (cn && cn.toLowerCase() === q)) { realName = rn; break; }
  }
  if (!realName) return null;
  var displayName = nickNameOf(realName);

  // --- За текущий месяц (из месячного лидерборда; берём кэш, чтобы не пересчитывать) ---
  var monthRows = cachedJson("DGET_current", CACHE_TTL.current, function() { return computeLeaderboardRows('month'); });
  var monthCard = null;
  var playerMonthIndex = -1;
  if (Array.isArray(monthRows)) {
    for (var m = 0; m < monthRows.length; m++) {
      if (monthRows[m][2] === displayName || monthRows[m][2] === realName) {
        playerMonthIndex = m;
        monthCard = {
          position: monthRows[m][0], trend: monthRows[m][1], points: monthRows[m][3],
          rank: monthRows[m][4], itmStack: monthRows[m][5], fullSet: monthRows[m][6],
          bonuses: monthRows[m][7], breakdown: monthRows[m][8],
          meta: monthRows[m][9] || null
        };
        break;
      }
    }
  }

  // --- Цель (значимые рубежи по текущему месячному лидерборду) ---
  // Игрокам важны не «обойти соседа», а попадание в рубежи: топ-9 и топ-3
  // (из-за наград в конце месяца) и 1-е место. Для каждого рубежа считаем,
  // сколько не хватает очков (gap) или какой запас (buffer), и хватит ли победы.
  var goal = null;
  if (monthCard && playerMonthIndex >= 0 && Array.isArray(monthRows) && monthRows.length > 0) {
    var myPoints = Number(monthRows[playerMonthIndex][3]) || 0;
    var myPos = playerMonthIndex + 1;

    function boundaryFor(pos) {
      if (pos >= 1 && pos <= monthRows.length) return Number(monthRows[pos - 1][3]) || 0;
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
      var gap = null;
      var buffer = null;
      var minWin = null;

      if (isInside) {
        // Игрок уже внутри рубежа — считаем запас очков до вылета
        var dropBoundary = boundaryFor(pos + 1);
        if (dropBoundary !== null) {
          buffer = Math.max(0, myPoints - dropBoundary);
        } else {
          buffer = myPoints;
        }
      } else {
        // Игрок вне рубежа — считаем, сколько очков не хватает, чтобы войти в рубеж
        if (b !== null) {
          gap = Math.max(0, b - myPoints + 1);
          minWin = minWinToPass(b);
        }
      }

      return {
        pos: pos,
        in: isInside,
        gap: gap,
        buffer: buffer,
        minWin: minWin
      };
    }

    goal = {
      position: myPos,
      isLeader: myPos === 1,
      milestones: [milestone(9), milestone(3), milestone(1)]
    };
  }

  // --- За всё время ---
  var all = computeAllTimeStats();
  var targetAll = null;
  for (var a = 0; a < all.length; a++) {
    if (all[a].player === displayName || all[a].realName === realName) { targetAll = all[a]; break; }
  }
  var allTime = null;
  if (targetAll) {
    allTime = {
      position: targetAll.position,
      games: targetAll.games, place1: targetAll.place1, place2: targetAll.place2,
      place3: targetAll.place3, place4: targetAll.place4, place5: targetAll.place5,
      itm: targetAll.itm, knockouts: targetAll.knockouts,
      gamePoints: targetAll.gamePoints, koPoints: targetAll.koPoints,
      mttPlacePoints: targetAll.mttPlacePoints,
      pointsByFormat: targetAll.pointsByFormat || {},
      totalPoints: targetAll.totalPoints, winsByFormat: targetAll.winsByFormat || {},
      firstWinDate: targetAll.firstWinDate, lastWinDate: targetAll.lastWinDate
    };
  }

  // --- MTT призовые места (кэш общий для всех карточек) ---
  var mtt = cachedJson("DGET_mttpodium", CACHE_TTL.mttpodium, function() { return computeMttPodiumStats(); });
  var mttEntry = mtt.byPlayer[realName] || null;
  var mttCard = null;
  if (mttEntry) {
    mttCard = {
      podiumCount: mttEntry.podiumCount,
      places: mttEntry.places
    };
  }

  return {
    name: displayName,
    month: monthCard,
    allTime: allTime,
    goal: goal,
    mtt: mttCard,
    history: computePlayerGamesHistory(realName)
  };
}

/**
 * JSON-эндпоинт для Telegram Mini App.
 * Развёрнут как Web App (deploy as web app, access ANYONE).
 *
 * Параметры (?type=...):
 *   leaderboard  — лидерборд за всё время
 *   halloffame   — зал славы (призовые места МТТ)
 *   current      — лидерборд текущего месяца (как в таблице)
 *   player       — карточка игрока (?type=player&name=НИК)
 *   dealers      — тепловая карта дилеров за месяц (?type=dealers [, ?month=ГГГГ-ММ])
 *
 * Пример: /exec?type=current
 */

/**
 * Проверка административного ключа для диагностических эндпоинтов.
 * Публичному web app (доступ "anyone") не должны быть доступны служебные
 * данные (диагностика, сырые строки, триггеры, создание триггеров и т.п.).
 * Ключ задаётся один раз: setSecret("ADMIN_KEY", "ваш_секрет") в редакторе.
 * Если ключ не задан — служебные эндпоинты закрыты по умолчанию (безопасно).
 * @param {Object} e event doGet
 * @returns {boolean} разрешено ли
 */
function isAdminAuthorized(e) {
  var given = e && e.parameter && e.parameter.key ? String(e.parameter.key) : "";
  if (!given) return false;
  var expected = getScriptProperty("ADMIN_KEY", "");
  return expected !== "" && given === expected;
}

function doGet(e) {
  try {
    var type = (e && e.parameter && e.parameter.type) ? e.parameter.type : "html";
    var admin = isAdminAuthorized(e);

    // Без параметра type (или type=html) отдаём интерфейс Telegram Mini App.
    if (!type || type === "html") {
      return HtmlService
        .createHtmlOutputFromFile('index')
        .setTitle("🏆 Poker Leaderboard")
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }

    var payload;

    switch (type) {
      case "leaderboard":
        payload = { success: true, type: "leaderboard", data: slimAllStats(computeAllTimeStats()), generatedAt: new Date() };
        break;
      case "halloffame":
        // История всех игр и призовых мест (все форматы)
        payload = { success: true, type: "halloffame", data: cachedJson("DGET_halloffame", CACHE_TTL.hof, function() { return computeHallOfFame(); }), generatedAt: new Date() };
        break;
      case "current":
        var rows = cachedJson("DGET_current", CACHE_TTL.current, function() { return computeLeaderboardRows('month'); });
        payload = { success: true, type: "current", data: slimCurrentRows(rows), generatedAt: new Date() };
        break;
      case "bundle":
        // Все данные для вкладок одним запросом (всё берётся из чанкового кэша)
        payload = {
          success: true, type: "bundle",
          current: slimCurrentRows(cachedJson("DGET_current", CACHE_TTL.current, function() { return computeLeaderboardRows('month'); })),
          all: cachedJson("DGET_all_slim", CACHE_TTL.current, function() { return slimAllStats(computeAllTimeStats()); }),
          hof: cachedJson("DGET_halloffame", CACHE_TTL.hof, function() { return computeHallOfFame(); }),
          dealers: cachedJson("DGET_dealers_cur", CACHE_TTL.dealers, function() { return computeDealersHeatmap(""); }),
          generatedAt: new Date()
        };
        break;
      case "player":
        var name = (e && e.parameter && e.parameter.name) ? e.parameter.name : "";
        var pkey = "DGET_player_" + name;
        payload = { success: true, type: "player", data: cachedJson(pkey, CACHE_TTL.player, function() { return computePlayerCard(name); }), generatedAt: new Date() };
        break;
      case "dealers":
        var month = (e && e.parameter && e.parameter.month) ? e.parameter.month : "";
        var dkey = "DGET_dealers_" + (month || "cur");
        payload = { success: true, type: "dealers", data: cachedJson(dkey, CACHE_TTL.dealers, function() { return computeDealersHeatmap(month); }), generatedAt: new Date() };
        break;
      case "sync_dealers":
        var reg = (typeof syncDealersToFirebase === "function") ? syncDealersToFirebase() : null;
        payload = { success: true, type: "sync_dealers", registry: reg, generatedAt: new Date() };
        break;
      case "diag":
        if (!admin) { payload = { success: false, error: "unauthorized" }; break; }
        var diagData = (typeof telegramDiag === "function") ? telegramDiag() : { error: "no diag" };
        try {
          diagData.lastSubmit = JSON.parse(PropertiesService.getScriptProperties().getProperty("LAST_SUBMIT") || "null");
        } catch (e) {}
        try {
          diagData.lastTg = PropertiesService.getScriptProperties().getProperty("LAST_TG");
        } catch (e) {}
        if (e && e.parameter && e.parameter.test === "1" && typeof sendTelegramMessage === "function") {
          sendTelegramMessage("🔔 Тест уведомлений из Атмосферы — всё работает!");
        }
        payload = { success: true, type: "diag", data: diagData };
        break;
      case "triggers":
        if (!admin) { payload = { success: false, error: "unauthorized" }; break; }
        payload = { success: true, type: "triggers", data: (typeof listTriggers === "function") ? listTriggers() : { error: "no fn" } };
        break;
      case "ensureWarmTrigger":
        if (!admin) { payload = { success: false, error: "unauthorized" }; break; }
        var hasWarm = false;
        try {
          var allTr = ScriptApp.getProjectTriggers();
          for (var ti = 0; ti < allTr.length; ti++) {
            if (allTr[ti].getHandlerFunction() === "warmCachesIfDirty") hasWarm = true;
          }
          if (!hasWarm) {
            ScriptApp.newTrigger("warmCachesIfDirty").timeBased().everyMinutes(5).create();
            hasWarm = true;
          }
        } catch (e) {
          payload = { success: false, error: e.message, exists: hasWarm };
          break;
        }
        payload = { success: true, exists: hasWarm, triggers: listTriggers() };
        break;
      case "debugRows":
        // ДИАГНОСТИКА: срезы данных за дату (?date=ГГГГ-ММ-ДД) из DB_Results,
        // BackfillLog и сырых листов форм. Ничего не изменяет. Только для админа.
        if (!admin) { payload = { success: false, error: "unauthorized" }; break; }
        payload = {
          success: true, type: "debugRows",
          data: (typeof debugRowsForDate === "function")
            ? debugRowsForDate(
                (e && e.parameter && e.parameter.date) || "",
                (e && e.parameter && e.parameter.player) || "")
            : { error: "no fn" }
        };
        break;
      case "backfillLog":
        // ДИАГНОСТИКА: весь журнал бэкфилла. Только для админа.
        if (!admin) { payload = { success: false, error: "unauthorized" }; break; }
        var _bl = [];
        try {
          var _blSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.BACKFILL_LOG);
          if (_blSheet) {
            var _blData = _blSheet.getDataRange().getValues();
            for (var _br = 1; _br < _blData.length; _br++) {
              _bl.push({
                gameId: _blData[_br][0], sheet: _blData[_br][1], date: normalizeDate(_blData[_br][2]),
                dealer: _blData[_br][3], result: _blData[_br][5], lineup: _blData[_br][6]
              });
            }
          }
        } catch (e) { _bl = { error: e.message }; }
        payload = { success: true, type: "backfillLog", count: Array.isArray(_bl) ? _bl.length : -1, data: _bl };
        break;
      default:
        payload = { success: false, error: "unknown type: " + type };
    }

    return ContentService
      .createTextOutput(JSON.stringify(payload))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
