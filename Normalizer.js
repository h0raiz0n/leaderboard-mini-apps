// ==========================================
// МОДУЛЬ НОРМАЛИЗАЦИИ
// ==========================================
// Преобразует "сырую" строку из листа формы (Data/MTT/Mystery)
// в массив строк для DB_Results.
// Используется и для live-событий, и для исторического бэкфилла —
// это единый канал записи.

/**
 * Карта: название листа -> ключ формата в CONFIG.FORMATS
 */
var RAW_SHEET_TO_FORMAT_KEY = {
  "Data": "Data",
  "MTT": "MTT",
  "Mystery": "Mystery"
};

/**
 * Привести значение поля игрока к «реальному имени».
 *
 * Форма теперь предлагает варианты "<Имя Фамилия> <3 цифры ника>"
 * (например "Иван Иванов 123"), чтобы администраторам было проще различать
 * игроков. В хранилище (DB_Results) и лидерборде нужен чистый игрок —
 * реальное имя, поэтому хвост " <3 цифры>" убирается.
 * Значения без такого хвоста (обычные имена, ники вида "Женя888") не меняются.
 *
 * @param {*} raw Значение ячейки формы (или e.values)
 * @returns {string} Реальное имя игрока
 */
function cleanPlayerName(raw) {
  if (!raw) return "";
  var s = String(raw).trim();
  var m = s.match(/^(.*)[ ]\d{3}$/);
  if (m && m[1] && m[1].trim()) return m[1].trim();
  return s;
}

/**
 * Получить конфигурацию формата по имени листа-приёмника.
 * @returns {Object|null} конфиг формата или null, если лист не является игровым
 */
function getFormatConfigByRawSheet(sheetName) {
  var key = RAW_SHEET_TO_FORMAT_KEY[sheetName];
  if (!key) return null;
  var cfg = CONFIG.FORMATS[key];
  if (!cfg) return null;
  return cfg;
}

/**
 * Нормализация строки формы -> список записей для DB_Results.
 * Каждая запись = [gameId, rawDate, format, dealer, player, event, points, isItm].
 *
 * @param {string} sheetName  Имя листа-приёмника (Data/MTT/Mystery)
 * @param {Array}  rowValues  Массив значений строки формы (как из e.values / getValues)
 * @param {string} gameId     Стабильный ID игры (генерируется один раз на игру)
 * @param {string} [overriddenDealer] Дилер, если нужно подменить (для бэкфилла из сырого столбца)
 * @returns {Object} { format, dealer, items: [ {player,event,points,isItm}, ... ] }
 */
function normalizeFormRow(sheetName, rowValues, gameId, overriddenDealer) {
  if (!rowValues || !rowValues.length) return { format: "", dealer: "", items: [] };

  var cfg = getFormatConfigByRawSheet(sheetName);
  if (!cfg) return { format: "", dealer: "", items: [] };

  // Дату берём сырой (таймстамп), как в источнике
  var rawDate = rowValues[1];

  // Дилер: в форме колонка 2. Для бэкфилла дилер может храниться в др. колонке —
  // тогда используется overriddenDealer.
  var dealer = overriddenDealer;
  if (dealer === undefined || dealer === null || dealer === "") {
    dealer = rowValues[2] ? rowValues[2].toString().trim() : "Не указан";
  }

  var items = [];
  var places = cfg.places;

  // Места (placeStart..placeStart+places.length-1)
  for (var i = 0; i < places.length; i++) {
    var playerRaw = rowValues[cfg.startCol + i];
    var pName = cleanPlayerName(playerRaw);

    if (isParticipating(pName)) {
      items.push({
        player: pName,
        event: places[i].name,
        points: places[i].pts,
        isItm: places[i].isItm
      });
    }
  }

  // Нокауты (если есть в формате)
  if (cfg.koStartCol !== null && cfg.koCount > 0) {
    for (var k = 0; k < cfg.koCount; k++) {
      var koRaw = rowValues[cfg.koStartCol + k];
      var koName = cleanPlayerName(koRaw);
      if (isParticipating(koName)) {
        items.push({
          player: koName,
          event: "Нокаут",
          points: cfg.koPts,
          isItm: cfg.koColIsItm
        });
      }
    }
  }

  return { format: cfg.formatName, dealer: dealer, items: items };
}

