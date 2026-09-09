/**
 * Config.gs — єдине джерело правди для збору метрик «Використання AI у STLC».
 *
 * Тут описано все, що потрібно решті скриптів: розкладка таблиці, 8 фаз STLC,
 * проєкти, тексти форми і контрольований словник міток.
 * Змінили тут — запустіть меню «AI STLC ▸ Наповнити форму».
 *
 * Значення, які перевизначаються без правки коду:
 * Файл → Налаштування проєкту → Властивості скрипта
 *   ACTIVE_PERIOD          напр. "Q3 2026" — період, який відображає таблиця
 *   OWNER_EMAIL            пошта для сповіщень
 *   SHEET_NAME             назва вкладки з таблицею
 *   FORM_ID                ID форми, яку наповнює скрипт
 *   TARGET_SPREADSHEET_ID  ID таблиці, якщо вона НЕ та, до якої прив'язаний скрипт
 */

var DEFAULTS = {
  // Форма і таблиця замовника (перевизначаються властивостями скрипта).
  FORM_ID: '1nV4lfzdAIqe5l2UazTvc0dU_QqQMoJYIXOqDM3E04Z8',
  TARGET_SPREADSHEET_ID: '1eAF4qx9d3g6hQKqAm34ZO3HJwd1okfLF3cJrfleeeC8',

  SHEET_NAME: 'AI QA Optimization',
  MATURITY_SHEET: 'Зрілість AI',
  LOG_SHEET: 'Журнал відповідей',
  COVERAGE_SHEET: 'Покриття',
  FEEDBACK_SHEET: 'Інструменти та відгуки',

  FIRST_DATA_ROW: 4,   // рядки 1–3 — об'єднаний заголовок
  COL_NUM: 1,          // A  #
  COL_PROJECT: 2,      // B  Project
  COL_AM: 3,           // C  Account manager
  COL_MODEL: 4,        // D  Model (DT / TM)

  ACTIVE_PERIOD: 'Q3 2026',
  OWNER_EMAIL: '',

  FORM_TITLE: 'AI QA Optimization',

  // Прапорці обсягу форми. Обидва false дають скорочену форму на 14 елементів.
  INCLUDE_MEASURED_HOURS_SECTION: true,
  INCLUDE_EXTRA_METRICS: true,
  COLLECT_EMAIL: true,

  // Розрахований |Actual| понад це значення пишеться, але позначається як викид.
  OUTLIER_THRESHOLD: 0.9,

  NUMBER_FORMAT: '0.0%',
  TEXT_FORMAT: '@'
};

/** Звітні періоди у випадному списку форми. Доповнюйте з кожним кварталом. */
var PERIODS = ['Q3 2026', 'Q4 2026', 'Q1 2027', 'Q2 2027'];

/**
 * 8 фаз STLC у порядку колонок таблиці.
 *   sign: -1 => покращення = СКОРОЧЕННЯ часу/зусиль, пишемо від'ємне число
 *         +1 => покращення = ПРИРІСТ пропускної здатності, пишемо додатне
 * Індекси колонок 1-based (E = 5 … T = 20).
 */
