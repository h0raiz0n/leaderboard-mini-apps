// ==========================================
// НАСТРОЙКА БЕЗОПАСНОСТИ (секреты в скриптовых свойствах)
// ==========================================
// Секреты (токен бота, chat-id) НЕ хранятся в коде. Задайте их один раз
// в скриптовые свойства:
//   setSecret("TELEGRAM_BOT_TOKEN", "ваш_токен")
//   setSecret("TELEGRAM_CHAT_ID", "ваш_chat_id")
// setupSecrets() подтянет PUBLIC_SPREADSHEET_ID (из CONFIG или уже заданный)
// и покажет, какие секреты осталось установить.

function setupSecrets() {
  var props = PropertiesService.getScriptProperties();
  var msgs = [];

  var pubId = props.getProperty("PUBLIC_SPREADSHEET_ID");
  if (!pubId) {
    pubId = CONFIG.PUBLIC_SPREADSHEET_ID;
    if (pubId && pubId.indexOf("ВСТАВЬ") === -1) {
      props.setProperty("PUBLIC_SPREADSHEET_ID", pubId);
    }
  }
  msgs.push(pubId && pubId.indexOf("ВСТАВЬ") === -1
    ? "PUBLIC_SPREADSHEET_ID: задан"
    : "PUBLIC_SPREADSHEET_ID: не задан");

  if (props.getProperty("TELEGRAM_BOT_TOKEN")) {
    msgs.push("TELEGRAM_BOT_TOKEN: задан");
  } else {
    msgs.push("TELEGRAM_BOT_TOKEN: НЕ задан — выполните setSecret(\"TELEGRAM_BOT_TOKEN\", \"ваш_токен\")");
  }

  if (props.getProperty("TELEGRAM_CHAT_ID")) {
    msgs.push("TELEGRAM_CHAT_ID: задан");
  } else {
    msgs.push("TELEGRAM_CHAT_ID: НЕ задан — выполните setSecret(\"TELEGRAM_CHAT_ID\", \"ваш_chat_id\")");
  }

  if (props.getProperty("ADMIN_KEY")) {
    msgs.push("ADMIN_KEY: задан");
  } else {
    msgs.push("ADMIN_KEY: НЕ задан — выполните setSecret(\"ADMIN_KEY\", \"ваш_секрет\") для доступа к диагностическим эндпоинтам");
  }

  Logger.log("Настройка секретов:\n" + msgs.join("\n"));
  try {
    SpreadsheetApp.getUi().alert("Настройка секретов\n\n" + msgs.join("\n"));
  } catch (e) {}
}

/**
 * Установить один секрет в скриптовые свойства.
 * @param {string} key   Имя свойства (например "TELEGRAM_BOT_TOKEN")
 * @param {string} value Значение
 */
function setSecret(key, value) {
  if (!key || value === undefined || value === null) {
    Logger.log("setSecret: укажите ключ и значение");
    return;
  }
  PropertiesService.getScriptProperties().setProperty(String(key).trim(), String(value));
  Logger.log("Свойство '" + key + "' сохранено в скриптовые свойства.");
}

/**
 * Достаёт ID таблицы из URL или возвращает как есть, если это уже ID.
 */
function extractSpreadsheetId(urlOrId) {
  if (!urlOrId) return "";
  if (urlOrId.indexOf("/spreadsheets/d/") > -1) {
    var m = urlOrId.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (m) return m[1];
  }
  return urlOrId;
}

/**
 * Показать, какие свойства заданы (маскируя токен).
 */
function showConfiguredSecrets() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty("TELEGRAM_BOT_TOKEN") || "";
  var masked = token ? token.substring(0, 8) + "…" : "(не задан)";
  Logger.log("TELEGRAM_BOT_TOKEN: " + masked);
  Logger.log("TELEGRAM_CHAT_ID: " + (props.getProperty("TELEGRAM_CHAT_ID") || "(не задан)"));
  Logger.log("PUBLIC_SPREADSHEET_ID: " + (props.getProperty("PUBLIC_SPREADSHEET_ID") || "(не задан)"));
}
