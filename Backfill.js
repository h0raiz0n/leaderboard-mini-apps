// ==========================================
// БЭКФИЛЛ ИСТОРИЧЕСКИХ ДАННЫХ
// ==========================================
// Переносит многомесячные "сырые" данные из листов-приёмников форм
// (Data/MTT/Mystery) в нормализованную DB_Results.
//
// Ключевые принципы:
//  1. ИДЕМПОТЕНТНОСТЬ: повторный запуск не создаёт дублей
//     (проверка по детерминированному gameId).
//  2. ДОЗИРОВАННОСТЬ: обрабатываем порциями (BACKFILL_CHUNK),
//     чтобы не упереться в 6-минутный лимит выполнения.
//  3. ЖУРНАЛ: сохраняем прогресс между запусками в скриптовых свойствах.

/**
 * Получить доступ к журналу бэкфилла (лист BackfillLog).
 */
function getBackfillLogSheet(ss, create) {
  var sheet = ss.getSheetByName(CONFIG.SHEETS.BACKFILL_LOG);
  if (!sheet && create) {
    sheet = ss.insertSheet(CONFIG.SHEETS.BACKFILL_LOG);
    sheet.appendRow(["КЛЮЧ_ИГРЫ", "ЛИСТ", "ДАТА", "ДИЛЕР", "ФОРМАТ", "РЕЗУЛЬТАТ", "СОСТАВ"]);
  }
  return sheet;
}

/**
 * Сформировать человекочитаемое описание состава игры по записям rowsToInsert:
 * кто какое место/нокаут занял. Используется для колонки СОСТАВ журнала.
 * @param {Array<Array>} rows Записи для DB_Results (каждая = [gameId,date,format,dealer,player,event,points,isItm])
 * @param {string} sheetKey Имя листа-приёмника (для подписей мест)
 * @returns {string} например: "🥇 Иван(+10); 🥈 Петр(+6); 🎯 Симон(+20)"
 */
function formatGameLineup(rows, sheetKey) {
  if (!rows || !rows.length) return "—";

  var labels = {
    "1 место": "🥇", "2 место": "🥈", "3 место": "🥉",
    "4 место": "4️⃣", "5 место": "5️⃣", "Нокаут": "🎯"
  };

  return rows.map(function(row) {
    var player = row[CONFIG.DB_COL.PLAYER];
    var event = row[CONFIG.DB_COL.EVENT];
    var points = row[CONFIG.DB_COL.POINTS];
    var icon = labels[event] || "•";
    return icon + " " + player + "(+" + points + ")";
  }).join("; ");
}

/**
 * Детерминированный gameId для исторической записи.
 * Уникален для строки-игры (одна строка формы = одна игра).
 * Используется как ключ идемпотентности.
 */
function historicalGameId(rawSheetName, rowValues, rowIndex) {
  // Единый ключ с live-записью (unifiedGameId), без суффикса строки.
  // rowIndex сохраняем в сигнатуре для совместимости вызовов.
  return unifiedGameId(rawSheetName, rowValues);
}

/**
 * Проверить, существует ли уже gameId в DB_Results (идемпотентность).
 * @returns {Object} set существующих gameId (для пакетной проверки)
 */
function loadExistingGameIds(resultsSheet) {
  var set = {};
  var data = resultsSheet.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    var gid = data[r][CONFIG.DB_COL.GAME_ID];
    if (gid) set[gid] = true;
  }
  return set;
}

/**
 * ОСНОВНАЯ ФУНКЦИЯ БЭКФИЛЛА.
 * Обрабатывает порцию (BACKFILL_CHUNK) не обработанных ранее строк.
 * Функция может вызываться многократно (в т.ч. по триггеру) — продолжит с того места.
 */
function backfillHistoricalData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var resultsSheet = ss.getSheetByName(CONFIG.SHEETS.RESULTS);
  if (!resultsSheet) {
    Logger.log("Ошибка: нет листа DB_Results");
    return;
  }

  var existingIds = loadExistingGameIds(resultsSheet);
  var logSheet = getBackfillLogSheet(ss, true);

  // Прогресс в скриптовых свойствах: лист -> последняя обработанная строка
  var props = PropertiesService.getScriptProperties();
  var processed = 0;
  var chunk = CONFIG.BACKFILL_CHUNK || 100;
  var totalNew = 0;

  for (var sheetKey in CONFIG.FORMATS) {
    var cfg = CONFIG.FORMATS[sheetKey];
    var rawSheet = ss.getSheetByName(sheetKey);
    if (!rawSheet) continue;

    var data = rawSheet.getDataRange().getValues();
    if (data.length <= 1) continue;

    // Последняя обработанная строка для этого листа
    var cursorKey = "BACKFILL_CURSOR_" + sheetKey;
    var cursor = Number(props.getProperty(cursorKey) || 1); // строки начинаются с 1 (заголовок)

    for (var r = cursor; r < data.length && processed < chunk; r++) {
      var row = data[r];
      // Пропускаем полностью пустые строки
      var hasAnyValue = false;
      for (var c = 0; c < row.length; c++) { if (row[c] !== "" && row[c] !== null) { hasAnyValue = true; break; } }
      if (!hasAnyValue) { cursor = r + 1; continue; }

      var gameId = historicalGameId(sheetKey, row, r);

      // Идемпотентность: пропускаем уже сохранённые
      if (existingIds[gameId]) {
        cursor = r + 1;
        processed++;
        continue;
      }

      // Совместимость со старыми ключами (H_..._r<строка>): строки,
      // забэкофилленные до миграции на единый ключ, тоже пропускаем.
      var legacyGameId = legacyHistoricalGameId(sheetKey, row, r);
      if (legacyGameId !== gameId && existingIds[legacyGameId]) {
        cursor = r + 1;
        processed++;
        continue;
      }

      var normalized = normalizeFormRow(sheetKey, row, gameId);
      var rowsToInsert = buildDbRows(normalized, gameId, row[1]);

      if (rowsToInsert.length > 0) {
        resultsSheet.getRange(resultsSheet.getLastRow() + 1, 1, rowsToInsert.length, 8).setValues(rowsToInsert);
        totalNew += rowsToInsert.length;
        // жёстко отметить в существующих, чтобы в одной порции не было дублей при повторе
        existingIds[gameId] = true;
      }

      // Логируем в журнал (с детализацией состава мест/нокаутов)
      logSheet.appendRow([
        gameId, sheetKey, normalizeDate(row[1]), normalized.dealer, normalized.format,
        rowsToInsert.length > 0 ? "ADDED(" + rowsToInsert.length + ")" : "EMPTY/SKIPPED",
        formatGameLineup(rowsToInsert, sheetKey)
      ]);

      cursor = r + 1;
      processed++;
    }

    // Сохраняем курсор после обработки порции
    props.setProperty(cursorKey, String(cursor));

    if (processed >= chunk) break;
  }

  Logger.log("Backfill: обработано строк=" + processed + ", добавлено записей=" + totalNew);

  var msg = "🕘 Бэкфилл истории завершён (порция)\n\n";
  msg += "📄 Обработано строк: " + processed + "\n";
  msg += "➕ Добавлено записей в DB_Results: " + totalNew + "\n\n";
  msg += "Запустите функцию ещё раз, чтобы обработать следующий фрагмент. Запускайте до тех пор,\nпока не увидите '0 обработано' (все данные перенесены).";

  calculateLeaderboard(); // пересчитать месячный лидерборд после добавления
  if (totalNew > 0) invalidateAnalyticsCache();

  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    Logger.log("Запущено без UI. " + msg);
  }
}
