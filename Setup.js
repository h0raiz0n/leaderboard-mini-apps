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

  if (props.getProperty("DEALER_BOT_TOKEN")) {
    msgs.push("DEALER_BOT_TOKEN: задан (для @atmosphere_dealer_bot)");
  } else {
    msgs.push("DEALER_BOT_TOKEN: НЕ задан — выполните setSecret(\"DEALER_BOT_TOKEN\", \"ваш_токен_дилер_бота\")");
  }

  if (props.getProperty("FIREBASE_DB_URL")) {
    msgs.push("FIREBASE_DB_URL: задан");
  } else {
    msgs.push("FIREBASE_DB_URL: НЕ задан — выполните setSecret(\"FIREBASE_DB_URL\", \"https://ваш-проект.firebaseio.com\")");
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
  var maskedToken = token ? token.substring(0, 8) + "…" : "(не задан)";
  var dealerToken = props.getProperty("DEALER_BOT_TOKEN") || "";
  var maskedDealerToken = dealerToken ? dealerToken.substring(0, 8) + "…" : "(не задан)";
  var adminKey = props.getProperty("ADMIN_KEY") || "";
  var maskedAdminKey = adminKey ? adminKey.substring(0, 4) + "…" : "(не задан)";

  Logger.log("TELEGRAM_BOT_TOKEN: " + maskedToken);
  Logger.log("TELEGRAM_CHAT_ID: " + (props.getProperty("TELEGRAM_CHAT_ID") || "(не задан)"));
  Logger.log("DEALER_BOT_TOKEN: " + maskedDealerToken);
  Logger.log("FIREBASE_DB_URL: " + (props.getProperty("FIREBASE_DB_URL") || "(не задан)"));
  Logger.log("PUBLIC_SPREADSHEET_ID: " + (props.getProperty("PUBLIC_SPREADSHEET_ID") || "(не задан)"));
  Logger.log("ADMIN_KEY: " + maskedAdminKey);
}

/**
 * Быстрая установка боевых секретов для дилерского бота и Firebase
 */
function setupDealerBotAndFirebase() {
  var props = PropertiesService.getScriptProperties();
  
  // Устанавливаем токен бота @atmosphere_poker_dealer_bot
  props.setProperty("DEALER_BOT_TOKEN", "8946471319:AAHKuZK8hcgebOvuNyHi21o5tjlbU7S0hG8");
  
  // Устанавливаем URL базы Firebase
  props.setProperty("FIREBASE_DB_URL", "https://atmosphere-poker-default-rtdb.europe-west1.firebasedatabase.app");
  
  Logger.log("✅ Секреты DEALER_BOT_TOKEN и FIREBASE_DB_URL успешно сохранены!");
  try {
    SpreadsheetApp.getUi().alert("Успешно!\n\nТокен дилерского бота и URL Firebase сохранены в свойства скрипта.");
  } catch (e) {}
}

/**
 * Регистрация Webhook в Telegram для @atmosphere_poker_dealer_bot
 * @param {string} [customUrl] URL деплоя Web App (например https://script.google.com/macros/s/.../exec)
 */
function setTelegramWebhookForDealerBot(customUrl) {
  var token = getScriptProperty("DEALER_BOT_TOKEN", "");
  if (!token) {
    var err1 = "⚠️ Ошибка: DEALER_BOT_TOKEN не задан в скриптовых свойствах!";
    Logger.log(err1);
    try { SpreadsheetApp.getUi().alert(err1); } catch (e) {}
    return;
  }

  var webAppUrl = customUrl || getScriptProperty("WEB_APP_EXEC_URL", "");
  if (!webAppUrl) {
    var err2 = "⚠️ Укажите URL деплоя вашего Web App (/exec) при вызове функции или сохраните в свойство WEB_APP_EXEC_URL!";
    Logger.log(err2);
    try { SpreadsheetApp.getUi().alert(err2); } catch (e) {}
    return;
  }

  var url = "https://api.telegram.org/bot" + token + "/setWebhook?url=" + encodeURIComponent(webAppUrl);
  try {
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var respText = response.getContentText();
    Logger.log("Telegram setWebhook response: " + respText);
    try {
      SpreadsheetApp.getUi().alert("Результат регистрации Webhook:\n\n" + respText);
    } catch (e) {}
  } catch (err) {
    Logger.log("Ошибка setWebhook: " + err.message);
  }
}

/**
 * Проверка текущего статуса Webhook у Telegram
 */
function getDealerBotWebhookInfo() {
  var token = getScriptProperty("DEALER_BOT_TOKEN", "");
  if (!token) return;

  var url = "https://api.telegram.org/bot" + token + "/getWebhookInfo";
  try {
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var respText = response.getContentText();
    Logger.log("getWebhookInfo: " + respText);
    try {
      SpreadsheetApp.getUi().alert("Статус Webhook в Telegram:\n\n" + respText);
    } catch (e) {}
  } catch (err) {
    Logger.log("Ошибка getWebhookInfo: " + err.message);
  }
}