/**
 * Формирует список строк для вставки в DB_Results из результата normalizeFormRow.
 * @param {Object} normalized Результат normalizeFormRow
 * @param {string} gameId     ID игры
 * @param {string} rawDate    Сырая дата (timestamp)
 * @returns {Array<Array>} строки для DB_Results
 */
function buildDbRows(normalized, gameId, rawDate) {
  var rows = [];
  for (var i = 0; i < normalized.items.length; i++) {
    var item = normalized.items[i];
    rows.push([
      gameId, rawDate, normalized.format, normalized.dealer,
      item.player, item.event, item.points, item.isItm
    ]);
  }
  return rows;
}

/**
 * ЕДИНЫЙ детерминированный gameId игры.
 * Одинаков и для live-записи (processFormSubmit), и для бэкфилла
 * (historicalGameId). Бэкфилл по идемпотентности пропускает уже введённые
 * live-игры, поэтому одна игра больше не попадает в DB_Results дважды
 * (раньше live писал G_<мс>, бэкфилл — H_<лист>_<дата>_<ts>_r<строка>, и ключи
 * никогда не совпадали).
 *
 * Ключ = H_<лист>_<дата>_<timestamp формы>.
 *
 * @param {string} sheetName  Имя листа-приёмника (Data/MTT/Mystery)
 * @param {Array}  rowValues  Массив значений строки формы (как из e.values / getValues)
 * @returns {string} Единый gameId игры
 */
function unifiedGameId(sheetName, rowValues) {
  var dateStr = normalizeDate(rowValues[1]) || "nodate";
  var ts = "no_ts";
  if (rowValues[0]) {
    try {
      var parsed = new Date(rowValues[0]);
      if (!isNaN(parsed.getTime())) ts = String(parsed.getTime());
    } catch (e) {}
  }
  // Если timestamp формы пуст/не распарсился — подставляем текущее время,
  // чтобы у разных игр одного дня не было одинакового gameId (коллизии).
  if (ts === "no_ts") ts = String(new Date().getTime());
  return "H_" + sheetName + "_" + dateStr + "_" + ts;
}

/**
 * Старое представление gameId бэкфилла (с суффиксом _r<строка>).
 * Используется только для идемпотентности: строки, уже забэкофилленные
 * до миграции на единый ключ, должны пропускаться повторным бэкфиллом.
 *
 * @param {string} rawSheetName Имя листа-приёмника
 * @param {Array}  rowValues    Массив значений строки формы
 * @param {number} rowIndex     Индекс строки в массиве данных (0 = заголовок)
 * @returns {string} Старый gameId
 */
function legacyHistoricalGameId(rawSheetName, rowValues, rowIndex) {
  var dateStr = normalizeDate(rowValues[1]) || "nodate";
  var ts = "no_ts";
  if (rowValues[0]) {
    try {
      var parsed = new Date(rowValues[0]);
      if (!isNaN(parsed.getTime())) ts = String(parsed.getTime());
    } catch (e) {}
  }
  return "H_" + rawSheetName + "_" + dateStr + "_" + ts + "_r" + rowIndex;
}

/**
 * Считает количество игр дилера за дату по ВСЕМ листам-приёмникам форм.
 * Это устраняет баг, когда игра без участников не попадала в DB_Results
 * (и счётчик всегда говорил «1-я игра»).
 *
 * Считаем по первой колонке дилера (0-based кол. 2) в каждом сыром листе:
 * одна строка формы = одна игра дилера, независимо от формата.
 *
 * @param {Spreadsheet} ss            Активная таблица
 * @param {string} deploymentSheet    Лист, с которого пришла текущая игра (не критично, все сканируются)
 * @param {string} dateStr            Нормализованная дата YYYY-MM-DD
 * @param {string} dealer             Имя дилера
 * @param {string} currentGameId      gameId текущей игры
 * @returns {number} Порядковый номер текущей игры дилера за эту дату
 */
