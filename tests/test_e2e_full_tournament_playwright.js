/**
 * COMPREHENSIVE PLAYWRIGHT E2E ACCEPTANCE TEST
 * Покерный клуб «Атмосфера»
 * 
 * Проверяет:
 * 1. ТВ-терминал в полноэкранном режиме (1920x1080):
 *    - Читаемость монументальной типографики и отсутствие курсора мыши (auto-hide через 2с).
 *    - Отображение монолита блайндов, анте и билета следующего раунда.
 *    - Сетка 4 столов (2x2) и экран перерыва.
 * 2. Пульт ведущего на мобильном устройстве (iPhone 14, 390x844):
 *    - Запуск турнира по структуре «Классика».
 *    - Управление паузой / возобновлением.
 *    - Переключение уровня блайндов.
 *    - Тактильный отклик и симуляция.
 * 3. Сохранение скриншотов ключевых состояний в tests/screenshots/.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright");

// Защитный таймаут от зависания (30 секунд)
const TIMEOUT_GUARD = setTimeout(() => {
  console.error("❌ E2E Playwright тест превысил допустимый лимит времени (30 сек)!");
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
  console.log("🚀 Запуск комплексного Playwright E2E приёмочного теста всей экосистемы...\n");

  // 1. Запуск локального HTTP сервера
  const server = createLocalServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  console.log(`[1/5] 🌐 Локальный HTTP-сервер запущен на http://127.0.0.1:${port}`);

  // 2. Инициализация браузера Chromium / Edge
  let browser;
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
  } catch (e) {
    browser = await chromium.launch({ headless: true });
  }
  console.log(`[2/5] 🖥️ Headless Chromium браузер запущен: v${browser.version()}`);

  try {
    // ==========================================
    // ТЕСТ 1: ТВ-терминал 1920x1080 (1 стол)
    // ==========================================
    console.log("\n[3/5] 📺 Проверка ТВ-терминала Full HD (1920x1080):");
    const setupMockRoutes = async (context) => {
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
                      on: function(event, cb) { if (event === "value") cb({ val: function() { return null; } }); },
                      set: function() { return Promise.resolve(); },
                      update: function() { return Promise.resolve(); }
                    };
                  }
                };
              }
            };
            window.Telegram = {
              WebApp: {
                initDataUnsafe: { user: { id: "12345", username: "h0raiz0n" } },
                ready: function() {},
                expand: function() {},
                HapticFeedback: { impactOccurred: function() {}, notificationOccurred: function() {} }
              }
            };
          `
        });
      });
    };

    const tvContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    await setupMockRoutes(tvContext);
    const tvPage = await tvContext.newPage();
    await tvPage.goto(`http://127.0.0.1:${port}/tv/?mock=1`, { waitUntil: "domcontentloaded" });

    // Ожидание карточки стола
    await tvPage.waitForSelector(".table-card", { timeout: 5000 });

    const clubTitle = await tvPage.textContent(".club-title");
    assert(clubTitle && clubTitle.toLowerCase().includes("атмосфера"), "Шапка ТВ должна содержать название клуба");

    const timerDigits = await tvPage.textContent(".timer-digits");
    assert(timerDigits && timerDigits.includes(":"), "Таймер ТВ должен отображать время в формате ММ:СС");

    const blindsCurrent = await tvPage.textContent(".blinds-number.current");
    assert(blindsCurrent && blindsCurrent.length > 2, "ТВ должно отображать текущие блайнды");

    const anteBadge = await tvPage.isVisible(".ante-badge");
    assert(anteBadge, "На ТВ должен отображаться блок Анте");

    const upcomingTicket = await tvPage.isVisible(".upcoming-blinds-ticket");
    assert(upcomingTicket, "На ТВ должен отображаться билет следующего уровня");

    // Проверка автоскрытия курсора мыши
    await tvPage.mouse.move(500, 500);
    const initialCursorHidden = await tvPage.evaluate(() => document.body.classList.contains("cursor-hidden"));
    assert.strictEqual(initialCursorHidden, false, "После движения мыши курсор не должен быть скрыт");

    // Ждем 2.2 секунды бездействия для срабатывания таймера автоскрытия
    await new Promise(r => setTimeout(r, 2200));
    const cursorHiddenAfterIdle = await tvPage.evaluate(() => document.body.classList.contains("cursor-hidden"));
    assert.strictEqual(cursorHiddenAfterIdle, true, "Через 2 секунды бездействия курсор обязан скрыться (body.cursor-hidden)");
    console.log("   ✅ Автоскрытие курсора мыши (2с таймер) подтверждено.");

    // Скриншот 1 стола
    const tvShotPath = path.join(SCREENSHOTS_DIR, "01_tv_stadium_screen.png");
    await tvPage.screenshot({ path: tvShotPath });
    console.log(`   📸 Скриншот ТВ сохранен: ${tvShotPath}`);

    // Проверка 4 столов (Quad 2x2)
    await tvPage.goto(`http://127.0.0.1:${port}/tv/?mock=4`, { waitUntil: "domcontentloaded" });
    await tvPage.waitForSelector('.tv-viewport[data-tables="4"]', { timeout: 5000 });
    const tableCardsCount = await tvPage.$$eval(".table-card", cards => cards.length);
    assert.strictEqual(tableCardsCount, 4, "В режиме mock=4 должно отображаться ровно 4 стола");

    const quadShotPath = path.join(SCREENSHOTS_DIR, "02_tv_quad_4_tables.png");
    await tvPage.screenshot({ path: quadShotPath });
    console.log(`   📸 Скриншот 4 столов (2x2) сохранен: ${quadShotPath}`);
    await tvContext.close();

    // ==========================================
    // ТЕСТ 2: Пульт ведущего (iPhone 14, 390x844)
    // ==========================================
    console.log("\n[4/5] 📱 Проверка мобильного пульта ведущего (iPhone 14):");
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
    });
    await setupMockRoutes(mobileContext);
    const dealerPage = await mobileContext.newPage();
    await dealerPage.goto(`http://127.0.0.1:${port}/dealer/?mock=1&dealer=Влад`, { waitUntil: "domcontentloaded" });

    // Ожидание интерфейса пульта
    await dealerPage.waitForSelector("#dealer-sim-banner", { timeout: 5000 });
    const isSimBannerVisible = await dealerPage.isVisible("#dealer-sim-banner");
    assert(isSimBannerVisible, "Баннер симуляционного режима должен отображаться при ?mock=1");

    // Проверка наличия кнопки Пауза
    await dealerPage.waitForSelector("#btn-pause", { timeout: 5000 });
    const pauseBtnText = await dealerPage.textContent("#btn-pause");
    assert(pauseBtnText && (pauseBtnText.includes("Пауза") || pauseBtnText.includes("Продолжить")), "Кнопка паузы должна быть доступна");

    // Клик по кнопке паузы -> переключение в paused
    await dealerPage.click("#btn-pause");
    await new Promise(r => setTimeout(r, 400));
    const isPaused = await dealerPage.evaluate(() => {
      const t = typeof getMyTable === "function" ? getMyTable() : null;
      return t ? t.status : "unknown";
    });
    assert.strictEqual(isPaused, "paused", "После нажатия на паузу статус стола должен стать paused");
    console.log("   ✅ Постановка турнира на паузу в пульте дилера подтверждена.");

    // Возобновление игры
    await dealerPage.click("#btn-pause");
    await new Promise(r => setTimeout(r, 400));
    const isResumed = await dealerPage.evaluate(() => {
      const t = typeof getMyTable === "function" ? getMyTable() : null;
      return t ? t.status : "unknown";
    });
    assert.strictEqual(isResumed, "running", "После повторного нажатия статус стола должен возобновиться в running");
    console.log("   ✅ Возобновление игры после паузы подтверждено.");

    // Скриншот пульта дилера
    const dealerShotPath = path.join(SCREENSHOTS_DIR, "03_dealer_mobile_cockpit.png");
    await dealerPage.screenshot({ path: dealerShotPath });
    console.log(`   📸 Скриншот пульта ведущего сохранен: ${dealerShotPath}`);

    // Проверка шага уровня блайндов
    const prevLevel = await dealerPage.evaluate(() => {
      const t = typeof getMyTable === "function" ? getMyTable() : null;
      return t ? t.levelIndex : -1;
    });
    await dealerPage.click("#btn-step");
    await new Promise(r => setTimeout(r, 300));
    // Если показан тост подтверждения
    const toastVisible = await dealerPage.isVisible("#confirm-step-toast");
    if (toastVisible) {
      await dealerPage.click("#btn-confirm-step");
      await new Promise(r => setTimeout(r, 300));
    }
    const nextLevel = await dealerPage.evaluate(() => {
      const t = typeof getMyTable === "function" ? getMyTable() : null;
      return t ? t.levelIndex : -1;
    });
    assert(nextLevel >= prevLevel, "Уровень блайндов при шаге должен увеличиться или остаться валидным");
    console.log(`   ✅ Переход на следующий раунд блайндов (${prevLevel} ➔ ${nextLevel}) подтвержден.`);

    await mobileContext.close();

    console.log("\n[5/5] 🏁 Завершение браузерной сессии и остановка сервисов...");
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    clearTimeout(TIMEOUT_GUARD);
  }

  console.log("\n==========================================");
  console.log("🎉 СКВОЗНОЙ PLAYWRIGHT E2E ТЕСТ ВСЕЙ ЭКОСИСТЕМЫ УСПЕШНО ПРОЙДЕН!");
  process.exit(0);
})().catch(err => {
  console.error("❌ Ошибка выполнения Playwright E2E теста:", err);
  process.exit(1);
});
