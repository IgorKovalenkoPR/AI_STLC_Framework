/**
 * Config.gs — single source of truth for the "AI Adoption in STLC" collector.
 *
 * Everything the rest of the scripts need to know about the spreadsheet layout,
 * the 8 STLC phases, the projects and the controlled vocabulary lives here.
 * Change it here, then re-run `setup()` (or "Rebuild form" from the menu).
 *
 * Runtime overrides live in File > Project Settings > Script Properties:
 *   ACTIVE_PERIOD   e.g. "Q3 2026"   — the period the main sheet reflects
 *   OWNER_EMAIL     e.g. "qa-manager@example.com"
 *   SHEET_NAME      defaults to "AI QA Optimization"
 */

var DEFAULTS = {
  SHEET_NAME: 'AI QA Optimization',
  MATURITY_SHEET: 'AI Maturity',
  LOG_SHEET: 'Submission log',
  COVERAGE_SHEET: 'Coverage',

  FIRST_DATA_ROW: 4,   // rows 1-3 are the merged header block
  COL_NUM: 1,          // A  #
  COL_PROJECT: 2,      // B  Project
  COL_AM: 3,           // C  Account manager
  COL_MODEL: 4,        // D  Model (DT / TM)

  ACTIVE_PERIOD: 'Q3 2026',
  OWNER_EMAIL: '',

  FORM_TITLE: 'AI Adoption in STLC — Quarterly Project Self-Assessment',

  // Feature flags. Turning both off gives the 15-element "lite" form.
  INCLUDE_MEASURED_HOURS_SECTION: true,
  INCLUDE_EXTRA_METRICS: true,
  COLLECT_EMAIL: true,

  // A computed |Actual| above this is written but flagged as an outlier.
  OUTLIER_THRESHOLD: 0.9,

  NUMBER_FORMAT: '0.0%',
  TEXT_FORMAT: '@'
};

/** Reporting periods offered in the form. Extend as quarters roll over. */
var PERIODS = ['Q3 2026', 'Q4 2026', 'Q1 2027', 'Q2 2027'];

/**
 * The 8 STLC phases, in sheet-column order.
 *   sign: -1 => improvement is a time/effort REDUCTION, written as a negative
 *          +1 => improvement is a THROUGHPUT GAIN, written as a positive
 * Column indices are 1-based (E = 5 ... T = 20).
 */
var PHASES = [
  {
    id: 1, key: 'p1', short: '1. Requirements Analysis', metric: 'Analysis cycle time',
    targetCol: 5, actualCol: 6, sign: -1, target: -0.30, range: '−20–40%',
    unit: 'hours per epic / feature', example: '8 / 5',
    question: 'Phase 1 — Requirements analysis cycle time (hours per epic/feature): baseline / with AI'
  },
  {
    id: 2, key: 'p2', short: '2. Test Planning', metric: 'Planning effort',
    targetCol: 7, actualCol: 8, sign: -1, target: -0.25, range: '−20–30%',
    unit: 'hours per test plan', example: '16 / 12',
    question: 'Phase 2 — Test planning effort (hours per test plan): baseline / with AI'
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
    question: 'Phase 4 — Environment provisioning (hours per environment): baseline / with AI'
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
    question: 'Phase 7 — Test summary report (hours per report): baseline / with AI'
  },
  {
    id: 8, key: 'p8', short: '8. Test Automation', metric: 'Script authoring time',
    targetCol: 19, actualCol: 20, sign: -1, target: -0.30, range: '−20–40%',
    unit: 'hours per 10 scripts', example: '20 / 14',
    question: 'Phase 8 — Automation script authoring (hours per 10 scripts): baseline / with AI'
  }
];

/**
 * Q7 answer options. `label` is what the team lead sees in the grid;
 * `cell` is what lands in the "Actual, %" column when no number is available.
 * `numeric: true` means the phase is a candidate for a calculated percentage.
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

/** Written when the phase is marked as "used" but carries neither hours nor a bucket. */
var LABEL_PENDING = 'Data pending';

/** Q18 self-assessment buckets. `mid` is the magnitude; Compute.gs applies the sign. */
var BUCKET_ORDER = ['No change (0%)', 'Up to 10%', '10–20%', '20–30%', '30–40%', 'Over 40%', 'Not applicable'];

var BUCKETS = {
  'No change (0%)':  0.00,
  'Up to 10%':       0.05,
  '10–20%':     0.15,
  '20–30%':     0.25,
  '30–40%':     0.35,
  'Over 40%':        0.45,
  'Not applicable':  null
};

/** Q8 maturity scale (framework section 3.1). Index == score. */
var MATURITY_OPTIONS = [
  '0 — no AI',
  '1 — occasional (tried 1–2 times, no process)',
  '2 — defined process (systematic, shared prompts, results reviewed)',
  '3 — measured & improving (gains measured, quarterly review)'
];

