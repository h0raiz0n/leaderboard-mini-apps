function onOpen() {
  SpreadsheetApp.getUi()
      .createMenu('♠️ POKER ADMIN')
      .addItem('🚀 СИНХРОНИЗИРОВАТЬ БАЗУ', 'syncAll')
      .addItem('🎛️ УПРАВЛЕНИЕ ИГРАМИ', 'openGameManager')
      .addSeparator()
      .addItem('🕘 ЗАПОЛНИТЬ ИСТОРИЮ (БЭКФИЛЛ)', 'backfillHistoricalData')
      .addSeparator()
      .addItem('🔍 ДИАГНОСТИКА', 'diagnoseLeaderboard')
      .addItem('🎛️ ДИАГНОСТИКА БОТА И ТВ', 'diagnoseDealerBotAndTv')
      .addItem('⏰ ПРОВЕРИТЬ ТРИГГЕРЫ', 'checkSnapshotTriggers')
      .addItem('🧹 СВЕРКА С СЫРЫМИ (ПРЕДПРОСМОТР)', 'reconcilePreview')
      .addItem('🧹 СВЕРКА С СЫРЫМИ (ПРИМЕНИТЬ)', 'reconcileCommit')
      .addSeparator()
      .addItem('🎨 ОФОРМИТЬ ЛИДЕРБОРД', 'applyLeaderboardFormatting')
      .addToUi();
}

function syncAll() {
  var sheetName = CONFIG.SHEETS.PLAYERS;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('Список пуст!');
    return;
  }

  var rangeNames = sheet.getRange(2, 1, lastRow - 1, 1);
  var rangeNicks = sheet.getRange(2, 2, lastRow - 1, 1);

  var names = rangeNames.getValues();
  var nicks = rangeNicks.getValues();

  var ignoreList = CONFIG.IGNORE_LIST;

  var existingNicks = [];
  for (var i = 0; i < nicks.length; i++) {
    if (nicks[i][0] !== "") {
      existingNicks.push(nicks[i][0].toString().trim());
    }
  }

  var newNicksCount = 0;

  for (var i = 0; i < names.length; i++) {
    var fullName = names[i][0].toString().trim();
    var currentNick = nicks[i][0].toString().trim();

    if (ignoreList.indexOf(fullName) > -1) continue;

    if (fullName !== "" && currentNick === "") {
      var firstName = fullName.split(' ')[0].replace(/[^a-zA-Zа-яА-ЯёЁ]/g, "");
      var newNick = "";
      var isUnique = false;

      while (!isUnique) {
        var randomNum = Math.floor(Math.random() * 900) + 100;
        newNick = firstName + randomNum;

        if (existingNicks.indexOf(newNick) === -1) {
          isUnique = true;
          existingNicks.push(newNick);
          nicks[i][0] = newNick;
          newNicksCount++;
        }
      }
    }
  }

  if (newNicksCount > 0) {
    rangeNicks.setValues(nicks);
  }

  // Варианты для форм: "<Реальное Имя> <3 цифры ника>", например "Иван Иванов 123".
  // Так администраторам проще различать игроков в форме, а при вводе
  // cleanPlayerName() вернёт чистое реальное имя.
  var formChoices = [];
  var seenChoice = {};
  for (var i = 0; i < names.length; i++) {
    var fullName = names[i][0].toString().trim();
    var nick = nicks[i][0] ? nicks[i][0].toString().trim() : "";
    if (fullName === "" || ignoreList.indexOf(fullName) > -1) continue;
    var dm = nick.match(/(\d{3})$/);
    var choice = dm ? fullName + " " + dm[1] : fullName;
    if (!seenChoice[choice]) {
      seenChoice[choice] = true;
      formChoices.push(choice);
    }
  }

  formChoices.sort(function(a, b) {
    return a.localeCompare(b);
  });

  // Обязательный вариант для пустых мест — всегда в конце списка.
  // Иначе setChoiceValues() затирает вручную добавленный вариант в формах.
  formChoices.push("Not participating");


  var formsUpdated = 0;
  var errors = [];

  function updateSpecificForm(formId, formName, targetTitles) {
    if (!formId || formId.indexOf('ВСТАВЬ_СЮДА') > -1) {
      return;
    }
    
    try {
      var form = FormApp.openById(formId);
      var items = form.getItems();
      
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var itemTitle = item.getTitle().toString().trim().toUpperCase();
        
        if (targetTitles.indexOf(itemTitle) > -1) {
          if (item.getType() == FormApp.ItemType.LIST) {
            item.asListItem().setChoiceValues(formChoices);
          } else if (item.getType() == FormApp.ItemType.MULTIPLE_CHOICE) {
            item.asMultipleChoiceItem().setChoiceValues(formChoices);
          }
        }
      }
      formsUpdated++;
    } catch (e) {
      errors.push("Ошибка в форме [" + formName + "]: " + e.message);
    }
  }

  // Обновление форм из единого конфига
  for (var fKey in CONFIG.FORMS) {
    var formCfg = CONFIG.FORMS[fKey];
    updateSpecificForm(formCfg.id, formCfg.sheet, CONFIG.FORM_TITLES[fKey]);
  }


  var alertText = '✅ БАЗА СИНХРОНИЗИРОВАНА!\n\n🆕 Новых ников создано: ' + newNicksCount + '\n📝 Игроков загружено: ' + formChoices.length + '\n🔄 Успешно обновлено форм: ' + formsUpdated;
  
  if (errors.length > 0) {
    alertText += '\n\n⚠️ ВНИМАНИЕ, БЫЛИ ПРОБЛЕМЫ:\n' + errors.join('\n');
  }

  SpreadsheetApp.getUi().alert(alertText);
}

