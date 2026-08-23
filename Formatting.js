// ==========================================
// A3. УСЛОВНОЕ ФОРМАТИРОВАНИЕ ЛИДЕРБОРДА
// ==========================================
// Автоматическая раскраска листа Leaderboard для наглядности:
//   - топ-3: золото/серебро/бронза;
//   - инициалы ряда контента;
//   - ранги подсвечиваются значка ;
//   - возвращения (🔼 зелёным, 🔽 красным).
//
// Запуск: лидерборд должен быть уже заполнен (calculateLeaderboard()).
// Устанавливает правила форматирования на ВСЁ время существования листа.

function applyLeaderboardFormatting() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEETS.LEADERBOARD);
  if (!sheet) {
    Logger.log("Ошибка: не найден лист Leaderboard");
    return;
  }

  var lastRow = Math.max(sheet.getLastRow(), 2);

  // ---------------------------------------------------------
  // 1. ЗАГОЛОВОК (строка 1) — заливка и жирный
  // ---------------------------------------------------------
  sheet.getRange(1, 1, 1, 9).setBackground("#1f1f1f");
  sheet.getRange(1, 1, 1, 9).setFontColor("#ffffff");
  sheet.getRange(1, 1, 1, 9).setFontWeight("bold");
  sheet.getRange(1, 1, 1, 9).setFontFamily("Roboto");

  // Закрепить шапку и первые две колонки
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);

  // ---------------------------------------------------------
  // 2. ЧЕРЕДОВАНИЕ СТРОК (светлая зебра — контраст с тёмным текстом)
  // ---------------------------------------------------------
  var dataRange = sheet.getRange(2, 1, lastRow - 1, 9);
  // Базово делаем текст тёмным и фон светлым для читаемости
  dataRange.setFontColor("#111111");
  dataRange.setBackground("#ffffff");
  dataRange.setVerticalAlignment("middle");

  var zebraRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied("=MOD(ROW(),2)=1")
    .setBackground("#f0f0f0")
    .setRanges([dataRange])
    .build();

  // ---------------------------------------------------------
  // 3. ТОП-3 (по колонке A — позиция), контрастные цвета
  // ---------------------------------------------------------
  var goldRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied("=($A2=1)")
    .setBackground("#ffd966")      // золото (светлое)
    .setFontColor("#000000")
    .setBold(true)
    .setRanges([dataRange])
    .build();

  var silverRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied("=($A2=2)")
    .setBackground("#e0e0e0")      // серебро (светлое)
    .setFontColor("#000000")
    .setRanges([dataRange])
    .build();

  var bronzeRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied("=($A2=3)")
    .setBackground("#f0d5b3")      // бронза (светлая)
    .setFontColor("#000000")
    .setRanges([dataRange])
    .build();

  // ---------------------------------------------------------
  // 4. ТРЕНД (колонка B): 🔼 зелёный, 🔽 красный, ➖ нейтрал
  // ---------------------------------------------------------
  var upRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied("=REGEXMATCH($B2,\"🔼\")")
    .setFontColor("#2ecc71")
    .setBold(true)
    .setRanges([sheet.getRange(2, 2, lastRow - 1, 1)])
    .build();

  var downRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied("=REGEXMATCH($B2,\"🔽\")")
    .setFontColor("#e74c3c")
    .setBold(true)
    .setRanges([sheet.getRange(2, 2, lastRow - 1, 1)])
    .build();

  // ---------------------------------------------------------
  // 5. РАНГ (колонка E): подсветка топ-ранговых званий
  // ---------------------------------------------------------
  var bossRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied("=REGEXMATCH($E2,\"BOSS\")")
    .setFontColor("#b7950b")       // тёмное золото — читаемо на светлом фоне
    .setBold(true)
    .setRanges([sheet.getRange(2, 5, lastRow - 1, 1)])
    .build();

  var legendRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied("=REGEXMATCH($E2,\"LEGEND\")")
    .setFontColor("#e67e22")
    .setBold(true)
    .setRanges([sheet.getRange(2, 5, lastRow - 1, 1)])
    .build();

  var sharkRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied("=REGEXMATCH($E2,\"SHARK\")")
    .setFontColor("#3498db")
    .setBold(true)
    .setRanges([sheet.getRange(2, 5, lastRow - 1, 1)])
    .build();

  // ---------------------------------------------------------
  // СБОР И ПРИМЕНЕНИЕ
  // ---------------------------------------------------------
  // Сначала убираем старые правила, чтобы не плодить дубли при повторе запуска
  sheet.setConditionalFormatRules([]);
  var rules = [
    zebraRule, goldRule, silverRule, bronzeRule,
    upRule, downRule,
    bossRule, legendRule, sharkRule
  ];
  sheet.setConditionalFormatRules(rules);

  // ---------------------------------------------------------
  // 6. ШИРИНА КОЛОНОК И ВЫРАВНИВАНИЕ (для читаемости)
  // ---------------------------------------------------------
  sheet.setColumnWidth(1, 40);   // позиция
  sheet.setColumnWidth(2, 90);   // тренд
  sheet.setColumnWidth(3, 160);  // ник
  sheet.setColumnWidth(4, 70);   // очки
  sheet.setColumnWidth(5, 120);  // ранг
  sheet.setColumnWidth(6, 150);  // ITM stack
  sheet.setColumnWidth(7, 160);  // full set
  sheet.setColumnWidth(8, 120);  // бонусы
  sheet.setColumnWidth(9, 300);  // детализация

  // Выравнивание текста по центру для числовых колонок
  sheet.getRange(2, 1, lastRow - 1, 1).setHorizontalAlignment("center");
  sheet.getRange(2, 2, lastRow - 1, 1).setHorizontalAlignment("center");
  sheet.getRange(2, 4, lastRow - 1, 1).setHorizontalAlignment("center");

  // Детерминированные ширины колонок (не полагаемся на капризную авто-подгонку)
  applyColumnWidths(sheet);

  Logger.log("Условное форматирование локального лидерборда применено");

  // Применяем ту же схему и к публичной таблице, если она доступна
  applyFormattingToPublicIfAvailable();

  try {
    SpreadsheetApp.getUi().alert("✅ Условное форматирование применено!");
  } catch (e) {}
}