var PHASES = [
  {
    id: 1, key: 'p1', short: '1. Аналіз вимог', metric: 'Час циклу аналізу',
    targetCol: 5, actualCol: 6, sign: -1, target: -0.30, range: '−20–40%',
    unit: 'годин на епік / фічу', example: '8 / 5',
    question: 'Фаза 1 — час аналізу вимог (годин на епік/фічу): було / з AI'
  },
  {
    id: 2, key: 'p2', short: '2. Планування тестування', metric: 'Трудомісткість планування',
    targetCol: 7, actualCol: 8, sign: -1, target: -0.25, range: '−20–30%',
    unit: 'годин на тест-план', example: '16 / 12',
    question: 'Фаза 2 — трудомісткість планування (годин на тест-план): було / з AI'
  },
  {
    id: 3, key: 'p3', short: '3. Дизайн тестів', metric: 'Час написання тест-кейсів',
    targetCol: 9, actualCol: 10, sign: -1, target: -0.28, range: '−25–30%',
    unit: 'годин на 10 тест-кейсів', example: '5 / 3.5',
    question: 'Фаза 3 — написання тест-кейсів (годин на 10 тест-кейсів): було / з AI'
  },
  {
    id: 4, key: 'p4', short: '4. Налаштування середовища', metric: 'Час підготовки середовища',
    targetCol: 11, actualCol: 12, sign: -1, target: -0.33, range: '−25–40%',
    unit: 'годин на середовище', example: '6 / 4',
    question: 'Фаза 4 — підготовка тестового середовища (годин на середовище): було / з AI'
  },
  {
    id: 5, key: 'p5', short: '5. Виконання тестів', metric: 'Пропускна здатність виконання',
    targetCol: 13, actualCol: 14, sign: +1, target: 0.18, range: '+5–30%',
    unit: 'тест-кейсів на годину', example: '6 / 7.5',
    question: 'Фаза 5 — швидкість виконання (тест-кейсів на годину): було / з AI'
  },
  {
    id: 6, key: 'p6', short: '6. Робота з дефектами', metric: 'Час тріажу дефекту',
    targetCol: 15, actualCol: 16, sign: -1, target: -0.33, range: '−30–35%',
    unit: 'хвилин на дефект', example: '20 / 13',
    question: 'Фаза 6 — тріаж дефектів (хвилин на дефект): було / з AI'
  },
  {
    id: 7, key: 'p7', short: '7. Завершення тестування', metric: 'Час підготовки TSR',
    targetCol: 17, actualCol: 18, sign: -1, target: -0.30, range: '−20–40%',
    unit: 'годин на звіт', example: '4 / 2.5',
    question: 'Фаза 7 — підсумковий звіт TSR (годин на звіт): було / з AI'
  },
  {
    id: 8, key: 'p8', short: '8. Автоматизація тестування', metric: 'Час написання скриптів',
    targetCol: 19, actualCol: 20, sign: -1, target: -0.30, range: '−20–40%',
    unit: 'годин на 10 скриптів', example: '20 / 14',
    question: 'Фаза 8 — написання автотестів (годин на 10 скриптів): було / з AI'
  }
];

/**
 * Варіанти відповіді на Q7. `label` бачить тім-лід у сітці;
 * `cell` — те, що пишеться в «Actual, %», коли числа немає.
 * `numeric: true` означає, що для фази має сенс рахувати відсоток.
 */
var STATUS_ORDER = ['USED_MEASURED', 'USED_UNMEASURED', 'NOT_YET', 'NA_PRODUCT', 'NA_NDA', 'NA_TOOLING'];

var STATUSES = {
  USED_MEASURED:   { label: 'Так — використовуємо і маємо заміри',        numeric: true,  cell: null },
  USED_UNMEASURED: { label: 'Так — використовуємо, але без замірів',      numeric: true,  cell: null },
  NOT_YET:         { label: 'Ні — але технічно можливо',                  numeric: false, cell: '0% — ще не використовуємо' },
  NA_PRODUCT:      { label: 'Ні — специфіка продукту / проєкту',          numeric: false, cell: 'N/A — специфіка продукту' },
  NA_NDA:          { label: 'Ні — NDA / приватність даних',               numeric: false, cell: 'N/A — NDA / приватність даних' },
  NA_TOOLING:      { label: 'Ні — немає автоматизації / CI-CD / інструментів', numeric: false, cell: 'N/A — немає автоматизації / CI-CD' }
};

/** Пишеться, коли фаза позначена як «використовуємо», але немає ні годин, ні оцінки. */
var LABEL_PENDING = 'Немає даних';

/**
 * Питання-шлюз: якщо на проєкті AI не використовується взагалі, форма одразу
 * веде до єдиної причини (застосовується до всіх 8 фаз) і завершується —
 * без секцій про зрілість, виміряні дані чи метрики якості.
 */
var OVERALL_USAGE = {
  YES: 'Так — принаймні на одній фазі використовуємо',
  NO: 'Ні — AI не використовується на жодній фазі'
};

