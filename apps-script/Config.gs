/**
 * Config.gs — єдине джерело правди для збору метрик «Використання AI у STLC».
 *
 * Тут описано все, що потрібно решті скриптів: розкладка таблиці, 8 фаз STLC,
 * проєкти, тексти форми і контрольований словник міток.
 * Форма і всі дані в таблиці — англійською мовою (респонденти й таблиця
 * можуть бути міжнародними); код і коментарі лишаються українською.
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
  MATURITY_SHEET: 'AI Maturity',
  LOG_SHEET: 'Submission Log',
  COVERAGE_SHEET: 'Coverage',
  FEEDBACK_SHEET: 'Tools & Feedback',

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
    id: 1, key: 'p1', short: '1. Requirements Analysis', metric: 'Analysis cycle time',
    targetCol: 5, actualCol: 6, sign: -1, target: -0.30, range: '−20–40%',
    unit: 'hours per epic / feature', example: '8 / 5',
    question: 'Phase 1 — Requirements analysis time (hours per epic/feature): baseline / with AI'
  },
  {
    id: 2, key: 'p2', short: '2. Test Planning', metric: 'Planning effort',
    targetCol: 7, actualCol: 8, sign: -1, target: -0.25, range: '−20–30%',
    unit: 'hours per test plan', example: '16 / 12',
    question: 'Phase 2 — Planning effort (hours per test plan): baseline / with AI'
  },
  {
    id: 3, key: 'p3', short: '3. Test Design', metric: 'TC authoring time',
    targetCol: 9, actualCol: 10, sign: -1, target: -0.28, range: '−25–30%',
    unit: 'hours per 10 test cases', example: '5 / 3.5',
    question: 'Phase 3 — Test case authoring (hours per 10 test cases): baseline / with AI'
  },
  {
    id: 4, key: 'p4', short: '4. Environment Setup', metric: 'Env provisioning time',
    targetCol: 11, actualCol: 12, sign: -1, target: -0.33, range: '−25–40%',
    unit: 'hours per environment', example: '6 / 4',
    question: 'Phase 4 — Test environment provisioning (hours per environment): baseline / with AI'
  },
  {
    id: 5, key: 'p5', short: '5. Test Execution', metric: 'Execution throughput',
    targetCol: 13, actualCol: 14, sign: +1, target: 0.18, range: '+5–30%',
    unit: 'test cases per hour', example: '6 / 7.5',
    question: 'Phase 5 — Execution speed (test cases per hour): baseline / with AI'
  },
  {
    id: 6, key: 'p6', short: '6. Defect Management', metric: 'Triage time per defect',
    targetCol: 15, actualCol: 16, sign: -1, target: -0.33, range: '−30–35%',
    unit: 'minutes per defect', example: '20 / 13',
    question: 'Phase 6 — Defect triage (minutes per defect): baseline / with AI'
  },
  {
    id: 7, key: 'p7', short: '7. Test Closure', metric: 'TSR generation time',
    targetCol: 17, actualCol: 18, sign: -1, target: -0.30, range: '−20–40%',
    unit: 'hours per report', example: '4 / 2.5',
    question: 'Phase 7 — Test Summary Report (hours per report): baseline / with AI'
  },
  {
    id: 8, key: 'p8', short: '8. Test Automation', metric: 'Script authoring time',
    targetCol: 19, actualCol: 20, sign: -1, target: -0.30, range: '−20–40%',
    unit: 'hours per 10 scripts', example: '20 / 14',
    question: 'Phase 8 — Automation script authoring (hours per 10 scripts): baseline / with AI'
  }
];

/**
 * Варіанти відповіді на Q7. `label` бачить тім-лід у сітці;
 * `cell` — те, що пишеться в «Actual, %», коли числа немає.
 * `numeric: true` означає, що для фази має сенс рахувати відсоток.
 */
var STATUS_ORDER = ['USED_MEASURED', 'USED_UNMEASURED', 'NOT_YET', 'NA_PRODUCT', 'NA_NDA', 'NA_TOOLING'];

var STATUSES = {
  USED_MEASURED:   { label: 'Yes — used & measured',                   numeric: true,  cell: null },
  USED_UNMEASURED: { label: 'Yes — used, not measured',                numeric: true,  cell: null },
  NOT_YET:         { label: 'No — but feasible',                       numeric: false, cell: '0% — not used yet' },
  NA_PRODUCT:      { label: 'No — product / project specifics',        numeric: false, cell: 'N/A — product specifics' },
  NA_NDA:          { label: 'No — NDA / data privacy',                 numeric: false, cell: 'N/A — NDA / data privacy' },
  NA_TOOLING:      { label: 'No — no automation / CI-CD / tooling',    numeric: false, cell: 'N/A — no automation / CI-CD' }
};

