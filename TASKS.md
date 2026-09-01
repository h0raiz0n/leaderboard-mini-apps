# 📋 План спринта разработки: ТВ-таймеры и бот дилеров

Спринт разбит на атомарные шаги. Каждый шаг реализует конкретный модуль, проверяется автоматическим тестом и фиксируется отдельным Git-коммитом.

В точке **Шаг 4** работа приостанавливается для ввода внешних параметров (токен BotFather, URL Firebase, ID полей Google Form).

---

## 🏗 Фаза 1. Автономная разработка и тестирование компонентов

### [x] Шаг 1. Движок Telegram-бота в Apps Script (`DealerBot.js`)
* **Что делаем:**
  * Реализуем обработчик Webhook в Apps Script (`doPost` / `handleDealerUpdate`).
  * Меню выбора формата (`SnG`, `Mystery`, `MTT`) и структуры (`Стандарт 7 мин`, `Турбо 5 мин`).
  * Живое сообщение управления с кнопками (`Пауза / Продолжить`, `След. раунд`, `Завершить игру`).
  * Механизм защиты от отмены: кнопка `[ ❌ Сбросить запуск ]` исчезает через 3 минуты.
  * Генератор ссылок на предзаполненную Google Form с подстановкой даты и имени ведущего.
* **Тест:** `tests/test_dealer_bot.js` (проверка парсинга callback_data, генерации inline-клавиатур, таймаута кнопки сброса и сборки prefilled URL).
* **Git-коммит:** `feat(bot): implement Telegram inline keyboard dealer engine and form prefill`

---

### [x] Шаг 2. Интеграция шины Firebase и 4K ТВ-дашборда (`tv/` & `FirebaseSync.js`)
* **Что делаем:**
  * Добавляем отправку состояния столов из Apps Script в Firebase Realtime DB (REST API) без сторонних библиотек.
  * Обновляем `tv/tv.js` и `tv/styles.css` для подписки на Firebase и плавной адаптивной сетки на 1, 2, 3 и 4 стола с именами ведущих («Стол ведущего Влад»).
  * Реализуем отображение 10-минутного таймера перерыва после завершения стола.
* **Тест:** `tests/test_tv_sync.js` (проверка сериализации состояния столов, расчета времени без дрифта, переключения сеток 1–4 стола и триггера перерыва).
* **Git-коммит:** `feat(sync): add Firebase REST bridge and dealer-centric 4-table TV dashboard`

---

### [x] Шаг 3. Конфигурация, секреты и меню админки (`Config.js`, `Setup.js`, `Code.js`)
* **Что делаем:**
  * Вносим настройки секретов (`DEALER_BOT_TOKEN`, `FIREBASE_DB_URL`, `FORM_ENTRY_IDS`) в `Setup.js`.
  * Добавляем пункт в меню Google Таблиц: `♠️ POKER ADMIN` $\rightarrow$ `🎛️ ДИАГНОСТИКА БОТА И ТВ`.
  * Добавляем валидатор доступности вебхука и корректности структур.
* **Тест:** `tests/test_config_diagnostics.js` (проверка чтения свойств, маскирования токенов и валидации структур).
* **Git-коммит:** `feat(config): add dealer bot properties, form IDs, and admin diagnostics`

---

## 🛑 Фаза 2. Точка передачи параметров (Требуются действия пользователя)

### [x] Шаг 4. Ввод внешних доступов и настройка сервисов
* **Токен дилерского бота:** `@atmosphere_poker_dealer_bot` (привязан в `Setup.js`).
* **База Firebase:** `https://atmosphere-poker-default-rtdb.europe-west1.firebasedatabase.app` (привязана в `Config.js`, `Setup.js`, `tv.js`).
* **Поля предзаполнения Google Form:** `entry.1615126251` (Дата) и `entry.1887911518` (Ведущий) (привязаны в `Config.js` и `DealerBot.js`).

---

## 🚀 Фаза 3. Развёртывание и боевой тест

### [ ] Шаг 5. Деплой Web App, установка Webhook и сквозной тест
* **Что делаем:**
  * Деплой новой версии Google Apps Script Web App (`clasp push` / Web App deployment).
  * Регистрация Webhook в Telegram (`setWebhook`).
  * Сквозной тест: Клик в Telegram $\rightarrow$ Изменение на ТВ $\rightarrow$ Завершение $\rightarrow$ Запись в `DB_Results` $\rightarrow$ Лидерборд.
* **Тест:** Сквозной интеграционный тест связки.
* **Git-коммит:** `chore(release): deploy dealer bot webhook and verify end-to-end flow`