/**
 * Применить форматирование к публичному листу, если он доступен на запись.
 */
function applyFormattingToPublicIfAvailable() {
  var pubId = getScriptProperty('PUBLIC_SPREADSHEET_ID', CONFIG.PUBLIC_SPREADSHEET_ID);
  if (!pubId || pubId.indexOf("ВСТАВЬ") > -1) {
    Logger.log("Публичный лидерборд: ID не задан, пропуск");
    return;
  }
  try {
    var pubSpreadsheet = SpreadsheetApp.openById(pubId);
    var pubSheet = pubSpreadsheet.getSheetByName(CONFIG.SHEETS.LEADERBOARD);
    if (pubSheet) {
      applyFormattingToSheet(pubSheet);
      Logger.log("Форматирование применено к публичному листу");
    } else {
      Logger.log("В публичной таблице нет листа '" + CONFIG.SHEETS.LEADERBOARD + "'");
    }
  } catch (e) {
    Logger.log("Не удалось отформатировать публичный лист (нет прав или ID неверный): " + e.message);
  }
}

/**
 * Применить визуальные правила к конкретному листу (переиспользуется для публичного).
 */
function applyFormattingToSheet(sheet) {
  var lastRow = Math.max(sheet.getLastRow(), 2);
  var dataRange = sheet.getRange(2, 1, lastRow - 1, 9);

  sheet.getRange(1, 1, 1, 9).setBackground("#1f1f1f");
  sheet.getRange(1, 1, 1, 9).setFontColor("#ffffff");
  sheet.getRange(1, 1, 1, 9).setFontWeight("bold");
  sheet.setFrozenRows(1);

  // Светлая тема: тёмный текст на светлых фонах
  dataRange.setFontColor("#111111");
  dataRange.setBackground("#ffffff");

  var rules = [];
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied("=MOD(ROW(),2)=1").setBackground("#f0f0f0").setRanges([dataRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied("=($A2=1)").setBackground("#ffd966").setFontColor("#000000").setBold(true).setRanges([dataRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied("=($A2=2)").setBackground("#e0e0e0").setFontColor("#000000").setRanges([dataRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied("=($A2=3)").setBackground("#f0d5b3").setFontColor("#000000").setRanges([dataRange]).build());

  applyWidthsToSheet(sheet);
  sheet.setConditionalFormatRules(rules);
}

/**
 * Задать детерминированные (стабильные) ширины колонок для лидерборда.
 * Использует значения с запасом, чтобы текст почти никогда не обрезался.
 * Вызывается при каждом оформлении/пересчёте, чтобы ширины не сбрасывались.
 * @param {Sheet} sheet  Лист лидерборда
 */
function applyColumnWidths(sheet) {
  var widths = [40, 90, 170, 70, 140, 160, 170, 130, 510];
  widths.forEach(function(w, idx) {
    try { sheet.setColumnWidth(idx + 1, w); } catch (e) { Logger.log("setColumnWidth " + (idx + 1) + ": " + e.message); }
  });
}

/**
 * Применить ширины колонок (переиспользуется в разных местах).
 */
function applyWidthsToSheet(sheet) {
  applyColumnWidths(sheet);
}