/** Пишеться, коли фаза позначена як «використовуємо», але немає ні годин, ні оцінки. */
var LABEL_PENDING = 'Data pending';

/**
 * Питання-шлюз: якщо на проєкті AI не використовується взагалі, форма одразу
 * веде до єдиної причини (застосовується до всіх 8 фаз) і завершується —
 * без секцій про зрілість, виміряні дані чи метрики якості.
 */
var OVERALL_USAGE = {
  YES: 'Yes — used in at least one phase',
  NO: 'No — AI is not used in any phase'
};

/** Причини для «Ні» вище — ті самі 4 «не-так» статуси з Q7, без USED_*. */
var NO_AI_REASON_ORDER = ['NOT_YET', 'NA_PRODUCT', 'NA_NDA', 'NA_TOOLING'];

function noAiReasonLabels() {
  return NO_AI_REASON_ORDER.map(function (code) { return STATUSES[code].label; });
}

/** Діапазони самооцінки (Q18). `mid` — величина; знак підставляє Compute.gs. */
var BUCKET_ORDER = ['No change (0%)', 'Up to 10%', '10–20%', '20–30%', '30–40%', 'Over 40%', 'Not applicable'];

var BUCKETS = {
  'No change (0%)': 0.00,
  'Up to 10%':      0.05,
  '10–20%':         0.15,
  '20–30%':         0.25,
  '30–40%':         0.35,
  'Over 40%':       0.45,
  'Not applicable': null
};

/** Шкала зрілості (розділ 3.1 фреймворку). Індекс == бал. */
var MATURITY_OPTIONS = [
  '0 — no AI',
  '1 — occasional (tried 1–2 times, no process)',
  '2 — defined process (systematic, shared prompts, results reviewed)',
  '3 — measured & improving (gains measured, quarterly review)'
];

/** Розділ 3.3 — сума балів (0–24) у рівень зрілості. */
var MATURITY_LEVELS = [
  { level: 'L0', min: 0,  max: 4,  desc: 'No AI used. All STLC phases are fully manual.' },
  { level: 'L1', min: 5,  max: 8,  desc: 'AI used informally in 1–2 phases. No process or metrics.' },
  { level: 'L2', min: 9,  max: 14, desc: 'Defined process in 3–5 phases. Basic metrics tracked.' },
  { level: 'L3', min: 15, max: 19, desc: 'AI covers 6+ phases. Metrics-driven decisions. ★ Target level.' },
  { level: 'L4', min: 20, max: 24, desc: 'AI-first. Self-healing automation. Quantified ROI.' }
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

var PROJECT_OTHER = 'Other — not in the list';

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
  'Manual only',
  'Automated only',
  'Mixed (manual + automation)'
];

var PRODUCT_TYPES = ['Web', 'Mobile', 'Desktop', 'API / backend', 'AI-powered (ML features)'];

var DATA_CONSTRAINTS = [
  'No restrictions — public AI tools allowed',
  'Restricted — only approved / enterprise AI tools',
  'Prohibited by NDA or client policy',
  'Not clarified yet'
];

var TOOL_CATEGORIES = [
  'AI Assistants (Claude / ChatGPT / Gemini)',
  'AI Code Generators (Claude Code, Copilot, Testim, Mabl, Katalon AI)',
  'Visual AI (Applitools, Percy)',
  'Synthetic Data (Gretel, Mostly AI, Tonic.ai)',
  'AI in Test Management (Jira AI, Sentry AI, Linear AI)',
  'AI-enhanced CI/CD (Datadog Synthetics)',
  'ML Monitoring (WhyLabs, Evidently)',
  'None'
];

var CONFIDENCE_OPTIONS = [
  'High — tracked in Jira / timesheets',
  'Medium — partially tracked',
  'Low — expert judgement'
];

var REPORTING_BASIS = {
  MEASURED: 'I have measured numbers (before / after)',
  ESTIMATED: 'Estimate only — no tracked baseline'
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
  throw new Error('Could not determine the spreadsheet. Set the script property TARGET_SPREADSHEET_ID.');
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
