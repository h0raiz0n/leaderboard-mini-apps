// ==========================================
// СИНХРОНИЗАЦИЯ С FIREBASE REALTIME DB (REST API)
// Антикафе «Атмосфера»
// ==========================================

/**
 * Получение базового URL Firebase из скриптовых свойств
 */
function getFirebaseBaseUrl() {
  var url = getScriptProperty("FIREBASE_DB_URL", "");
  if (!url && typeof CONFIG !== "undefined" && CONFIG.FIREBASE_DB_URL) {
    url = CONFIG.FIREBASE_DB_URL;
  }
  if (!url) return "";
  // Убираем закрывающий слеш если есть
  return url.replace(/\/+$/, "");
}

/**
 * Получение секретного ключа базы данных Firebase (если включены приватные правила)
 */
function getFirebaseSecret() {
  return getScriptProperty("FIREBASE_AUTH_SECRET", "");
}

/**
 * Сохранение состояния стола в Firebase Realtime Database через REST API
 * @param {string} tableId Идентификатор стола (например dealer_vlad)
 * @param {Object} tableState Объект состояния стола
 */
function syncTableToFirebase(tableId, tableState) {
  var baseUrl = getFirebaseBaseUrl();
  
  // Если URL базы не настроен — пишем в локальный кэш Apps Script (fallback)
  if (!baseUrl) {
    try {
      var cache = CacheService.getScriptCache();
      cache.put("TABLE_" + tableId, JSON.stringify(tableState), 21600);
      var activeList = JSON.parse(cache.get("ACTIVE_TABLES_LIST") || "[]");
      if (activeList.indexOf(tableId) === -1) {
        activeList.push(tableId);
        cache.put("ACTIVE_TABLES_LIST", JSON.stringify(activeList), 21600);
      }
    } catch (e) {}
    return true;
  }

  var secret = getFirebaseSecret();
  var authParam = secret ? "?auth=" + encodeURIComponent(secret) : "";
  var endpoint = baseUrl + "/atmosphere/tables/" + encodeURIComponent(tableId) + ".json" + authParam;

  var payload = JSON.stringify(tableState);
  var options = {
    method: "put",
    contentType: "application/json",
    payload: payload,
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(endpoint, options);
    var code = response.getResponseCode();
    if (code >= 200 && code < 300) {
      return true;
    } else {
      Logger.log("Firebase sync error (" + code + "): " + response.getContentText());
      return false;
    }
  } catch (err) {
    Logger.log("Firebase network error: " + err.message);
    return false;
  }
}

/**
 * Чтение состояния стола из Firebase Realtime Database
 * @param {string} tableId Идентификатор стола
 * @returns {Object|null}
 */
function getTableFromFirebase(tableId) {
  var baseUrl = getFirebaseBaseUrl();

  // Fallback на CacheService
  if (!baseUrl) {
    try {
      var cache = CacheService.getScriptCache();
      var cached = cache.get("TABLE_" + tableId);
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return null;
  }

  var secret = getFirebaseSecret();
  var authParam = secret ? "?auth=" + encodeURIComponent(secret) : "";
  var endpoint = baseUrl + "/atmosphere/tables/" + encodeURIComponent(tableId) + ".json" + authParam;

  try {
    var response = UrlFetchApp.fetch(endpoint, { method: "get", muteHttpExceptions: true });
    if (response.getResponseCode() === 200) {
      var data = JSON.parse(response.getContentText());
      return data;
    }
  } catch (err) {
    Logger.log("Firebase read error: " + err.message);
  }
  return null;
}

/**
 * Удаление стола или перевод в архив
 */
function removeTableFromFirebase(tableId) {
  var baseUrl = getFirebaseBaseUrl();
  if (!baseUrl) {
    try {
      CacheService.getScriptCache().remove("TABLE_" + tableId);
    } catch (e) {}
    return true;
  }

  var secret = getFirebaseSecret();
  var authParam = secret ? "?auth=" + encodeURIComponent(secret) : "";
  var endpoint = baseUrl + "/atmosphere/tables/" + encodeURIComponent(tableId) + ".json" + authParam;

  try {
    UrlFetchApp.fetch(endpoint, { method: "delete", muteHttpExceptions: true });
    return true;
  } catch (err) {
    Logger.log("Firebase delete error: " + err.message);
    return false;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getFirebaseBaseUrl,
    syncTableToFirebase,
    getTableFromFirebase,
    removeTableFromFirebase
  };
}
