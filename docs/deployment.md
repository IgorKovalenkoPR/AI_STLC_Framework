# Розгортання — покрокова інструкція

Час: ~20 хвилин. Виконує власник таблиці.

## Що вже готове

| Об'єкт | ID | Стан |
|---|---|---|
| [Таблиця](https://docs.google.com/spreadsheets/d/1eAF4qx9d3g6hQKqAm34ZO3HJwd1okfLF3cJrfleeeC8/edit) | `1eAF4qx9d3g6hQKqAm34ZO3HJwd1okfLF3cJrfleeeC8` | аркуші `AI QA Optimization`, `Legend & Sources`, `Form Responses 1` |
| [Форма](https://docs.google.com/forms/d/1nV4lfzdAIqe5l2UazTvc0dU_QqQMoJYIXOqDM3E04Z8/edit) | `1nV4lfzdAIqe5l2UazTvc0dU_QqQMoJYIXOqDM3E04Z8` | прив'язана до таблиці, поки лише порожній placeholder |

Обидва ID уже прописані у `Config.gs` (`FORM_ID`, `TARGET_SPREADSHEET_ID`) — вводити їх окремо не треба.

---

## Крок 0. Де має жити скрипт

Це вирішує, чи буде у вас меню «AI STLC» у таблиці.

| Як створено проєкт | Назва проєкту | Меню в таблиці | Що робити |
|---|---|---|---|
| **З таблиці**: `Розширення → Apps Script` | «Copy of AI QA Optimization_Target vs Actual.xlsx» | ✅ є | рекомендований варіант |
| З форми або окремо (script.google.com → New project) | інша назва, напр. «AI QA Optimization» | ❌ немає | усе працює, але функції запускаються з редактора |

**Як перевірити свій проєкт:** у редакторі Apps Script натисніть ліворуч іконку **ⓘ «Огляд» (Overview)** — там видно контейнер проєкту. Або просто відкрийте таблицю → `Розширення → Apps Script`: якщо відкриється порожній новий проєкт, ваш поточний прив'язаний не до таблиці.

> Проєкт із назвою **«AI QA Optimization»** — це назва форми, а не таблиці. Такий проєкт
> прив'язаний до форми або є окремим. Код це витримує (ID таблиці зашитий у `Config.gs`),
> але меню в таблиці не з'явиться.

**Рекомендація:** видалити поточний проєкт і створити новий із таблиці. Ви не втрачаєте нічого,
крім порожніх файлів, а отримуєте меню і зручні діалоги.

Якщо лишаєте як є — просто пропустіть згадки про меню: усі дії робляться через
`Виконати` в редакторі.

---

## Крок 1. Створити проєкт з таблиці

1. Відкрити [таблицю](https://docs.google.com/spreadsheets/d/1eAF4qx9d3g6hQKqAm34ZO3HJwd1okfLF3cJrfleeeC8/edit).
2. Меню `Розширення → Apps Script`. Відкриється редактор з одним файлом `Code.gs`.

---

## Крок 2. Створити 11 файлів

Потрібно рівно 11 файлів (плюс маніфест окремо):

```
Config   BuildForm   Parse   Compute   WriteSheet   Maturity
Formatting   Triggers   Recompute   Menu   Test
```

**Як створити файл:** у панелі `Файли` натиснути **＋** → `Скрипт` → ввести назву **без `.gs`**
(Apps Script додасть розширення сам) → Enter.

**Як перейменувати наявний:** навести курсор на файл → **⋮** праворуч від назви → `Перейменувати`.

**Якщо ви вже насоздавали `Untitled.gs`, `Untitled 2.gs`…** — не видаляйте їх, просто перейменуйте:

| Було | Стало |
|---|---|
| `Code.gs` | `Config` |
| `Untitled.gs` | `BuildForm` |
| `Untitled 2.gs` | `Parse` |
| `Untitled 3.gs` | `Compute` |
| `Untitled 4.gs` | `WriteSheet` |
| `Untitled 5.gs` | `Maturity` |
| `Untitled 6.gs` | `Formatting` |
| `Untitled 7.gs` | `Triggers` |
| `Untitled 8.gs` | `Recompute` |
| `Untitled 9.gs` | `Menu` |
| `Untitled 10.gs` | `Test` |
| `Untitled 11.gs` | зайвий — **⋮ → `Видалити`** |

> Назви файлів у Apps Script — суто косметичні: усі `.gs` виконуються в одному
> глобальному просторі імен, порядок не має значення. Але однакові з репозиторієм назви
> потрібні, щоб згодом можна було порівняти код і оновити його.

---

## Крок 3. Вставити код

Для кожного файла: відкрити його в редакторі, виділити весь наявний вміст
(`Ctrl/Cmd + A`) і вставити вміст однойменного файла з каталогу `apps-script/`.

Прямі посилання на «сирий» текст (відкрити → `Ctrl/Cmd + A` → `Ctrl/Cmd + C`):

| Файл | Посилання |
|---|---|
| Config | https://raw.githubusercontent.com/IgorKovalenkoPR/AI_STLC_Framework/claude/google-form-ai-stlc-metrics-4xkcfi/apps-script/Config.gs |
| BuildForm | https://raw.githubusercontent.com/IgorKovalenkoPR/AI_STLC_Framework/claude/google-form-ai-stlc-metrics-4xkcfi/apps-script/BuildForm.gs |
| Parse | https://raw.githubusercontent.com/IgorKovalenkoPR/AI_STLC_Framework/claude/google-form-ai-stlc-metrics-4xkcfi/apps-script/Parse.gs |
| Compute | https://raw.githubusercontent.com/IgorKovalenkoPR/AI_STLC_Framework/claude/google-form-ai-stlc-metrics-4xkcfi/apps-script/Compute.gs |
| WriteSheet | https://raw.githubusercontent.com/IgorKovalenkoPR/AI_STLC_Framework/claude/google-form-ai-stlc-metrics-4xkcfi/apps-script/WriteSheet.gs |
| Maturity | https://raw.githubusercontent.com/IgorKovalenkoPR/AI_STLC_Framework/claude/google-form-ai-stlc-metrics-4xkcfi/apps-script/Maturity.gs |
| Formatting | https://raw.githubusercontent.com/IgorKovalenkoPR/AI_STLC_Framework/claude/google-form-ai-stlc-metrics-4xkcfi/apps-script/Formatting.gs |
| Triggers | https://raw.githubusercontent.com/IgorKovalenkoPR/AI_STLC_Framework/claude/google-form-ai-stlc-metrics-4xkcfi/apps-script/Triggers.gs |
| Recompute | https://raw.githubusercontent.com/IgorKovalenkoPR/AI_STLC_Framework/claude/google-form-ai-stlc-metrics-4xkcfi/apps-script/Recompute.gs |
| Menu | https://raw.githubusercontent.com/IgorKovalenkoPR/AI_STLC_Framework/claude/google-form-ai-stlc-metrics-4xkcfi/apps-script/Menu.gs |
| Test | https://raw.githubusercontent.com/IgorKovalenkoPR/AI_STLC_Framework/claude/google-form-ai-stlc-metrics-4xkcfi/apps-script/Test.gs |

Зберігати можна один раз наприкінці: **💾 `Зберегти проєкт`** (`Ctrl/Cmd + S`).

**Перевірка:** у випадному списку функцій біля кнопки `Виконати` мають з'явитися
`setup`, `populateForm`, `recomputeAll`, `runSelfTest`. Якщо список порожній або є
червоні підкреслення — десь не вставився файл повністю.

---

## Крок 4. Маніфест `appsscript.json`

1. Ліворуч натиснути **⚙️ `Налаштування проєкту`**.
2. Увімкнути прапорець **«Показувати файл маніфесту appsscript.json у редакторі»**.
3. Повернутись у **`< >` Редактор** — у списку файлів з'явився `appsscript.json`.
4. Відкрити його, виділити все і вставити вміст
   [`apps-script/appsscript.json`](https://raw.githubusercontent.com/IgorKovalenkoPR/AI_STLC_Framework/claude/google-form-ai-stlc-metrics-4xkcfi/apps-script/appsscript.json).

> Якщо на кроці авторизації Google скаржиться на скоупи — видаліть із маніфесту
> увесь блок `"oauthScopes": [...]`. Apps Script визначить потрібні дозволи сам.

---

## Крок 5. Властивості скрипта

Там же, **⚙️ `Налаштування проєкту`** → прокрутити донизу до **`Властивості скрипта`** →
`Додати властивість`:

| Ключ | Значення | Обов'язково |
|---|---|---|
| `ACTIVE_PERIOD` | `Q3 2026` | так |
| `OWNER_EMAIL` | `ikovalenko@qarea.us` | ні, але варто — туди йдуть попередження |

Натиснути **`Зберегти властивості скрипта`**.

`FORM_ID`, `TARGET_SPREADSHEET_ID` і `SHEET_NAME` уже мають правильні значення в `Config.gs` —
додавати їх у властивості потрібно, лише якщо колись зміните форму чи таблицю.

---

## Крок 6. Запустити `setup()`

1. У редакторі, у випадному списку функцій біля кнопки `Виконати`, обрати **`setup`**.
2. Натиснути **▷ `Виконати`**.
3. З'явиться вікно авторизації:
   - `Переглянути дозволи` → обрати свій акаунт;
   - екран «Google не перевірив цей додаток» → **`Додатково`** → **`Перейти до …(небезпечно)`**;
     це нормально для власного скрипта, який ви щойно написали;
   - `Дозволити`.
4. Внизу відкриється **`Журнал виконання`** з рядком `Форма готова: https://docs.google.com/forms/...`

Що робить `setup()` за один прохід:

- **наповнює вашу форму** — видаляє поточні елементи (зокрема порожній placeholder)
  і будує 26 елементів заново; **посилання на форму не змінюється**, зібрані раніше
  відповіді не зникають;
- перевіряє прив'язку форми до таблиці (вона вже є — повторно не перепідключає);
- створює аркуші `Журнал відповідей`, `Зрілість AI`, `Покриття`;
- накладає умовне форматування на колонки `Actual, %`;
- ставить тригер `onFormSubmit`.

Повторний запуск безпечний.

**Якщо виконання впало:** текст помилки видно там само в `Журналі виконання`.
Найчастіші випадки — у таблиці «Траблшутинг» наприкінці цього файлу.

---

## Крок 7. Прибрати старий стовпець у відповідях

Аркуш `Form Responses 1` має колонку `Untitled Question` від порожнього
placeholder-питання. Після наповнення форми вона зайва: правий клік на заголовку
стовпця → `Видалити стовпець`. Нові колонки під питання Google додасть сам
при першій відповіді.

---

## Крок 8. Перевірити на тестовій відповіді

1. Відкрити форму (посилання з `Журналу виконання`), обрати проєкт **Auris**,
   період — той самий, що в `ACTIVE_PERIOD`.
2. У сітці «Чи використовуєте ви AI на цій фазі» поставити:
   - `3. Дизайн тестів` → `Так — використовуємо і маємо заміри`
   - `4. Налаштування середовища` → `Ні — специфіка продукту / проєкту`
   - `8. Автоматизація тестування` → `Ні — немає автоматизації / CI-CD / інструментів`
   - решту — на власний розсуд.
3. На кроці «На основі чого ви можете оцінити ефект?» обрати
   `Маю виміряні цифри (було / стало)`.
4. У полі фази 3 ввести `5 / 3.5`. Надіслати.

Очікуваний результат у рядку `Auris` (рядок 5) аркуша `AI QA Optimization`:

| Комірка | Значення | Колір |
|---|---|---|
| `J5` (Дизайн тестів) | `-30,0%` | зелений (Target −28% перевищено) |
| `L5` (Налаштування середовища) | `N/A — специфіка продукту` | сірий |
| `T5` (Автоматизація тестування) | `N/A — немає автоматизації / CI-CD` | сірий |

У `J5` має бути примітка з розрахунком, джерелом (`5 / 3.5`), статусом, рівнем довіри,
періодом і автором. У `Журналі відповідей` — рядок з дією `ЗАПИС`.

Після перевірки: у формі `Відповіді → ⋮ → Видалити всі відповіді`, потім у таблиці
меню **AI STLC ▸ Перерахувати все з відповідей** (або функція `recomputeAll` з редактора).

---

## Крок 9. Роздати посилання

Надіслати тім-лідам посилання на форму разом із [faq-teamleads.md](faq-teamleads.md).

За бажанням увімкнути щотижневе нагадування тим, хто не відзвітував: обрати в редакторі
функцію `installWeeklyReminder` і виконати її один раз (лист щопонеділка о 9:00 на `OWNER_EMAIL`).

---

## Запуск функцій без меню

Якщо проєкт не прив'язаний до таблиці, меню «AI STLC» не з'явиться. Усе те саме
робиться з редактора — обрати функцію у списку і натиснути `Виконати`:

| Дія | Функція |
|---|---|
| Повне налаштування | `setup` |
| Наповнити форму заново | `populateForm` |
| Перерахувати таблицю з відповідей | `recomputeAll` |
| Оновити умовне форматування | `applyFormatting` |
| Оновити звіт про покриття | `buildCoverage` |
| Знімок періоду | `snapshotPeriod` |
| Самоперевірка розрахунків | `runSelfTest` |

---

## Тести

Розрахунковий шар не залежить від Google API:

```bash
node tools/run-tests.js
```

У таблиці — меню **AI STLC ▸ Запустити самоперевірку**, або функція `runSelfTest`
з редактора (результат — у `Журналі виконання`, нічого не змінює).

---

## Траблшутинг

| Симптом | Причина / що робити |
|---|---|
| `Не вдалося визначити таблицю` | Скрипт не прив'язаний до таблиці і `TARGET_SPREADSHEET_ID` порожній. Додайте властивість `TARGET_SPREADSHEET_ID` = `1eAF4qx9d3g6hQKqAm34ZO3HJwd1okfLF3cJrfleeeC8` |
| `Аркуш «AI QA Optimization» не знайдено` | Вкладку перейменували → задати `SHEET_NAME` у властивостях скрипта |
| `Немає ITEM_MAP` | Форму наповнювали не через скрипт. Виконати `populateForm` |
| `ReferenceError: PHASES is not defined` | Файл `Config` порожній або вставлений не повністю |
| Меню «AI STLC» не з'явилось у таблиці | Проєкт не прив'язаний до таблиці (див. Крок 0) або таблицю треба перезавантажити (F5) |
| Відповідь надійшла, комірки порожні | Період відповіді ≠ `ACTIVE_PERIOD` → у журналі буде дія `ІНШИЙ ПЕРІОД` |
| `ПРОЄКТ НЕ ЗНАЙДЕНО` у журналі | Проєкт обрали зі списку, але рядка в колонці B немає. Додати рядок або доповнити `PROJECT_ALIASES` |
| Тім-лід відредагував надіслану відповідь, а таблиця не змінилась | Редагування не завжди запускає тригер → `recomputeAll` |
| Комірки не фарбуються | `applyFormatting` |
| У формі з'явилось зайве питання | Його додали кліками в UI. Скрипт його ігнорує — перенесіть зміну в `BuildForm.gs` і виконайте `populateForm` |