/**
 * Имя для показа в Telegram: ТОЛЬКО ник, без фамилий.
 * Если у игрока есть ник (в PlayersDB) — возвращаем его.
 * Если ника нет или игрока нет в базе — возвращаем только первое слово
 * (имя), чтобы фамилия ни в коем случае не светилась в пушах.
 * @param {Object} nickMap карта "реальное имя -> ник" (buildNickMap)
 * @param {string} realName реальное имя игрока
 * @returns {string} ник (или имя без фамилии)
 */
function pushNick(nickMap, realName) {
  var nick = nickMap ? nickMap[realName] : undefined;
  if (nick && nick !== realName) return nick; // настоящий ник из PlayersDB
  var first = String(realName || "").trim().split(/\s+/)[0];
  return first || "";
}

function processFormSubmit(e) {
  var log = { time: new Date().toISOString(), step: "start" };
  var lock = LockService.getScriptLock();
  var hasLock = false;
  try {
    hasLock = lock.tryLock(25000); // 25 секунд ожидания блокировки
  } catch (errLock) {}

  try {
    if (!e) return;

    var sheet = e.range.getSheet();
    var sheetName = sheet.getName();
    var rowValues = e.values; // Массив значений из формы
    log.sheet = sheetName;
    log.values = rowValues ? rowValues.length : 0;

    if (!rowValues || rowValues.length < 3) { log.step = "short-values"; saveSubmitLog(log); return; }

    var rawDate = rowValues[1];
    var dateStr = normalizeDate(rawDate);

    // Единый детерминированный gameId игры — совпадает с бэкфиллом,
    // чтобы бэкфилл не создавал дублей уже введённых live-игр.
    var gameId = unifiedGameId(sheetName, rowValues);

    // Нормализация через единый модуль (формат опредяется по имени листа)
    var normalized = normalizeFormRow(sheetName, rowValues, gameId);
    log.format = normalized.format;
    log.items = normalized.items.length;
    if (!normalized.items.length && !normalized.format) {
      log.step = "unknown-sheet";
      saveSubmitLog(log);
      return; // неизвестный лист
    }

    var format = normalized.format;
    var dealer = normalized.dealer;
    log.dealer = dealer;

    var dbSheet = sheet.getParent().getSheetByName(CONFIG.SHEETS.RESULTS);
    var rowsToInsert = buildDbRows(normalized, gameId, rawDate);

    // Записываем участников в DB_Results
    if (rowsToInsert.length > 0 && dbSheet) {
      dbSheet.getRange(dbSheet.getLastRow() + 1, 1, rowsToInsert.length, 8).setValues(rowsToInsert);
      calculateLeaderboard();
      invalidateAnalyticsCache();
      try {
        pushLeaderboardUpdate(gameId, format, dateStr);
      } catch (errSync) {}
      log.dbWritten = rowsToInsert.length;
    }

    // Подсчёт порядкового номера игры дилера за сегодня.
    // Считаем ТОЛЬКО из источника (листов форм), чтобы не терять "пустые" игры.
    var dealerGameCount = countDealerGamesToday(
      sheet.getParent(), sheetName, dateStr, dealer, gameId
    );
    log.dealerCount = dealerGameCount;

    // Подтягиваем анонимные никнеймы для Telegram
    try {
      var nickMap = buildNickMap(sheet.getParent());

      var finalNotifyItems = [];
      // notifyItems в едином порядке: сначала все места, затем нокауты —
      // строим из исходной строки, чтобы сохранить заполняющие "не участвует" поля
      var cfg = getFormatConfigByRawSheet(sheetName);
      if (cfg) {
        for (var i = 0; i < cfg.places.length; i++) {
          var pRaw = rowValues[cfg.startCol + i] ? rowValues[cfg.startCol + i].toString().trim() : "";
          var pName = cleanPlayerName(pRaw);
          var inDB = normalized.items.filter(function(it) {
            return it.event === cfg.places[i].name && it.player === pName;
          });
          if (inDB.length) {
            var pt = inDB[0].points;
            finalNotifyItems.push({ event: cfg.places[i].name, playerNick: pushNick(nickMap, pName), points: pt, isParticipating: true });
          } else {
            finalNotifyItems.push({ event: cfg.places[i].name, playerNick: "", points: 0, isParticipating: false });
          }
        }
        if (cfg.koStartCol !== null) {
          for (var k = 0; k < cfg.koCount; k++) {
            var koRaw = rowValues[cfg.koStartCol + k] ? rowValues[cfg.koStartCol + k].toString().trim() : "";
            var koName = cleanPlayerName(koRaw);
            var koInDB = normalized.items.filter(function(it) { return it.event === "Нокаут" && it.player === koName; });
            if (koInDB.length) {
              finalNotifyItems.push({ event: "Нокаут", playerNick: pushNick(nickMap, koName), points: koInDB[0].points, isParticipating: true });
            }
          }
        }
      }

      if (typeof notifyGameResult === "function") {
        notifyGameResult(format, rawDate, dealer, dealerGameCount, finalNotifyItems);
        log.notify = "sent";
      } else {
        log.notify = "no-function";
      }
    } catch (err) {
      log.notify = "ERR: " + err.message;
      Logger.log("Ошибка Telegram: " + err.message);
    }
    log.step = "done";
  } catch (err) {
    log.step = "ERR: " + err.message;
    Logger.log("Ошибка processFormSubmit: " + err.message);
  } finally {
    if (hasLock) {
      try { lock.releaseLock(); } catch (e) {}
    }
  }
  saveSubmitLog(log);
}

