/**
 * NETWORK GUARD: Hermetic Test Isolation for Atmosphere Poker
 * Антикафе «Атмосфера»
 * 
 * Перехватывает глобальный fetch и модуль https в среде Node.js при запуске тестов.
 * Полностью блокирует реальные исходящие сетевые запросы к боевым Firebase и Telegram API,
 * обслуживая их через изолированное in-memory хранилище процесса.
 */

const https = require("https");
const http = require("http");
const { EventEmitter } = require("events");

// Изолированное in-memory состояние для тестов
const inMemoryFirebaseStore = {
  atmosphere: {
    tables: {},
    mtt_session: null,
    dealers_registry: {
      LIST: ["Арина", "Арташес", "Влад", "Всеволод", "Дима", "Маша", "Нинель", "Паша", "Рома", "Саша", "Тимур", "Эмилия"],
      MAP: {
        "arina_makk": "Арина",
        "arbuzmane": "Арташес",
        "h0raiz0n": "Влад",
        "dsh838": "Всеволод",
        "sntrpe": "Дима",
        "starynskaya": "Маша",
        "ninel_mr": "Нинель",
        "trick_str": "Паша",
        "klimovichroman": "Рома",
        "alexsan2186": "Саша",
        "hezadono": "Тимур",
        "assyyyra": "Эмилия"
      }
    }
  }
};

function parsePath(urlStr) {
  try {
    const u = new URL(urlStr, "https://mock.local");
    return u.pathname.replace(/^\/+/, "").replace(/\.json$/, "");
  } catch (e) {
    return urlStr.replace(/^https?:\/\/[^\/]+\//, "").replace(/\.json$/, "").split("?")[0];
  }
}

function getStoreNode(path) {
  const parts = path.split("/").filter(Boolean);
  let cur = inMemoryFirebaseStore;
  for (const part of parts) {
    if (!cur || typeof cur !== "object") return null;
    cur = cur[part];
  }
  return cur;
}

function setStoreNode(path, val, merge = false) {
  const parts = path.split("/").filter(Boolean);
  let cur = inMemoryFirebaseStore;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!cur[part] || typeof cur[part] !== "object") {
      cur[part] = {};
    }
    cur = cur[part];
  }
  const last = parts[parts.length - 1];
  if (merge && typeof cur[last] === "object" && typeof val === "object") {
    cur[last] = Object.assign({}, cur[last], val);
  } else {
    cur[last] = val;
  }
}

function deleteStoreNode(path) {
  const parts = path.split("/").filter(Boolean);
  let cur = inMemoryFirebaseStore;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!cur || !cur[part]) return;
    cur = cur[part];
  }
  if (cur && parts.length > 0) {
    delete cur[parts[parts.length - 1]];
  }
}

// 1. Перехват глобального fetch (Node.js 18+)
if (typeof global !== "undefined") {
  const originalFetch = global.fetch;

  global.fetch = async function mockFetch(resource, init = {}) {
    const urlStr = typeof resource === "string" ? resource : (resource && resource.url ? resource.url : "");
    const method = String(init.method || "GET").toUpperCase();

    const isFirebase = urlStr.includes("firebasedatabase.app") || urlStr.includes("firebaseio.com");
    const isTelegram = urlStr.includes("api.telegram.org");

    if (!isFirebase && !isTelegram) {
      if (typeof originalFetch === "function") {
        return originalFetch(resource, init);
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => "{}" };
    }

    // Обработка Telegram API
    if (isTelegram) {
      return {
        ok: true,
        status: 200,
        headers: new Headers ? new Headers({ "content-type": "application/json" }) : {},
        json: async () => ({ ok: true, result: { message_id: 9999 } }),
        text: async () => JSON.stringify({ ok: true, result: { message_id: 9999 } })
      };
    }

    // Обработка Firebase Realtime Database
    const cleanPath = parsePath(urlStr);
    let parsedBody = null;
    if (init.body) {
      try {
        parsedBody = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
      } catch (e) {
        parsedBody = init.body;
      }
    }

    if (method === "GET") {
      const data = getStoreNode(cleanPath);
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(JSON.stringify(data || null)),
        text: async () => JSON.stringify(data || null)
      };
    }

    if (method === "PUT") {
      setStoreNode(cleanPath, parsedBody, false);
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(JSON.stringify(parsedBody || {})),
        text: async () => JSON.stringify(parsedBody || {})
      };
    }

    if (method === "PATCH") {
      setStoreNode(cleanPath, parsedBody, true);
      const updated = getStoreNode(cleanPath);
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(JSON.stringify(updated || {})),
        text: async () => JSON.stringify(updated || {})
      };
    }

    if (method === "DELETE") {
      deleteStoreNode(cleanPath);
      return {
        ok: true,
        status: 200,
        json: async () => null,
        text: async () => "null"
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => "{}"
    };
  };
}

// 2. Перехват модуля https.request для утилит и старых тестов
const originalHttpsRequest = https.request;
https.request = function mockHttpsRequest(urlOrOptions, optionsOrCallback, maybeCallback) {
  let urlStr = "";
  let callback = null;

  if (typeof urlOrOptions === "string") {
    urlStr = urlOrOptions;
    callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
  } else if (urlOrOptions && typeof urlOrOptions === "object") {
    const host = urlOrOptions.hostname || urlOrOptions.host || "";
    const path = urlOrOptions.path || "/";
    urlStr = `https://${host}${path}`;
    callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
  }

  const isGuarded = urlStr.includes("firebasedatabase.app") || urlStr.includes("firebaseio.com") || urlStr.includes("api.telegram.org");

  if (!isGuarded && typeof originalHttpsRequest === "function") {
    return originalHttpsRequest.apply(https, arguments);
  }

  const reqEmitter = new EventEmitter();
  let reqBody = "";

  reqEmitter.write = function (chunk) {
    if (chunk) reqBody += chunk.toString();
    return true;
  };

  reqEmitter.end = function (chunk) {
    if (chunk) reqBody += chunk.toString();

    process.nextTick(() => {
      const resEmitter = new EventEmitter();
      resEmitter.statusCode = 200;
      resEmitter.headers = { "content-type": "application/json" };

      let responseData = JSON.stringify({ ok: true, status: "mocked" });

      if (urlStr.includes("api.telegram.org")) {
        responseData = JSON.stringify({ ok: true, result: { message_id: 1234 } });
      } else if (urlStr.includes("firebasedatabase.app")) {
        const cleanPath = parsePath(urlStr);
        let parsed = null;
        try { parsed = JSON.parse(reqBody); } catch (e) {}

        if (parsed) {
          setStoreNode(cleanPath, parsed, true);
        }
        responseData = JSON.stringify(getStoreNode(cleanPath) || { status: "verified" });
      }

      if (typeof callback === "function") {
        callback(resEmitter);
      }
      reqEmitter.emit("response", resEmitter);

      resEmitter.emit("data", Buffer.from(responseData));
      resEmitter.emit("end");
    });

    return reqEmitter;
  };

  return reqEmitter;
};

// Экспорт для явного использования в тестах при необходимости
module.exports = {
  inMemoryFirebaseStore,
  resetStore: () => {
    inMemoryFirebaseStore.atmosphere.tables = {};
    inMemoryFirebaseStore.atmosphere.mtt_session = null;
  }
};
