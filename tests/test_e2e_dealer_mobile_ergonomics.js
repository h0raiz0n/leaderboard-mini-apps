/**
 * tests/test_e2e_dealer_mobile_ergonomics.js
 * 
 * Playwright E2E тест: Neo-Cockpit Mobile Ergonomics (Этап 4.2).
 * 
 * Проверяет:
 * 1. Эмуляцию мобильных экранов:
 *    - iPhone SE (375x667)
 *    - iPhone 14 (390x844)
 *    - Google Pixel 7 (412x915)
 * 2. Нулевой скролл на активном экране: document.documentElement.scrollHeight <= window.innerHeight + 2.
 * 3. Физическую высоту кнопок управления: #btn-pause >= 54px, #btn-step >= 54px.
 * 4. Пульсирующее ощущение статуса (Breathing Status Pulse): изумрудный при running, янтарный при paused.
 * 5. Взаимодействия: Пауза, Возобновление, Шаг уровня через тост подтверждения (#confirm-step-toast).
 * 6. Сохранение скриншотов:
 *    - tests/screenshots/09_dealer_se.png
 *    - tests/screenshots/10_dealer_iphone14.png
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright");

const TIMEOUT_GUARD = setTimeout(() => {
  console.error("❌ E2E Playwright тест эргономики пульта дилера превысил лимит времени (35 сек)!");
  process.exit(1);
}, 35000);
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
    if (reqPath === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }

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

const TEST_DEVICES = [
  {
    name: "iPhone SE",
    viewport: { width: 375, height: 667 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    screenshotName: "09_dealer_se.png"
  },
  {
    name: "iPhone 14",
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    screenshotName: "10_dealer_iphone14.png"
  },
  {
    name: "Google Pixel 7",
    viewport: { width: 412, height: 915 },
    userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    screenshotName: null
  }
];

(async () => {
  console.log("📱 Запуск Playwright E2E теста: Neo-Cockpit Mobile Ergonomics (iPhone SE, 14, Android)...\n");

  const server = createLocalServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  console.log(`[1/5] 🌐 Локальный HTTP-сервер запущен: http://127.0.0.1:${port}`);

  let browser;
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
  } catch (e) {
    browser = await chromium.launch({ headless: true });
  }
  console.log(`[2/5] 🖥️ Headless Chromium браузер запущен: v${browser.version()}`);

  try {
    for (let i = 0; i < TEST_DEVICES.length; i++) {
      const dev = TEST_DEVICES[i];
      console.log(`\n[3/5.${i + 1}] 📱 Тестирование устройства: ${dev.name} (${dev.viewport.width}x${dev.viewport.height}):`);

      const context = await browser.newContext({
        viewport: dev.viewport,
        userAgent: dev.userAgent,
        deviceScaleFactor: dev.deviceScaleFactor,
        isMobile: dev.isMobile,
        hasTouch: dev.hasTouch
      });

      // Заглушка внешних CDN
      await context.route(url => url.pathname.endsWith(".js") && (url.hostname.includes("telegram") || url.hostname.includes("gstatic")), route => {
        route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: "/* Mock External CDN */"
        });
      });

      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${port}/dealer/?mock=1&dealer=Влад`, { waitUntil: "domcontentloaded" });

      // Ожидание активной карточки управления
      await page.waitForSelector("#control-card", { state: "visible", timeout: 5000 });
      console.log(`   ✅ Карточка управления активна на ${dev.name}.`);

      // 1. Проверка отсутствия паразитного скролла (Zero-scroll: scrollHeight <= innerHeight + 2)
      const scrollMetrics = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        clientHeight: document.documentElement.clientHeight,
        bodyHeight: document.body.offsetHeight
      }));

      assert(
        scrollMetrics.scrollHeight <= scrollMetrics.innerHeight + 2,
        `Обнаружен паразитный скролл на ${dev.name}: scrollHeight=${scrollMetrics.scrollHeight}, innerHeight=${scrollMetrics.innerHeight}`
      );
      console.log(`   ✅ Нулевой скролл подтвержден: scrollHeight (${scrollMetrics.scrollHeight}px) <= innerHeight (${scrollMetrics.innerHeight}px).`);

      // 2. Проверка физических размеров кнопок (HIG: >= 54px)
      const pauseBox = await page.locator("#btn-pause").boundingBox();
      assert(pauseBox && pauseBox.height >= 54, `Высота кнопки Пауза (${pauseBox ? pauseBox.height : null}px) должна быть >= 54px`);

      const stepBox = await page.locator("#btn-step").boundingBox();
      assert(stepBox && stepBox.height >= 54, `Высота кнопки Шаг (${stepBox ? stepBox.height : null}px) должна быть >= 54px`);
      console.log(`   ✅ Эргономика кнопок подтверждена: Пауза = ${pauseBox.height.toFixed(1)}px, Шаг = ${stepBox.height.toFixed(1)}px (>= 54px).`);

      // 3. Проверка пульсации статуса (Breathing Status Pulse)
      const runningStatus = await page.evaluate(() => {
        return document.body.classList.contains("status-running") || document.body.dataset.gameStatus === "running";
      });
      assert(runningStatus, `Индикатор статуса running должен быть активен`);
      console.log("   ✅ Изумрудный пульсирующий статус running подтвержден.");

      // 4. Проверка клика по кнопке Пауза -> paused -> возобновление
      await page.click("#btn-pause");
      await new Promise(r => setTimeout(r, 350));

      const pausedStatus = await page.evaluate(() => {
        const t = typeof getMyTable === "function" ? getMyTable() : null;
        return t && t.status === "paused" && (document.body.classList.contains("status-paused") || document.body.dataset.gameStatus === "paused");
      });
      assert(pausedStatus, `После нажатия на паузу должен активироваться статус paused`);
      console.log("   ✅ Янтарный пульсирующий статус paused подтвержден.");

      // Возобновление игры
      await page.click("#btn-pause");
      await new Promise(r => setTimeout(r, 350));
      const resumedStatus = await page.evaluate(() => {
        const t = typeof getMyTable === "function" ? getMyTable() : null;
        return t && t.status === "running";
      });
      assert(resumedStatus, `После повторного клика статус стола должен возобновиться в running`);
      console.log("   ✅ Возобновление игры после паузы подтверждено.");

      // 5. Проверка безопасного перехода на следующий уровень и защиты от случайных нажатий (Undo / Confirm)
      const initialLevel = await page.evaluate(() => typeof getMyTable === "function" ? getMyTable().levelIndex : -1);
      await page.click("#btn-step");
      await new Promise(r => setTimeout(r, 250));

      const undoVisible = await page.evaluate(() => {
        const snackbar = document.getElementById("undo-level-snackbar");
        return snackbar && snackbar.style.display !== "none";
      });
      assert(undoVisible, `При нажатии на #btn-step должен отображаться защитный снэкбар отмены #undo-level-snackbar на ${dev.name}`);
      console.log("   ✅ Защитный снэкбар отмены перехода уровня (Undo) отображен.");

      const steppedLevel = await page.evaluate(() => typeof getMyTable === "function" ? getMyTable().levelIndex : -1);
      assert(steppedLevel > initialLevel, `Уровень блайндов должен увеличиться после клика: ${initialLevel} -> ${steppedLevel}`);

      // Проверка отката (Undo)
      await page.click("#btn-undo-level");
      await new Promise(r => setTimeout(r, 250));
      const revertedLevel = await page.evaluate(() => typeof getMyTable === "function" ? getMyTable().levelIndex : -1);
      assert.strictEqual(revertedLevel, initialLevel, `Кнопка Undo должна возвращать уровень обратно: ${revertedLevel} === ${initialLevel}`);
      console.log(`   ✅ Защитный откат шага уровня (Undo) подтвержден (${steppedLevel} ➔ ${revertedLevel}).`);

      // Повторный шаг на следующий уровень для актуализации состояния
      await page.click("#btn-step");
      await new Promise(r => setTimeout(r, 250));
      const nextLevel = await page.evaluate(() => typeof getMyTable === "function" ? getMyTable().levelIndex : -1);
      assert(nextLevel > initialLevel, `Уровень блайндов должен зафиксироваться на новом значении: ${nextLevel}`);

      // Проверка резервного тоста подтверждения перехода (showStepToast / dismissStepToast)
      await page.evaluate(() => {
        if (typeof showStepToast === "function") showStepToast();
      });
      await new Promise(r => setTimeout(r, 150));
      const toastVisible = await page.evaluate(() => {
        const toast = document.getElementById("confirm-step-toast");
        return toast && toast.style.display !== "none";
      });
      assert(toastVisible, `Тост подтверждения #confirm-step-toast должен отображаться`);

      await page.click("#btn-toast-cancel");
      await new Promise(r => setTimeout(r, 150));
      const toastDismissed = await page.evaluate(() => {
        const toast = document.getElementById("confirm-step-toast");
        return toast && toast.style.display === "none";
      });
      assert(toastDismissed, `Тост #confirm-step-toast должен скрываться по кнопке отмены`);
      console.log("   ✅ Защитный модальный тост подтверждения #confirm-step-toast проверен.");

      // 6. Сохранение скриншотов
      if (dev.screenshotName) {
        const shotPath = path.join(SCREENSHOTS_DIR, dev.screenshotName);
        await page.screenshot({ path: shotPath });
        console.log(`   📸 Скриншот сохранен: ${shotPath}`);
      }

      await context.close();
    }

    console.log("\n[4/5] 📸 Скриншоты для мобильных устройств успешно записаны в tests/screenshots/.");
  } finally {
    if (browser) await browser.close();
    server.close();
  }

  console.log("\n[5/5] 🎉 ВСЕ ТЕСТЫ МОБИЛЬНОЙ ЭРГОНОМИКИ ПУЛЬТА ВЕДУЩЕГО УСПЕШНО ПРОЙДЕНЫ!");
  process.exit(0);
})().catch(err => {
  console.error("❌ Ошибка выполнения Playwright теста мобильной эргономики:", err);
  process.exit(1);
});