/**
 * Сохраняет последний статус обработки формы в скриптовое свойство
 * (используется для дистанционной диагностики через ?type=diag).
 */
function saveSubmitLog(log) {
  try {
    PropertiesService.getScriptProperties().setProperty("LAST_SUBMIT", JSON.stringify(log));
  } catch (e) {}
}

/**
 * Триггер / Функция фиксирования мест для Снапшота.
 * Хранит историю по дням: на каждую пару (дата, ник) — одна строка.
 * При повторном запуске в тот же день позиция перезаписывается, а не дублируется.
 *
 * Снапшот создаётся ТОЛЬКО в игровые дни (CONFIG.SNAPSHOT_DAYS).
 * В остальные дни функция ничего не делает — так мы избегаем пустых
 * «однотипных» снапшотов между играми. Можно ставить ежедневный триггер,
 * а функция сама отфильтрует нужные дни недели.
 */
function takeSnapshot() {
  // Пропускаем неигровые дни (чтобы не плодить снапшоты без динамики).
  var dayOfWeek = new Date().getDay();
  if (CONFIG.SNAPSHOT_DAYS.indexOf(dayOfWeek) === -1) {
    Logger.log("Снапшот пропущен: сегодня не игровой день (" + dayOfWeek + ")");
    return;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lbSheet = ss.getSheetByName(CONFIG.SHEETS.LEADERBOARD);
  var snapSheet = ss.getSheetByName(CONFIG.SHEETS.SNAPSHOTS);

  if (!lbSheet || !snapSheet) return;

  var lbData = lbSheet.getDataRange().getValues();
  if (lbData.length < 2) return;

  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  var toUpsert = {}; // ключ "дата|ник" -> позиция

  for (var i = 1; i < lbData.length; i++) {
    var pos = lbData[i][0];   // №
    var nick = lbData[i][2];  // никнейм
    if (pos && nick) {
      toUpsert[today + "|" + nick] = Number(pos);
    }
  }

  // Существующие строки держим в памяти, чтобы убрать дубли за текущий день
  var snapData = snapSheet.getDataRange().getValues();
  var kept = []; // [дата, ник, позиция]

  for (var s = 1; s < snapData.length; s++) {
    var sDate = normalizeDate(snapData[s][0]);      // всегда строка "yyyy-MM-dd"
    var sNick = snapData[s][1] ? String(snapData[s][1]) : "";
    var sPos = Number(snapData[s][2]) || 0;
    if (!sDate || !sNick) continue;

    if (sDate === today) {
      // сегодняшняя строка будет пересоздана из toUpsert — пропускаем старую
      continue;
    }
    kept.push([sDate, sNick, sPos]);
  }

  // Добавляем свежие (сегодня) из лидерборда
  for (var key in toUpsert) {
    var parts = key.split("|");
    kept.push([parts[0], parts[1], toUpsert[key]]);
  }

  // Сортируем по дате, затем по нику — для стабильности
  kept.sort(function(a, b) {
    if (a[0] !== b[0]) return a[0].localeCompare(b[0]);
    return String(a[1]).localeCompare(String(b[1]));
  });

  // Переписываем лист снапшотов целиком
  snapSheet.clear();
  snapSheet.appendRow(["Дата", "Имя (ник)", "Позиция"]);
  if (kept.length > 0) {
    snapSheet.getRange(2, 1, kept.length, 3).setValues(kept);
  }

  Logger.log("Снапшот сохранён/обновлён: " + today);
}

/**
 * Показать список установленных триггеров проекта и напомнить, какие нужны.
 * Полезно проверить, что снапшот НЕ ставится на каждый день вручную
 * (функция takeSnapshot и так сама отфильтрует игровые дни).
 */
function checkSnapshotTriggers() {
  var ui = SpreadsheetApp.getUi();
  var triggers;
  try {
    triggers = ScriptApp.getProjectTriggers();
  } catch (e) {
    ui.alert("Не удалось прочитать триггеры: " + e.message);
    return;
  }

  var lines = [];
  lines.push("=== ТРИГГЕРЫ ПРОЕКТА ===");
  if (triggers.length === 0) {
    lines.push("Установленных триггеров нет.");
  } else {
    triggers.forEach(function(t, idx) {
      var line = (idx + 1) + ". " + t.getHandlerFunction();
      try { line += " [event: " + t.getEventType().toString() + "]"; } catch (e) {}
      try { line += " [src: " + t.getTriggerSource().toString() + "]"; } catch (e) {}
      lines.push(line);
    });
  }

  lines.push("");
  lines.push("Снапшот takeSnapshot пишется ТОЛЬКО в дни: " +
             (CONFIG.SNAPSHOT_DAYS || []).join(", ") +
             " (JS getDay: 0=вс,...,3=ср,5=пт,6=сб).");
  lines.push("Остальные дни пропускаются самой функцией.");

  ui.alert(lines.join("\n"));
}

/**
 * Главный Webhook эндпоинт для обработки входящих HTTP POST запросов (Telegram Bot Webhook)
 */
function doPost(e) {
  try {
    if (typeof handleDealerBotWebhook === "function") {
      return handleDealerBotWebhook(e);
    }
  } catch (err) {
    Logger.log("Ошибка обработки doPost: " + err.message);
  }
  return ContentService.createTextOutput(JSON.stringify({ status: "ok" }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Диагностика готовности дилерского бота и ТВ-инфраструктуры
 */
function diagnoseDealerBotAndTv() {
  var props = PropertiesService.getScriptProperties();
  var dealerToken = props.getProperty("DEALER_BOT_TOKEN") || props.getProperty("TELEGRAM_BOT_TOKEN") || (typeof CONFIG !== "undefined" && CONFIG.DEALER_BOT_TOKEN ? CONFIG.DEALER_BOT_TOKEN : "");
  var firebaseUrl = props.getProperty("FIREBASE_DB_URL");
  
  if (!firebaseUrl && typeof CONFIG !== "undefined" && CONFIG.FIREBASE_DB_URL) {
    firebaseUrl = CONFIG.FIREBASE_DB_URL;
    try {
      props.setProperty("FIREBASE_DB_URL", firebaseUrl);
    } catch (e) {}
  }

  var lines = [];
  lines.push("=== ДИАГНОСТИКА БОТА И ТВ ===");
  lines.push("1. Токен бота: " + (dealerToken ? "✅ Задан (" + dealerToken.substring(0, 8) + "…)" : "❌ НЕ задан (DEALER_BOT_TOKEN)"));
  lines.push("2. База Firebase: " + (firebaseUrl ? "✅ Задана (" + firebaseUrl + ")" : "❌ НЕ задана (FIREBASE_DB_URL)"));
  
  var structures = Object.keys((typeof CONFIG !== "undefined" && CONFIG.BLIND_STRUCTURES) ? CONFIG.BLIND_STRUCTURES : {});
  lines.push("3. Пресеты блайндов: " + (structures.length > 0 ? "✅ " + structures.join(", ") : "❌ Не найдены"));
  
  if (dealerToken && firebaseUrl) {
    lines.push("\n🎉 Все системы дилерского пульта и ТВ-дашборда настроены и готовы к работе!");
  } else {
    lines.push("\nДля настройки секретов запустите Setup.js -> setupSecrets()");
  }

  try {
    SpreadsheetApp.getUi().alert(lines.join("\n"));
  } catch (e) {
    Logger.log(lines.join("\n"));
  }
}