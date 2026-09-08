/**
 * BuildForm.gs — builds the Google Form programmatically.
 *
 * The form is rebuilt from this file, never edited by hand: question wording is
 * versioned in docs/form-spec.md and in this script. After changing wording run
 * "AI STLC ▸ Rebuild form" — the old form is renamed and a fresh one is created.
 *
 * Answers are located by item ID (stored in the ITEM_MAP script property), not
 * by question title, so re-wording a question never breaks the mapping.
 */

var UA = {
  formDescription:
    'Опитування для QA тім-лідів: оцінка використання AI на кожній фазі STLC на вашому проєкті.\n\n' +
    'Заповнення займає ~10 хвилин. Відповіді автоматично потрапляють у зведену таблицю ' +
    '"AI QA Optimization — Target vs Actual" у рядок вашого проєкту.\n\n' +
    'Що підготувати заздалегідь: приблизні витрати часу «до AI» і «з AI» по фазах ' +
    '(тайм-логи Jira, таймшити, або експертна оцінка). Якщо замірів немає — нічого страшного, ' +
    'у формі є варіант оцінити діапазоном.\n\n' +
    'Принцип фреймворку: AI доповнює, а не замінює інженера. ' +
    'Якщо на якійсь фазі AI не використовується або його неможливо застосувати — так і вкажіть, ' +
    'це коректна і корисна відповідь.'
};

/**
 * Creates the form, links it to this spreadsheet and stores the item map.
 * Returns the created Form object.
 */
function createForm() {
  var cfg = getConfig();
  var ss = SpreadsheetApp.getActive();
  var form = FormApp.create(cfg.FORM_TITLE);

  form.setDescription(UA.formDescription);
  form.setProgressBar(true);
  form.setShuffleQuestions(false);
  form.setAllowResponseEdits(true);
  form.setLimitOneResponsePerUser(false);
  form.setPublishingSummary(false);
  if (cfg.COLLECT_EMAIL) { enableEmailCollection_(form); }

  var map = { hours: {} };

  buildSectionContext_(form, map);
  var pbNewProject = buildSectionNewProject_(form, map);
  var pbUsage = buildSectionUsage_(form, map);
  buildSectionMaturity_(form, map);
  var basisItem = null;
  var pbMeasured = null;
  var pbEstimate = null;

  if (cfg.INCLUDE_MEASURED_HOURS_SECTION) {
    basisItem = buildSectionBasis_(form, map);
    pbMeasured = buildSectionMeasured_(form, map);
  }
  pbEstimate = buildSectionEstimate_(form, map);
  buildSectionTools_(form, map, cfg);

  // Navigation can only be wired once every target page exists.
  wireProjectNavigation_(form, map, pbNewProject, pbUsage);
  pbNewProject.setGoToPage(pbUsage);
  if (basisItem && pbMeasured && pbEstimate) {
    wireBasisNavigation_(basisItem, pbMeasured, pbEstimate);
    pbMeasured.setGoToPage(pbEstimate);
  }

  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  var props = PropertiesService.getScriptProperties();
  props.setProperty(PROP.FORM_ID, form.getId());
  props.setProperty(PROP.FORM_URL, form.getPublishedUrl());
  props.setProperty(PROP.ITEM_MAP, JSON.stringify(map));

  return form;
}

function enableEmailCollection_(form) {
  try {
    form.setEmailCollectionType(FormApp.EmailCollectionType.VERIFIED);
  } catch (e) {
    try { form.setCollectEmail(true); } catch (e2) { /* older/newer runtime: skip */ }
  }
}

/* ------------------------------------------------------------------ */
/* Section 1 — Project context                                         */
/* ------------------------------------------------------------------ */

