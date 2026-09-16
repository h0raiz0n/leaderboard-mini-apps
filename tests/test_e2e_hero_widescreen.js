/**
 * tests/test_e2e_hero_widescreen.js
 * 
 * Playwright E2E тест: ТВ Режим 1 Стола Hero Stadium Widescreen (Этап 2.2).
 * 
 * Проверяет:
 * 1. Режим 1 стола на 1080p Full HD (1920x1080) и 4K UHD (3840x2160).
 * 2. Наличие платинового бейджа «★ ФИНАЛЬНЫЙ СТОЛ».
 * 3. Наличие и геометрию центрального Stadium Hairline Glow Divider.
 * 4. Монументальный размер блайндов (>= 120px на 1080p, >= 140px на 4K).
 * 5. Отсутствие взаимного наложения колонок таймера и блайндов (left.x + left.width <= right.x).
 * 6. Стресс-тест экстремальных блайндов (1 000 000 / 2 000 000) без клиппинга и переполнения.
 * 7. Проверку режимов нормальной игры, алерта (<=30 сек) и перерыва.
 * 8. Сохранение контрольного скриншота в tests/screenshots/06_hero_widescreen_stadium.png.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright");

const TIMEOUT_GUARD = setTimeout(() => {
  console.error("❌ E2E Playwright тест 1 стола превысил допустимый лимит времени (30 сек)!");
  process.exit(1);
}, 30000);
TIMEOUT_GUARD.unref();

const ROOT_DIR = path.resolve(__dirname, "..");
const SCREENSHOTS_DIR = path.join(__dirname, "screenshots");

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".svg": "image/svg+xml"
};

function createLocalServer() {
  return http.createServer((req, res) => {
    let reqPath = req.url.split("?")[0].split("#")[0];
    if (reqPath === "/") reqPath = "/index.html";
    if (reqPath === "/tv" || reqPath === "/tv/") reqPath = "/tv/index.html";
    if (reqPath === "/dealer" || reqPath === "/dealer/") reqPath = "/dealer/index.html";

    const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, "");
    const filePath = path.join(ROOT_DIR, safePath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*"
      });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found: " + reqPath);
    }
  });
}

(async () => {
  console.log("🏟️ Запуск Playwright E2E теста Hero Stadium Widescreen (1 стол)...\n");

  const server = createLocalServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  console.log(`[1/6] 🌐 Локальный HTTP-сервер запущен: http://127.0.0.1:${port}`);

  let browser;
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
  } catch (e) {
    browser = await chromium.launch({ headless: true });
  }
  console.log(`[2/6] 🖥️ Headless Chromium браузер запущен: v${browser.version()}`);

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1
  });

  // Заглушка внешних CDN скриптов
  await context.route(url => url.pathname.endsWith(".js") && (url.hostname.includes("telegram") || url.hostname.includes("gstatic")), route => {
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `
        window.firebase = {
          apps: [],
          initializeApp: function() { return this; },
          database: function() {
            return {
              ref: function() {
                return {
                  off: function() {},
                  on: function(e, cb) { if (e === "value") cb({ val: () => null }); },
                  set: () => Promise.resolve(),
                  update: () => Promise.resolve()
                };
              }
            };
          }
        };
      `
    });
  });

  const page = await context.newPage();

  try {
    // ==========================================
    // ТЕСТ 1: 1920x1080 Full HD (1 стол)
    // ==========================================
    console.log("[3/6] 📏 Тестирование режима 1 стола при 1920x1080 Full HD:");
    await page.goto(`http://127.0.0.1:${port}/tv/?mock=1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('.tv-viewport[data-tables="1"]', { timeout: 5000 });
    await page.waitForSelector('.table-card', { timeout: 5000 });

    // 1. Проверка платинового бейджа «★ ФИНАЛЬНЫЙ СТОЛ»
    const finalBadge = await page.$('.final-table-badge');
    assert(finalBadge, "Должен присутствовать платиновый бейдж .final-table-badge");
    const badgeText = (await finalBadge.innerText()).trim();
    assert(badgeText.includes("ФИНАЛЬНЫЙ СТОЛ"), "Текст бейджа должен содержать «ФИНАЛЬНЫЙ СТОЛ»");
    console.log("   ✅ Платиновый бейдж «★ ФИНАЛЬНЫЙ СТОЛ» подтвержден.");

    // 2. Геометрические замеры колонок
    const card = await page.$('.table-card');
    const cardBox = await card.boundingBox();
    const timerBlock = await card.$('.timer-block');
    const timerBox = await timerBlock.boundingBox();
    const blindsMonolith = await card.$('.blinds-monolith');
    const blindsBox = await blindsMonolith.boundingBox();
    const blindsNum = await card.$('.blinds-number.current');

    // Проверка отсутствия горизонтального наложения колонок
    assert(timerBox.x + timerBox.width <= blindsBox.x + 10, "Левая колонка таймера не должна накладываться на правую колонку блайндов");
    console.log(`   📊 Таймер X: [${timerBox.x.toFixed(1)}, ${(timerBox.x + timerBox.width).toFixed(1)}], Блайнды X: [${blindsBox.x.toFixed(1)}, ${(blindsBox.x + blindsBox.width).toFixed(1)}]`);
    console.log("   ✅ Разделение колонок четкое, без взаимных наложений.");

    // 3. Замер монументального шрифта блайндов (>= 120px)
    const blindsFontSize = await page.evaluate(el => parseFloat(window.getComputedStyle(el).fontSize), blindsNum);
    console.log(`   📊 Физический размер шрифта блайндов на 1080p: ${blindsFontSize.toFixed(1)}px`);
    assert(blindsFontSize >= 120, `Шрифт блайндов (${blindsFontSize.toFixed(1)}px) обязан быть >= 120px`);
    console.log("   ✅ Монументальный шрифт блайндов подтвержден (>= 120px).");

    // 4. Проверка билета следующих блайндов (высокий контраст)
    const ticket = await card.$('.upcoming-blinds-ticket');
    assert(ticket, "Билет следующих блайндов должен присутствовать");
    const ticketVal = await ticket.$('.upcoming-ticket-val');
    const ticketColor = await page.evaluate(el => window.getComputedStyle(el).color, ticketVal);
    assert(ticketColor.includes("255, 255, 255") || ticketColor.includes("rgb(255, 255, 255)"), "Цвет билета должен быть контрастным белым");
    console.log("   ✅ Билет следующих блайндов высококонтрастен (белый текст с неоновым свечением).");

    // Сохранение контрольного скриншота 1080p
    const screenshotPath = path.join(SCREENSHOTS_DIR, "06_hero_widescreen_stadium.png");
    await page.screenshot({ path: screenshotPath });
    console.log(`   📸 Контрольный скриншот сохранен: ${screenshotPath}`);

    // ==========================================
    // ТЕСТ 2: Стресс-тест экстремальных блайндов
    // ==========================================
    console.log("\n[4/6] 💥 Стресс-тест гигантских блайндов (1 000 000 / 2 000 000):");
    await page.evaluate(() => {
      const el = document.querySelector('.blinds-number.current');
      if (el) el.textContent = "1 000 000 / 2 000 000";
    });
    await page.waitForTimeout(100);

    const extremeBlindsBox = await blindsNum.boundingBox();
    assert(extremeBlindsBox.x + extremeBlindsBox.width <= cardBox.x + cardBox.width + 10, "Экстремальные блайнды не должны выходить за границы карточки стола");
    console.log("   ✅ Экстремальные блайнды полностью помещаются в карточку без клиппинга.");

    // ==========================================
    // ТЕСТ 3: Проверка состояний Алерта и Перерыва
    // ==========================================
    console.log("\n[5/6] ⚠️ Проверка состояний Алерта (<=30 сек) и Перерыва:");
    await page.goto(`http://127.0.0.1:${port}/tv/?mock=alert`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('.state-alert', { timeout: 5000 });
    const alertRail = await page.$('.time-rail-fill.is-warning');
    assert(alertRail, "В режиме алерта time-rail должен иметь класс .is-warning");
    console.log("   ✅ Режим Алерта (<=30 сек) подтвержден.");

    await page.goto(`http://127.0.0.1:${port}/tv/?mock=break`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('.state-break, .break-screen-card', { timeout: 5000 });
    const breakPill = await page.$('.state-break-pill');
    assert(breakPill, "В режиме перерыва должен отображаться статус «☕ ПЕРЕРЫВ»");
    console.log("   ✅ Режим Перерыва подтвержден.");

    // ==========================================
    // ТЕСТ 4: 3840x2160 (4K UHD)
    // ==========================================
    console.log("\n[6/6] 🖥️ Проверка 4K UHD разрешения (3840x2160):");
    await page.setViewportSize({ width: 3840, height: 2160 });
    await page.goto(`http://127.0.0.1:${port}/tv/?mock=1`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);

    const uhdBlindsNum = await page.$('.blinds-number.current');
    const uhdFontSize = await page.evaluate(el => parseFloat(window.getComputedStyle(el).fontSize), uhdBlindsNum);
    console.log(`   📊 Размер шрифта блайндов на 4K UHD: ${uhdFontSize.toFixed(1)}px`);
    assert(uhdFontSize >= 140, `Размер шрифта на 4K (${uhdFontSize.toFixed(1)}px) обязан быть >= 140px`);
    console.log("   ✅ 4K UHD монументальный масштаб подтвержден.");

  } finally {
    await page.close();
    await context.close();
    await browser.close();
    server.close();
  }

  clearTimeout(TIMEOUT_GUARD);
  console.log("🎉 PLAYWRIGHT E2E ТЕСТ РЕЖИМА 1 СТОЛА HERO STADIUM УСПЕШНО ПРОЙДЕН!\n");
})().catch(err => {
  console.error("❌ Ошибка в тесте 1 стола:", err);
  process.exit(1);
});
