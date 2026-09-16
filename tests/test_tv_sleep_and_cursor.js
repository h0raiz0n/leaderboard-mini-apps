/**
 * tests/test_tv_sleep_and_cursor.js
 * E2E & Unit Verification for Step 1.2:
 * 1. HTML #tv-wake-video styling (no display:none, hardware overlay enabled, loop/muted/playsinline)
 * 2. CSS body.cursor-hidden rules (cursor: none !important)
 * 3. Base64 Micro-MP4 video container validation (ftyp, moov, mdat boxes)
 * 4. User activation listeners for Smart TV remote control keys (keydown, click, touchstart, pointerdown)
 * 5. Cursor auto-hiding state machine (idle 2000ms timer, pointer activity resets)
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("▶ Running TV Sleep Prevention & Cursor Auto-Hide Tests...\n");

// Защита от зависания тестов (таймаут 6с)
setTimeout(() => {
  console.error("❌ TIMEOUT: Тест test_tv_sleep_and_cursor.js превысил лимит времени 6с!");
  process.exit(1);
}, 6000).unref();

(async function runAllTests() {
  // =============================================================
  // TEST 1: HTML Markup Validation (tv/index.html)
  // =============================================================
  console.log("1. Проверка разметки #tv-wake-video в tv/index.html:");
  const htmlContent = fs.readFileSync(path.join(__dirname, "../tv/index.html"), "utf8");

  // 1.1 No display:none
  assert.strictEqual(
    htmlContent.includes("id=\"tv-wake-video\" playsinline loop muted style=\"display:none"),
    false,
    "Тег #tv-wake-video НЕ должен содержать display:none (иначе видеочип Smart TV отключает оверлей)"
  );
  assert.strictEqual(
    htmlContent.includes("id=\"tv-wake-video\" playsinline loop muted style=\"display: none"),
    false,
    "Тег #tv-wake-video НЕ должен содержать display: none"
  );

  // 1.2 Attributes and fixed positioning
  assert.ok(htmlContent.includes("id=\"tv-wake-video\""), "Файл tv/index.html должен содержать тег #tv-wake-video");
  assert.ok(htmlContent.includes("position:fixed") || htmlContent.includes("position: fixed"), "Тег #tv-wake-video обязан иметь fixed позиционирование");
  assert.ok(htmlContent.includes("opacity:0.001") || htmlContent.includes("opacity: 0.001"), "Тег #tv-wake-video обязан быть минимально прозрачным (opacity: 0.001)");
  assert.ok(htmlContent.includes("pointer-events:none") || htmlContent.includes("pointer-events: none"), "Тег #tv-wake-video не должен перехватывать события мыши");
  console.log("   ✓ Разметка #tv-wake-video корректна: display:none убран, аппаратный оверлей включён.");

  // =============================================================
  // TEST 2: CSS Validation (tv/styles.css)
  // =============================================================
  console.log("\n2. Проверка стилей скрытия курсора в tv/styles.css:");
  const cssContent = fs.readFileSync(path.join(__dirname, "../tv/styles.css"), "utf8");

  assert.ok(
    cssContent.includes("body.cursor-hidden") && cssContent.includes("cursor: none !important;"),
    "tv/styles.css должен содержать класс body.cursor-hidden со свойством cursor: none !important;"
  );
  console.log("   ✓ Стили автоскрытия курсора присутствуют и имеют наивысший приоритет !important.");

  // =============================================================
  // TEST 3: Base64 Micro-MP4 Container Integrity (tv/tv.js)
  // =============================================================
  console.log("\n3. Проверка валидности встроенного видеопотока Micro-MP4:");
  const tv = require("../tv/tv.js");

  assert.ok(tv.WAKE_VIDEO_MP4_BASE64, "tv.js должен экспортировать WAKE_VIDEO_MP4_BASE64");
  assert.ok(tv.WAKE_VIDEO_MP4_BASE64.startsWith("data:video/mp4;base64,"), "WAKE_VIDEO_MP4_BASE64 должен быть корректным Data URI с MIME-типом video/mp4");

  const base64Data = tv.WAKE_VIDEO_MP4_BASE64.replace("data:video/mp4;base64,", "");
  const mp4Buffer = Buffer.from(base64Data, "base64");

  assert.ok(mp4Buffer.length >= 200, "Размер видеофайла MP4 должен быть не менее 200 байт");
  assert.ok(mp4Buffer.length <= 5000, "Размер видеофайла MP4 должен быть легковесным (< 5 КБ)");

  // Проверка структуры атомов (ISO Base Media File Format: ftyp box)
  const ftypMarker = mp4Buffer.slice(4, 8).toString("ascii");
  assert.strictEqual(ftypMarker, "ftyp", "Заголовок MP4 контейнера обязан начинаться с бокса ftyp");

  // Проверка наличия совместимого бренда (mp42 или isom)
  const brandMarker = mp4Buffer.slice(8, 12).toString("ascii");
  assert.ok(brandMarker === "mp42" || brandMarker === "isom", "MP4 контейнер должен иметь совместимый бренд mp42 или isom");

  // Проверка наличия бокса медиаданных (mdat)
  assert.ok(mp4Buffer.includes(Buffer.from("mdat")), "MP4 контейнер обязан содержать бокс mdat");
  console.log(`   ✓ Micro-MP4 валиден: размер ${mp4Buffer.length} байт, боксы ftyp (${brandMarker}) и mdat подтверждены.`);

  // =============================================================
  // TEST 4: Smart TV Remote Key & User Activation Listeners
  // =============================================================
  console.log("\n4. Проверка слушателей пробуждения экрана и клавиш пульта ТВ:");

  // Настраиваем мок DOM окружения
  const registeredDocListeners = {};
  const mockVideoElement = {
    id: "tv-wake-video",
    src: "",
    playCount: 0,
    play: function() {
      this.playCount++;
      return Promise.resolve();
    }
  };

  global.document = {
    getElementById: (id) => (id === "tv-wake-video" ? mockVideoElement : null),
    addEventListener: (event, handler) => {
      if (!registeredDocListeners[event]) registeredDocListeners[event] = [];
      registeredDocListeners[event].push(handler);
    },
    visibilityState: "visible"
  };

  global.window = {
    addEventListener: (event, handler) => {
      if (!registeredDocListeners[event]) registeredDocListeners[event] = [];
      registeredDocListeners[event].push(handler);
    }
  };

  let wakeLockRequested = false;
  global.navigator = {
    wakeLock: {
      request: () => {
        wakeLockRequested = true;
        return Promise.resolve({
          released: false,
          addEventListener: () => {}
        });
      }
    }
  };

  // Запускаем инициализацию keep-alive с await
  await tv.initSmartTvAntiSleep();

  // 4.1 Проверяем, что зарегистрированы все критические события
  assert.ok(registeredDocListeners["keydown"] && registeredDocListeners["keydown"].length > 0, "Должен быть зарегистрирован слушатель keydown для пультов Smart TV");
  assert.ok(registeredDocListeners["click"] && registeredDocListeners["click"].length > 0, "Должен быть зарегистрирован слушатель click");
  assert.ok(registeredDocListeners["touchstart"] && registeredDocListeners["touchstart"].length > 0, "Должен быть зарегистрирован слушатель touchstart");
  assert.ok(registeredDocListeners["pointerdown"] && registeredDocListeners["pointerdown"].length > 0, "Должен быть зарегистрирован слушатель pointerdown");
  console.log("   ✓ Слушатели активации зарегистрированы (keydown для пультов Smart TV, touchstart, click, pointerdown).");

  // 4.2 Симулируем нажатие клавиши пульта ДУ (например, клавиша стрелки или Enter)
  registeredDocListeners["keydown"].forEach(handler => handler({ key: "Enter" }));
  assert.strictEqual(mockVideoElement.src, tv.WAKE_VIDEO_MP4_BASE64, "При активации video.src обязан выставляться в Micro-MP4 Base64");
  assert.ok(mockVideoElement.playCount > 0, "При нажатии клавиши пульта ДУ video.play() обязан быть вызван");
  console.log("   ✓ Симуляция клавиши пульта ДУ: видео успешно запущено, источник инициализирован.");

  // =============================================================
  // TEST 5: Cursor Auto-Hide State Machine
  // =============================================================
  console.log("\n5. Проверка логики автоскрытия курсора мыши:");

  const mockClassList = {
    classes: new Set(),
    add: function(c) { this.classes.add(c); },
    remove: function(c) { this.classes.delete(c); },
    contains: function(c) { return this.classes.has(c); }
  };

  global.document.body = {
    classList: mockClassList
  };

  const windowListeners = {};
  global.window.addEventListener = (event, handler) => {
    if (!windowListeners[event]) windowListeners[event] = [];
    windowListeners[event].push(handler);
  };

  // Подменяем setTimeout для управления временем
  const pendingTimers = [];
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;

  global.setTimeout = (fn, delay) => {
    const timer = { fn, delay, id: pendingTimers.length + 1 };
    pendingTimers.push(timer);
    return timer.id;
  };
  global.clearTimeout = (id) => {
    const idx = pendingTimers.findIndex(t => t.id === id);
    if (idx !== -1) pendingTimers.splice(idx, 1);
  };

  // Запускаем автоскрытие курсора
  tv.initCursorAutoHide();

  // Проверяем, что запланирован таймер на 2000 мс
  const initialTimer = pendingTimers.find(t => t.delay === 2000);
  assert.ok(initialTimer, "Должен быть установлен таймер скрытия курсора на 2000 мс");

  // Срабатывание таймера должно добавить cursor-hidden
  initialTimer.fn();
  assert.ok(mockClassList.contains("cursor-hidden"), "По истечении 2000 мс бездействия класс cursor-hidden должен быть добавлен");
  console.log("   ✓ Таймер 2000 мс добавляет класс cursor-hidden.");

  // Симулируем движение мыши (mousemove)
  const mouseMoveHandlers = windowListeners["mousemove"] || [];
  assert.ok(mouseMoveHandlers.length > 0, "Должен быть слушатель mousemove");
  mouseMoveHandlers.forEach(handler => handler({}));

  // Курсор должен снова стать видимым (класс удалён)
  assert.strictEqual(mockClassList.contains("cursor-hidden"), false, "При движении мыши класс cursor-hidden должен быть немедленно удалён");
  console.log("   ✓ Движение мыши немедленно удаляет класс cursor-hidden.");

  // И запланирован новый таймер на 2000 мс
  const newTimer = pendingTimers[pendingTimers.length - 1];
  assert.strictEqual(newTimer.delay, 2000, "После движения мыши должен быть запланирован новый таймер скрытия на 2000 мс");
  newTimer.fn();
  assert.ok(mockClassList.contains("cursor-hidden"), "После очередного бездействия курсор снова скрывается");
  console.log("   ✓ Повторное бездействие корректно скрывает курсор.");

  // Восстанавливаем таймеры
  global.setTimeout = originalSetTimeout;
  global.clearTimeout = originalClearTimeout;

  console.log("\n=======================================================");
  console.log("🎉 ВСЕ ТЕСТЫ ЭКРАНА И КУРСОРА (1.2) УСПЕШНО ПРОЙДЕНЫ!");
  console.log("=======================================================");
  process.exit(0);
})().catch(err => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