/** Причини для «Ні» вище — ті самі 4 «не-так» статуси з Q7, без USED_*. */
var NO_AI_REASON_ORDER = ['NOT_YET', 'NA_PRODUCT', 'NA_NDA', 'NA_TOOLING'];

function noAiReasonLabels() {
  return NO_AI_REASON_ORDER.map(function (code) { return STATUSES[code].label; });
}

/** Діапазони самооцінки (Q18). `mid` — величина; знак підставляє Compute.gs. */
var BUCKET_ORDER = ['Без змін (0%)', 'До 10%', '10–20%', '20–30%', '30–40%', 'Понад 40%', 'Не застосовно'];

var BUCKETS = {
  'Без змін (0%)':  0.00,
  'До 10%':         0.05,
  '10–20%':         0.15,
  '20–30%':         0.25,
  '30–40%':         0.35,
  'Понад 40%':      0.45,
  'Не застосовно':  null
};

/** Шкала зрілості (розділ 3.1 фреймворку). Індекс == бал. */
var MATURITY_OPTIONS = [
  '0 — AI не використовується',
  '1 — епізодично (пробували 1–2 рази, процесу немає)',
  '2 — описаний процес (систематично, спільні промпти, результати рев\'юяться)',
  '3 — виміряно і покращується (є заміри ефекту, квартальний перегляд)'
];

/** Розділ 3.3 — сума балів (0–24) у рівень зрілості. */
var MATURITY_LEVELS = [
  { level: 'L0', min: 0,  max: 4,  desc: 'AI не використовується. Усі фази STLC виконуються вручну.' },
  { level: 'L1', min: 5,  max: 8,  desc: 'AI використовується неформально в 1–2 фазах. Процесу і метрик немає.' },
  { level: 'L2', min: 9,  max: 14, desc: 'Описаний процес у 3–5 фазах. Відстежуються базові метрики.' },
  { level: 'L3', min: 15, max: 19, desc: 'AI покриває 6+ фаз. Рішення на основі метрик. ★ Цільовий рівень.' },
  { level: 'L4', min: 20, max: 24, desc: 'AI-first. Self-healing автоматизація. Порахований ROI.' }
];

/** Проєкти в порядку рядків таблиці (4..19). Синхронізовано з data/projects.csv. */
var PROJECTS = [
  { name: 'i-Herb' },       { name: 'Auris' },        { name: 'Pitcher' },
  { name: 'Totally' },      { name: 'Jostens' },      { name: 'Loupedeck' },
  { name: 'Kato' },         { name: 'Kiuwan' },       { name: 'Preemptive' },
  { name: 'Ranorex' },      { name: 'Givelify' },     { name: 'Haogen' },
  { name: 'Drop Fitness' }, { name: 'DNP' },          { name: 'Bimsmith' },
  { name: 'Fitness App' }
];

var PROJECT_OTHER = 'Інший — немає у списку';

/**
 * Нормалізований синонім -> точна назва в колонці B.
 * У таблиці проєкт №16 записано з одруківкою «Fintess App»; форма пропонує
 * коректне «Fitness App», а цей словник маршрутизує відповідь у наявний рядок.
 * Одруківка НЕ виправляється автоматично: перейменування рядка змінює ключ
 * мапінгу, і це має лишатись свідомим рішенням людини.
 */
var PROJECT_ALIASES = {
  'fitnessapp': 'Fintess App',
  'fintessapp': 'Fintess App',
  'iherb': 'i-Herb',
  'kiwan': 'Kiuwan',
  'dropfitness': 'Drop Fitness'
};

var TESTING_APPROACHES = [
  'Лише мануальне тестування',
  'Лише автоматизоване',
  'Змішаний підхід (мануальне + автоматизація)'
];

var PRODUCT_TYPES = ['Web', 'Mobile', 'Desktop', 'API / бекенд', 'AI-продукт (ML-функціональність)'];

var DATA_CONSTRAINTS = [
  'Без обмежень — публічні AI-інструменти дозволені',
  'Обмежено — лише погоджені / enterprise AI-інструменти',
  'Заборонено за NDA або політикою клієнта',
  'Ще не з\'ясовано'
];