function countDealerGamesToday(ss, deploymentSheet, dateStr, dealer, currentGameId) {
  var DEALER_COL = 2;
  var lowDealer = String(dealer || "").toLowerCase().trim();

  // --- Логирование входа для диагностики ---
  Logger.log("countDealerGamesToday: dateStr=" + dateStr + " | dealer=" + dealer + " | gameId=" + currentGameId);

  // Надёжная «сегодняшняя» дата в таймзоне проекта (формат можно игнорировать).
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  if (!dateStr) dateStr = today;
  // Ключевое исправление: для live-игры всегда считаем за СЕГОДНЯ,
  // чтобы не зависеть от формата даты в форме.
  dateStr = today;

  // 1. Уникальные игры (gameId) дилера за дату из DB_Results.
  //    DB_Results уже содержит текущую игру (пишем перед этим вызовом).
  var seenFromDb = {};
  var countFromDb = 0;
  var resultsSheet = ss.getSheetByName(CONFIG.SHEETS.RESULTS);
  if (resultsSheet) {
    var resultsData = resultsSheet.getDataRange().getValues();
    for (var r0 = 1; r0 < resultsData.length; r0++) {
      var rawDateDb = resultsData[r0][CONFIG.DB_COL.DATE];
      var dbDate = normalizeDate(rawDateDb);
      var dbDealer = resultsData[r0][CONFIG.DB_COL.DEALER]
        ? String(resultsData[r0][CONFIG.DB_COL.DEALER]).trim() : "";
      var dbGid = resultsData[r0][CONFIG.DB_COL.GAME_ID];
      if (dbDate === dateStr && dbDealer.toLowerCase() === lowDealer && dbGid) {
        if (!seenFromDb[dbGid]) { seenFromDb[dbGid] = true; countFromDb++; }
      }
    }
  }

  // 2. Сырые листы форм — актуальны для "пустых" игр (без участников),
  //    которые не попадают в DB_Results. Считаем строки формы дилера за дату.
  var countFromRaw = 0;
  for (var sheetKey in CONFIG.FORMATS) {
    var rawSheet = ss.getSheetByName(sheetKey);
    if (!rawSheet) continue;
    var data = rawSheet.getDataRange().getValues();
    if (data.length <= 1) continue;
    for (var r = 1; r < data.length; r++) {
      var rowDateStr = normalizeDate(data[r][1]);
      var rowDealer = data[r][DEALER_COL] ? String(data[r][DEALER_COL]).trim().toLowerCase() : "";
      if (rowDateStr === dateStr && rowDealer === lowDealer) {
        countFromRaw++;
      }
    }
  }

  Logger.log("countDealerGamesToday: countFromDb=" + countFromDb + " | countFromRaw=" + countFromRaw);

  // 3. Итог. Текущая игра уже в DB (мы её записали выше), поэтому
  //    countFromDb уже включает её. Для "пустых" игр полагаемся на countFromRaw
  //    (строка формы, возможно, ещё не записана — тогда countFromRaw не досчитает;
  //    для пустых игр это менее критично). Берём максимум, минимум — 1.
  return Math.max(countFromDb, countFromRaw, 1);
}

/**
 * Подтягивание анонимных ников для Telegram уведомления.
 * @returns {Object} map: имя -> ник (ник, если есть, иначе имя)
 */
function buildNickMap(ss) {
  var playersSheet = ss.getSheetByName(CONFIG.SHEETS.PLAYERS);
  if (!playersSheet) return {};
  var data = playersSheet.getDataRange().getValues();
  var map = {};
  for (var p = 1; p < data.length; p++) {
    var rName = data[p][0] ? data[p][0].toString().trim() : "";
    var cNick = data[p][1] ? data[p][1].toString().trim() : "";
    if (rName) map[rName] = cNick !== "" ? cNick : rName;
  }
  return map;
}