function buildSectionContext_(form, map) {
  var project = form.addListItem()
    .setTitle('Project')
    .setHelpText('Оберіть проєкт зі списку. Якщо вашого проєкту тут немає — оберіть "Other — not in the list".')
    .setRequired(true);
  map.project = project.getId();   // choices are set later, once pages exist

  map.reporter = form.addTextItem()
    .setTitle('Your name and role')
    .setHelpText('Наприклад: Ivan Petrenko, QA Team Lead')
    .setRequired(true)
    .getId();

  map.period = form.addListItem()
    .setTitle('Reporting period')
    .setHelpText('Період, за який ви оцінюєте використання AI на проєкті.')
    .setChoiceValues(PERIODS)
    .setRequired(true)
    .getId();

  map.approach = form.addMultipleChoiceItem()
    .setTitle('Testing approach on the project')
    .setHelpText('Впливає на те, які AI-можливості взагалі застосовні на проєкті ' +
                 '(Applicability Matrix, розділ 1.3 фреймворку).')
    .setChoiceValues(TESTING_APPROACHES)
    .setRequired(true)
    .getId();

  map.productType = form.addCheckboxItem()
    .setTitle('Product type')
    .setHelpText('Можна обрати кілька варіантів.')
    .setChoiceValues(PRODUCT_TYPES)
    .setRequired(true)
    .getId();

  map.dataConstraints = form.addMultipleChoiceItem()
    .setTitle('Data & privacy constraints (framework section 5, Governance)')
    .setHelpText('Чи дозволяє клієнт передавати артефакти проєкту в AI-інструменти. ' +
                 'Заборона за NDA — поширена і цілком легітимна причина, чому AI на проєкті не застосовується.')
    .setChoiceValues(DATA_CONSTRAINTS)
    .setRequired(true)
    .getId();
}

/* ------------------------------------------------------------------ */
/* Section 1b — New project (shown only when "Other" is picked)        */
/* ------------------------------------------------------------------ */

function buildSectionNewProject_(form, map) {
  var pb = form.addPageBreakItem()
    .setTitle('New project details')
    .setHelpText('Цю секцію заповнюють лише ті, хто обрав "Other — not in the list". ' +
                 'Для проєкту буде створено новий рядок у таблиці.');

  map.newProjectName = form.addTextItem()
    .setTitle('Project name')
    .setHelpText('Назва так, як вона має з\'явитися у зведеній таблиці.')
    .setRequired(true)
    .getId();

  map.newProjectAm = form.addMultipleChoiceItem()
    .setTitle('Account manager')
    .setChoiceValues(ACCOUNT_MANAGERS)
    .setRequired(true)
    .getId();

  map.newProjectModel = form.addMultipleChoiceItem()
    .setTitle('Contract model')
    .setHelpText('DT — dedicated team, TM — time & material.')
    .setChoiceValues(CONTRACT_MODELS)
    .setRequired(true)
    .getId();

  return pb;
}

/* ------------------------------------------------------------------ */
/* Section 2 — AI usage per phase (the core question)                  */
/* ------------------------------------------------------------------ */

function buildSectionUsage_(form, map) {
  var pb = form.addPageBreakItem()
    .setTitle('AI usage per STLC phase')
    .setHelpText(
      'Для кожної з 8 фаз вкажіть, чи використовуєте ви AI — і чи це взагалі можливо на вашому проєкті.\n\n' +
      'Підказки з Applicability Matrix (розділ 1.3 фреймворку):\n' +
      '• Мануальні проєкти: Environment Setup застосовний лише частково (генерація синтетичних даних); ' +
      'Test Execution — лише smart prioritisation, бо visual AI потребує автоматизації; ' +
      'Test Automation при нульовому automation baseline дає ефект через 9–12 місяців.\n' +
      '• Desktop-продукти: Environment Setup — лише за наявності бекенду або тестової БД; ' +
      'Visual Regression не застосовний без web-оболонки.\n' +
      '• Defect Management: Jira AI доступний лише в Jira Cloud; на Server/DC — Claude як заміна.');

  map.usageGrid = form.addGridItem()
    .setTitle('Do you use AI in this phase — and is it even possible on this project?')
    .setHelpText('Оберіть один варіант у кожному рядку. Відповідь "No" з причиною — ' +
                 'це повноцінна відповідь, вона так і буде відображена в таблиці.')
    .setRows(PHASES.map(function (p) { return p.short; }))
    .setColumns(statusLabels())
    .setRequired(true)
    .getId();

  return pb;
}

/* ------------------------------------------------------------------ */
/* Section 3 — AI maturity                                             */
/* ------------------------------------------------------------------ */