var TOOL_CATEGORIES = [
  'AI-асистенти (Claude / ChatGPT / Gemini)',
  'Генератори коду (Claude Code, Copilot, Testim, Mabl, Katalon AI)',
  'Visual AI (Applitools, Percy)',
  'Синтетичні дані (Gretel, Mostly AI, Tonic.ai)',
  'AI у тест-менеджменті (Jira AI, Sentry AI, Linear AI)',
  'AI у CI/CD (Datadog Synthetics)',
  'ML-моніторинг (WhyLabs, Evidently)',
  'Жодного'
];

var CONFIDENCE_OPTIONS = [
  'Високий — є тайм-логи в Jira / таймшитах',
  'Середній — фіксували частково',
  'Низький — експертна оцінка'
];

var REPORTING_BASIS = {
  MEASURED: 'Маю виміряні цифри (було / стало)',
  ESTIMATED: 'Лише оцінка — baseline не фіксували'
};

/** Приймає «12 / 8», «12/8», «12,5 ; 8», з довільними пробілами. */
var HOURS_PATTERN = '^\\s*\\d+([.,]\\d+)?\\s*[\\/;]\\s*\\d+([.,]\\d+)?\\s*$';

/** Ключі властивостей скрипта. */
var PROP = {
  FORM_ID: 'FORM_ID',
  FORM_URL: 'FORM_URL',
  ITEM_MAP: 'ITEM_MAP',
  ACTIVE_PERIOD: 'ACTIVE_PERIOD',
  OWNER_EMAIL: 'OWNER_EMAIL',
  SHEET_NAME: 'SHEET_NAME',
  TARGET_SPREADSHEET_ID: 'TARGET_SPREADSHEET_ID'
};

/** DEFAULTS + перевизначення з властивостей скрипта. */
function getConfig() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var cfg = {};
  for (var k in DEFAULTS) { cfg[k] = DEFAULTS[k]; }
  var overridable = [PROP.ACTIVE_PERIOD, PROP.OWNER_EMAIL, PROP.SHEET_NAME,
                     PROP.FORM_ID, PROP.TARGET_SPREADSHEET_ID];
  for (var i = 0; i < overridable.length; i++) {
    var key = overridable[i];
    if (props[key]) { cfg[key] = props[key]; }
  }
  return cfg;
}

/** Таблиця, у яку пишемо: за замовчуванням та, до якої прив'язаний скрипт. */
function getTargetSpreadsheet() {
  var cfg = getConfig();
  if (cfg.TARGET_SPREADSHEET_ID) { return SpreadsheetApp.openById(cfg.TARGET_SPREADSHEET_ID); }
  var active = SpreadsheetApp.getActive();
  if (active) { return active; }
  throw new Error('Не вдалося визначити таблицю. Задайте властивість скрипта TARGET_SPREADSHEET_ID.');
}

/** Ключ пошуку, нечутливий до регістру і пунктуації: «i-Herb» -> «iherb». */
function normaliseProjectName(name) {
  return String(name || '').toLowerCase().replace(/[\s\-_.'"()]/g, '');
}

/** Приводить відповідь форми до точної назви з колонки B. */
function resolveProjectName(name) {
  var key = normaliseProjectName(name);
  if (PROJECT_ALIASES[key]) { return PROJECT_ALIASES[key]; }
  return String(name || '').trim();
}

function getPhaseByKey(key) {
  for (var i = 0; i < PHASES.length; i++) {
    if (PHASES[i].key === key) { return PHASES[i]; }
  }
  return null;
}

/** Зворотний пошук: підпис колонки Q7 -> код статусу. */
function statusCodeFromLabel(label) {
  var trimmed = String(label || '').trim();
  for (var i = 0; i < STATUS_ORDER.length; i++) {
    if (STATUSES[STATUS_ORDER[i]].label === trimmed) { return STATUS_ORDER[i]; }
  }
  return null;
}

function statusLabels() {
  return STATUS_ORDER.map(function (code) { return STATUSES[code].label; });
}