/** Framework section 3.3 — TOTAL score (0-24) to maturity level. */
var MATURITY_LEVELS = [
  { level: 'L0', min: 0,  max: 4,  desc: 'No AI used. All STLC phases fully manual.' },
  { level: 'L1', min: 5,  max: 8,  desc: 'AI used informally in 1–2 phases. No standard process.' },
  { level: 'L2', min: 9,  max: 14, desc: 'Defined process in 3–5 phases. Basic metrics tracked.' },
  { level: 'L3', min: 15, max: 19, desc: 'AI covers 6+ phases. Metrics-driven. ★ Target level.' },
  { level: 'L4', min: 20, max: 24, desc: 'AI-first. Self-healing automation. Quantified ROI.' }
];

/** Projects, in sheet-row order (rows 4..19). Keep in sync with data/projects.csv. */
var PROJECTS = [
  { name: 'i-Herb',       am: 'Yuliia',   model: 'DT' },
  { name: 'Auris',        am: 'Veronika', model: 'TM' },
  { name: 'Pitcher',      am: 'Veronika', model: 'DT' },
  { name: 'Totally',      am: 'Nora',     model: 'DT' },
  { name: 'Jostens',      am: 'Yuliia',   model: 'DT' },
  { name: 'Loupedeck',    am: 'Veronika', model: 'DT' },
  { name: 'Kato',         am: 'Nora',     model: 'DT' },
  { name: 'Kiuwan',       am: 'Yuliia',   model: 'DT' },
  { name: 'Preemptive',   am: 'Yuliia',   model: 'DT' },
  { name: 'Ranorex',      am: 'Yuliia',   model: 'DT' },
  { name: 'Givelify',     am: 'Yuliia',   model: 'DT' },
  { name: 'Haogen',       am: 'Yuliia',   model: 'DT' },
  { name: 'Drop Fitness', am: 'Yuliia',   model: 'TM' },
  { name: 'DNP',          am: 'Nora',     model: 'DT' },
  { name: 'Bimsmith',     am: 'Yuliia',   model: 'DT' },
  { name: 'Fitness App',  am: 'Nora',     model: 'TM' }
];

var PROJECT_OTHER = 'Other — not in the list';

/**
 * Normalised alias -> exact project name as it appears in column B.
 * The sheet spells project 16 "Fintess App"; the form offers the corrected
 * "Fitness App" and this map routes it back to the existing row. The typo is
 * deliberately NOT auto-corrected in the sheet — renaming a row changes the
 * mapping key and should stay a human decision.
 */
var PROJECT_ALIASES = {
  'fitnessapp': 'Fintess App',
  'fintessapp': 'Fintess App',
  'iherb': 'i-Herb',
  'kiwan': 'Kiuwan',
  'dropfitness': 'Drop Fitness'
};

var ACCOUNT_MANAGERS = ['Yuliia', 'Veronika', 'Nora', 'Other'];
var CONTRACT_MODELS = ['DT', 'TM'];

var TESTING_APPROACHES = ['Manual only', 'Automated only', 'Mixed (manual + automation)'];
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
  ESTIMATED: 'Estimates only — no tracked baseline'
};

/** Accepts "12 / 8", "12/8", "12,5 ; 8", with optional spaces. */
var HOURS_PATTERN = '^\\s*\\d+([.,]\\d+)?\\s*[\\/;]\\s*\\d+([.,]\\d+)?\\s*$';

/** Script-property keys. */
var PROP = {
  FORM_ID: 'FORM_ID',
  FORM_URL: 'FORM_URL',
  ITEM_MAP: 'ITEM_MAP',
  ACTIVE_PERIOD: 'ACTIVE_PERIOD',
  OWNER_EMAIL: 'OWNER_EMAIL',
  SHEET_NAME: 'SHEET_NAME'
};

/** Merges DEFAULTS with any Script Properties overrides. */
function getConfig() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var cfg = {};
  for (var k in DEFAULTS) { cfg[k] = DEFAULTS[k]; }
  if (props[PROP.ACTIVE_PERIOD]) { cfg.ACTIVE_PERIOD = props[PROP.ACTIVE_PERIOD]; }
  if (props[PROP.OWNER_EMAIL]) { cfg.OWNER_EMAIL = props[PROP.OWNER_EMAIL]; }
  if (props[PROP.SHEET_NAME]) { cfg.SHEET_NAME = props[PROP.SHEET_NAME]; }
  return cfg;
}

/** Case/punctuation-insensitive project key: "i-Herb" -> "iherb". */
function normaliseProjectName(name) {
  return String(name || '').toLowerCase().replace(/[\s\-_.'"()]/g, '');
}

/** Resolves a form answer to the exact project name used in column B. */
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

/** Reverse lookup: Q7 grid label -> status code. */
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