function buildSectionMaturity_(form, map) {
  var pb = form.addPageBreakItem()
    .setTitle('AI maturity per phase')
    .setHelpText(
      'Самооцінка за шкалою 0–3 з розділу 3 фреймворку. Сума по 8 фазах (0–24) дає рівень зрілості:\n' +
      'L0 = 0–4 · L1 = 5–8 · L2 = 9–14 · L3 = 15–19 (★ цільовий рівень TestFort) · L4 = 20–24.\n' +
      'Ці бали не впливають на колонку "Actual, %" — вони пишуться на окремий аркуш "AI Maturity".');

  map.maturityGrid = form.addGridItem()
    .setTitle('AI maturity level per phase (0–3)')
    .setHelpText('0 — фаза виконується повністю вручну; 1 — пробували AI 1–2 рази, процесу немає; ' +
                 '2 — AI використовується систематично, є описаний процес або спільна бібліотека промптів; ' +
                 '3 — те саме плюс виміряні gains і квартальний перегляд підходу.')
    .setRows(PHASES.map(function (p) { return p.short; }))
    .setColumns(MATURITY_OPTIONS)
    .setRequired(true)
    .getId();

  return pb;
}

/* ------------------------------------------------------------------ */
/* Section 4 — Reporting basis gate                                    */
/* ------------------------------------------------------------------ */

function buildSectionBasis_(form, map) {
  form.addPageBreakItem()
    .setTitle('How can you report the impact?')
    .setHelpText('Принцип фреймворку: "Measure before and after. No baseline = no proof of value." ' +
                 'Якщо точних замірів немає — це нормально: оцінимо діапазоном, ' +
                 'а в таблиці позначимо рівень довіри до цифри.');

  var item = form.addMultipleChoiceItem()
    .setTitle('How can you report the impact?')
    .setHelpText('Якщо цифри є лише по частині фаз — оберіть перший варіант: ' +
                 'ви зможете ввести години там, де вони є, і оцінити діапазоном решту.')
    .setRequired(true);

  map.basis = item.getId();
  return item;
}

/* ------------------------------------------------------------------ */
/* Section 5 — Measured data (optional, one field per phase)           */
/* ------------------------------------------------------------------ */

function buildSectionMeasured_(form, map) {
  var pb = form.addPageBreakItem()
    .setTitle('Measured data — baseline vs with AI')
    .setHelpText(
      'Заповнюйте лише ті фази, де у вас є реальні заміри. Усі поля опційні.\n' +
      'Формат: «було / стало», два числа через слеш. Наприклад: 12 / 8.\n' +
      'Одиниці виміру вказані в кожному питанні — головне, щоб обидва числа були в одній одиниці.');

  for (var i = 0; i < PHASES.length; i++) {
    var p = PHASES[i];
    var help = 'Одиниця: ' + p.unit + '. Приклад: ' + p.example + '.';
    if (p.sign > 0) {
      help += ' Увага: тут більше = краще — скільки тест-кейсів на годину виконували раніше і скільки з AI.';
    }
    var validation = FormApp.createTextValidation()
      .setHelpText('Формат: baseline / with AI, напр. ' + p.example + ' — два числа через слеш.')
      .requireTextMatchesPattern(HOURS_PATTERN)
      .build();

    map.hours[p.key] = form.addTextItem()
      .setTitle(p.question)
      .setHelpText(help)
      .setRequired(false)
      .setValidation(validation)
      .getId();
  }

  return pb;
}

/* ------------------------------------------------------------------ */
/* Section 6 — Self-assessed impact (fallback without a baseline)      */
/* ------------------------------------------------------------------ */

