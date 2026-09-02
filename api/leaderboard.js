/**
 * Vercel Serverless Function: High-Speed Edge Proxy for Leaderboard API
 * Покерная экосистема «Атмосфера»
 * 
 * Обеспечивает:
 * 1. Ультрабыстрый отклик (<40ms) через Vercel Edge CDN кэширование.
 * 2. Полное устранение CORS-ошибок.
 * 3. Автоматическое следование по 302-редиректам Google Apps Script.
 */

const https = require("https");

const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbzk4Vf7L71rIUtOKfNbFDtzJ5fQI_8VPFVErB12jhJPoMaAxmGiRxqLVDzoKTT6ocTBDQ/exec";
const GAS_URL = process.env.GAS_LEADERBOARD_URL || DEFAULT_GAS_URL;

function fetchUrl(targetUrl, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error("Too many redirects"));

    https.get(targetUrl, (res) => {
      // Обработка редиректов 301 / 302 (характерно для Google Apps Script)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location, maxRedirects - 1));
      }

      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    }).on("error", (err) => {
      reject(err);
    });
  });
}

module.exports = async (req, res) => {
  // Настройка CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const queryString = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
    const target = GAS_URL + queryString;

    const result = await fetchUrl(target);

    // Кэширование на CDN Vercel: 60 сек свежести, 300 сек фонового обновления
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    try {
      const parsed = JSON.parse(result.data);
      return res.status(200).json(parsed);
    } catch (parseErr) {
      // Если GAS отдал сырую строку или HTML
      return res.status(result.statusCode || 200).send(result.data);
    }
  } catch (err) {
    console.error("Leaderboard Edge Proxy Error:", err);
    return res.status(502).json({
      success: false,
      error: "Ошибка подключения к бэкенду лидерборда: " + err.message
    });
  }
};