function buildSectionEstimate_(form, map) {
  var pb = form.addPageBreakItem()
    .setTitle('Self-assessed impact')
    .setHelpText(
      'Оцініть ВЕЛИЧИНУ покращення порівняно з тим, як працювали до AI.\n' +
      'Для Test Execution це приріст пропускної здатності (більше = краще), ' +
      'для решти фаз — скорочення витраченого часу. Знак (мінус/плюс) підставиться автоматично.\n' +
      'Якщо для фази ви вже ввели години в попередній секції — вони мають пріоритет над цією оцінкою.');

  map.estimateGrid = form.addGridItem()
    .setTitle('Estimated improvement vs your pre-AI baseline')
    .setHelpText('Оберіть один варіант у кожному рядку. Для фаз, де AI не використовується ' +
                 'або неможливий, оберіть "Not applicable".')
    .setRows(PHASES.map(function (p) { return p.short; }))
    .setColumns(BUCKET_ORDER)
    .setRequired(true)
    .getId();

  return pb;
}

/* ------------------------------------------------------------------ */
/* Section 7 — Tools, quality signals, feedback                        */
/* ------------------------------------------------------------------ */

function buildSectionTools_(form, map, cfg) {
  var pb = form.addPageBreakItem()
    .setTitle('Tools, quality signals & feedback')
    .setHelpText('Останній блок. Питання про відсотки — опційні, заповнюйте лише якщо ці цифри у вас є.');

  var tools = form.addCheckboxItem()
    .setTitle('Which AI tool categories did you actually use this period?')
    .setHelpText('Категорії з розділу 1.2 фреймворку. Можна обрати кілька.')
    .setChoiceValues(TOOL_CATEGORIES)
    .setRequired(true);
  tools.showOtherOption(true);
  map.tools = tools.getId();

  if (cfg.INCLUDE_EXTRA_METRICS) {
    map.acceptanceRate = addPercentItem_(
      form,
      'AI-generated test case acceptance rate, %',
      'Частка AI-згенерованих тест-кейсів, прийнятих без правок. ' +
      'Ціль фреймворку: ≥ 70%. Нижче 50% — сигнал, що промпти потребують доопрацювання.');

    map.hallucinationRate = addPercentItem_(
      form,
      'AI hallucination / rework rate on AI outputs, %',
      'Частка AI-артефактів (тест-кейсів, баг-репортів), у яких під час рев\'ю знайшли ' +
      'фактичні помилки або вигадані кроки. Типово 3–8% для хмарних LLM.');

    map.automationCoverage = addPercentItem_(
      form,
      'Automation coverage, %',
      'Automated TCs / Total TCs in suite × 100. Якщо автоматизації немає — вкажіть 0.');
  }

  map.confidence = form.addMultipleChoiceItem()
    .setTitle('Confidence in the figures you reported')
    .setHelpText('Рівень довіри записується в примітку до кожної заповненої комірки таблиці — ' +
                 'це захист від того, щоб оцінки читалися як точні заміри.')
    .setChoiceValues(CONFIDENCE_OPTIONS)
    .setRequired(true)
    .getId();

  map.blockers = form.addParagraphTextItem()
    .setTitle('Main blockers to AI adoption and what support you need')
    .setHelpText('Наприклад: немає доступу до інструменту, заборона клієнта, бракує часу на навчання, ' +
                 'потрібні готові промпти під домен.')
    .setRequired(false)
    .getId();

  map.win = form.addParagraphTextItem()
    .setTitle('Best AI win this period (1–2 sentences)')
    .setHelpText('Короткий кейс, який варто показати іншим командам.')
    .setRequired(false)
    .getId();

  return pb;
}

function addPercentItem_(form, title, help) {
  var validation = FormApp.createTextValidation()
    .setHelpText('Введіть число від 0 до 100.')
    .requireNumberBetween(0, 100)
    .build();
  return form.addTextItem()
    .setTitle(title)
    .setHelpText(help)
    .setRequired(false)
    .setValidation(validation)
    .getId();
}

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

function wireProjectNavigation_(form, map, pbNewProject, pbUsage) {
  var item = form.getItemById(map.project).asListItem();
  var choices = PROJECTS.map(function (p) { return item.createChoice(p.name, pbUsage); });
  choices.push(item.createChoice(PROJECT_OTHER, pbNewProject));
  item.setChoices(choices);
}

function wireBasisNavigation_(item, pbMeasured, pbEstimate) {
  item.setChoices([
    item.createChoice(REPORTING_BASIS.MEASURED, pbMeasured),
    item.createChoice(REPORTING_BASIS.ESTIMATED, pbEstimate)
  ]);
}
