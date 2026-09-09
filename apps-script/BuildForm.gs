/**
 * BuildForm.gs — наповнення Google-форми питаннями.
 *
 * Скрипт працює з ІСНУЮЧОЮ формою за її ID (CONFIG.FORM_ID): він видаляє всі
 * поточні елементи і будує анкету заново. Посилання на форму не змінюється,
 * прив'язка до таблиці відповідей зберігається, раніше зібрані відповіді не
 * зникають.
 *
 * Форма — англійською (респонденти й таблиця можуть бути міжнародними);
 * код і коментарі лишаються українською.
 *
 * Форму не редагують кліками в UI: відповіді знаходяться за ID елементів
 * (властивість ITEM_MAP), тому додане вручну питання буде проігнороване.
 * Усі зміни — тут, далі меню «AI STLC ▸ Наповнити форму».
 */

var FORM_DESCRIPTION =
  'A survey for QA team leads: assess AI usage across each STLC phase on your project.\n\n' +
  'Takes about 10 minutes. Your answers are written automatically into the ' +
  '"AI QA Optimization — Target vs Actual" spreadsheet, into your project\'s row.\n\n' +
  'What to prepare beforehand: rough time spent "before AI" and "with AI" per phase ' +
  '(Jira time logs, timesheets, or expert judgement). No measurements? That\'s fine — ' +
  'the form has an option to estimate a range instead.\n\n' +
  'Framework principle: AI augments the engineer, it does not replace them. If AI is not ' +
  'used on a phase, or cannot be used there — say so, that is a correct and useful answer.';

/**
 * Наповнює форму CONFIG.FORM_ID. Повертає об'єкт Form.
 * Безпечно запускати повторно — форма щоразу перебудовується з нуля.
 */
function populateForm() {
  var cfg = getConfig();
  if (!cfg.FORM_ID) {
    throw new Error('FORM_ID is not set. Specify it in Config.gs or in the script properties.');
  }
  var form = FormApp.openById(cfg.FORM_ID);

  clearForm_(form);

  form.setTitle(cfg.FORM_TITLE);
  form.setDescription(FORM_DESCRIPTION);
  form.setProgressBar(true);
  form.setShuffleQuestions(false);
  form.setAllowResponseEdits(true);
  form.setLimitOneResponsePerUser(false);
  // Нова форма й так приймає відповіді за замовчуванням; сам виклик іноді кидає
  // «Operation not supported on unpublished form» на формах, створених через UI
  // (а не FormApp.create()), тому він необов'язковий і обгорнутий у try/catch.
  try { form.setAcceptingResponses(true); } catch (e) { /* форма вже приймає відповіді */ }
  if (cfg.COLLECT_EMAIL) { enableEmailCollection_(form); }

  var map = { hours: {} };

  buildSectionContext_(form, map);
  var pbNewProject = buildSectionNewProject_(form, map);
  var pbGate = buildSectionGate_(form, map);
  var pbUsage = buildSectionUsage_(form, map);
  var pbMaturity = buildSectionMaturity_(form, map);

  var basisItem = null;
  var pbBasis = null;
  var pbMeasured = null;
  if (cfg.INCLUDE_MEASURED_HOURS_SECTION) {
    var basis = buildSectionBasis_(form, map);
    pbBasis = basis.pb;
    basisItem = basis.item;
    pbMeasured = buildSectionMeasured_(form, map);
  }
  var pbEstimate = buildSectionEstimate_(form, map);
  var pbTools = buildSectionTools_(form, map, cfg);
  // Гілка «AI не використовується» додається останньою і завжди веде на
  // відправку явно — тому її фізична позиція в документі не впливає на решту
  // сторінок.
  var pbNoAi = buildSectionNoAiPath_(form, map);

  // Жоден перехід не покладається на типову поведінку Google Forms
  // («продовжити за порядком у документі») — вона виявилась ненадійною
  // (саме через неї секція «Інструменти» одного разу випала з навігації).
  // Кожен крок прописано явно.
  wireProjectNavigation_(form, map, pbNewProject, pbGate);
  pbNewProject.setGoToPage(pbGate);
  wireGateNavigation_(form, map, pbUsage, pbNoAi);
  pbUsage.setGoToPage(pbMaturity);
  pbMaturity.setGoToPage(pbBasis || pbEstimate);
  if (basisItem && pbMeasured) {
    wireBasisNavigation_(basisItem, pbMeasured, pbEstimate);
    pbMeasured.setGoToPage(pbEstimate);
  }
  pbEstimate.setGoToPage(pbTools);
  pbTools.setGoToPage(FormApp.PageNavigationType.SUBMIT);
  pbNoAi.setGoToPage(FormApp.PageNavigationType.SUBMIT);

  ensureDestination_(form);

  var props = PropertiesService.getScriptProperties();
  props.setProperty(PROP.FORM_ID, form.getId());
  props.setProperty(PROP.FORM_URL, form.getPublishedUrl());
  props.setProperty(PROP.ITEM_MAP, JSON.stringify(map));

  return form;
}

/**
 * Видаляє всі елементи форми. Зібрані раніше відповіді зберігаються.
 *
 * Форма має перехресну навігацію між секціями (setGoToPage на розділювачах
 * сторінок і page-таргети у варіантах відповіді Q1/Q7-шлюзу/Q9). Якщо просто
 * видаляти елементи один за одним, Google Forms відхиляє видалення елемента,
 * на який ще посилається інший, ще не видалений елемент, з помилкою
 * "Invalid data updating form". Тому спершу знімаємо всю навігацію (зводимо
 * її до "звичайного продовження" і "звичайних" варіантів без переходів), і
 * лише потім видаляємо — тепер уже в будь-якому порядку.
 */
function clearForm_(form) {
  var items = form.getItems();

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var type = item.getType();
    if (type === FormApp.ItemType.PAGE_BREAK) {
      item.asPageBreakItem().setGoToPage(FormApp.PageNavigationType.CONTINUE);
    } else if (type === FormApp.ItemType.MULTIPLE_CHOICE || type === FormApp.ItemType.LIST) {
      var typed = (type === FormApp.ItemType.LIST) ? item.asListItem() : item.asMultipleChoiceItem();
      var plainChoices = typed.getChoices().map(function (c) { return typed.createChoice(c.getValue()); });
      typed.setChoices(plainChoices);
    }
  }

  for (var j = items.length - 1; j >= 0; j--) {
    form.deleteItem(items[j]);
  }
}

/**
 * Прив'язує форму до таблиці, лише якщо вона ще не прив'язана до потрібної.
 * Повторний setDestination створив би зайвий аркуш відповідей.
 */
function ensureDestination_(form) {
  var ss = getTargetSpreadsheet();
  var current = null;
  try { current = form.getDestinationId(); } catch (e) { current = null; }
  if (current !== ss.getId()) {
    form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  }
}

function enableEmailCollection_(form) {
  try {
    form.setEmailCollectionType(FormApp.EmailCollectionType.VERIFIED);
  } catch (e) {
    try { form.setCollectEmail(true); } catch (e2) { /* інша версія рантайму — пропускаємо */ }
  }
}

/* ------------------------------------------------------------------ */
/* Секція 1 — Контекст проєкту                                         */
/* ------------------------------------------------------------------ */

function buildSectionContext_(form, map) {
  var project = form.addListItem()
    .setTitle('Project')
    .setHelpText('Choose your project from the list. If it is not there, choose "' +
                 PROJECT_OTHER + '".')
    .setRequired(true);
  map.project = project.getId();   // варіанти задаємо пізніше, коли є сторінки

  map.reporter = form.addTextItem()
    .setTitle('Your name and role')
    .setHelpText('Example: Ivan Petrenko, QA Team Lead')
    .setRequired(true)
    .getId();

  map.period = form.addListItem()
    .setTitle('Reporting period')
    .setHelpText('The period you are assessing AI usage for on this project.')
    .setChoiceValues(PERIODS)
    .setRequired(true)
    .getId();

  map.approach = form.addMultipleChoiceItem()
    .setTitle('Testing approach on the project')
    .setHelpText('Affects which AI capabilities are applicable at all on this project ' +
                 '(Applicability Matrix, framework section 1.3).')
    .setChoiceValues(TESTING_APPROACHES)
    .setRequired(true)
    .getId();

  map.productType = form.addCheckboxItem()
    .setTitle('Product type')
    .setHelpText('You can select more than one.')
    .setChoiceValues(PRODUCT_TYPES)
    .setRequired(true)
    .getId();

  map.dataConstraints = form.addMultipleChoiceItem()
    .setTitle('Data & privacy constraints')
    .setHelpText('Does the client allow project artefacts to be shared with AI tools ' +
                 '(framework section 5, Data & Privacy Governance)? An NDA restriction is a ' +
                 'common and entirely legitimate reason AI is not used on a project.')
    .setChoiceValues(DATA_CONSTRAINTS)
    .setRequired(true)
    .getId();
}

/* ------------------------------------------------------------------ */
/* Секція 1b — Новий проєкт (лише після вибору «Інший»)                */
/* ------------------------------------------------------------------ */

function buildSectionNewProject_(form, map) {
  var pb = form.addPageBreakItem()
    .setTitle('New project')
    .setHelpText('This section is only for those who chose "' + PROJECT_OTHER + '". ' +
                 'A new row will be created for this project in the spreadsheet.');

  map.newProjectName = form.addTextItem()
    .setTitle('Project name')
    .setHelpText('The name as it should appear in the summary spreadsheet.')
    .setRequired(true)
    .getId();

  return pb;
}

/* ------------------------------------------------------------------ */
/* Шлюз — визначає, чи буде решта форми довгою чи короткою              */
/* ------------------------------------------------------------------ */

function buildSectionGate_(form, map) {
  var pb = form.addPageBreakItem()
    .setTitle('Overall AI usage')
    .setHelpText('This determines how long the rest of the form is. If you choose "No" — ' +
                 'the only remaining question is a short one about the reason, with no sections ' +
                 'on maturity, measured data, or quality metrics.');

  map.overallUsage = form.addMultipleChoiceItem()
    .setTitle('Is AI used in at least one STLC phase on this project?')
    .setHelpText('If the reasons differ across phases (some are product-specific, some are ' +
                 'NDA-related), or AI is used somewhere at all — choose "Yes": you will give ' +
                 'details per phase on the next step.')
    .setRequired(true)
    .getId();

  return pb;
}

/* ------------------------------------------------------------------ */
/* Секція 2 — Використання AI по фазах (ядро форми)                    */
/* ------------------------------------------------------------------ */

function buildSectionUsage_(form, map) {
  var pb = form.addPageBreakItem()
    .setTitle('AI usage per STLC phase')
    .setHelpText(
      'For each of the 8 phases, indicate whether you use AI — and whether it is even ' +
      'possible on your project.\n\n' +
      'Hints from the Applicability Matrix (framework section 1.3):\n' +
      '• Manual-only projects: environment setup is only partially applicable (synthetic ' +
      'data generation); test execution is limited to smart prioritisation, since visual AI ' +
      'requires automation; automation gives results after 9–12 months from a zero baseline.\n' +
      '• Desktop products: environment setup only applies if there is a backend or test DB; ' +
      'visual regression does not apply without a web shell.\n' +
      '• Defect management: Jira AI is available on Jira Cloud only; on Server/DC, Claude is ' +
      'the substitute.');

  map.usageGrid = form.addGridItem()
    .setTitle('Do you use AI in this phase — and is it even possible on this project?')
    .setHelpText('Choose one option per row. A "No" with a reason is a complete, valid answer ' +
                 'and will be reflected in the spreadsheet exactly as such.')
    .setRows(PHASES.map(function (p) { return p.short; }))
    .setColumns(statusLabels())
    .setRequired(true)
    .getId();

  return pb;
}

/* ------------------------------------------------------------------ */
/* Секція 3 — Зрілість використання AI                                 */
/* ------------------------------------------------------------------ */

function buildSectionMaturity_(form, map) {
  var pb = form.addPageBreakItem()
    .setTitle('AI maturity')
    .setHelpText(
      'A 0–3 self-assessment from framework section 3. The sum across 8 phases (0–24) gives ' +
      'a maturity level:\n' +
      'L0 = 0–4 · L1 = 5–8 · L2 = 9–14 · L3 = 15–19 (★ target level) · L4 = 20–24.\n' +
      'These scores do not affect the "Actual, %" column — they are written to a separate ' +
      '"AI Maturity" sheet.');

  map.maturityGrid = form.addGridItem()
    .setTitle('AI maturity level per phase (0–3)')
    .setHelpText('0 — the phase is fully manual; 1 — tried AI 1–2 times, no process; ' +
                 '2 — AI is used systematically, there is a defined process or a shared prompt ' +
                 'library; 3 — same as 2, plus a measured effect and a quarterly review of the ' +
                 'approach.')
    .setRows(PHASES.map(function (p) { return p.short; }))
    .setColumns(MATURITY_OPTIONS)
    .setRequired(true)
    .getId();

  return pb;
}

/* ------------------------------------------------------------------ */
/* Секція 4 — На основі чого звітуєте                                  */
/* ------------------------------------------------------------------ */

function buildSectionBasis_(form, map) {
  var pb = form.addPageBreakItem()
    .setTitle('What your impact estimate is based on')
    .setHelpText('Framework principle: "Measure before and after. No baseline = no proof of ' +
                 'value." If you do not have exact measurements, that is fine — we will estimate ' +
                 'a range, and the spreadsheet will record your confidence level for the figure.');

  var item = form.addMultipleChoiceItem()
    .setTitle('What can you base your impact estimate on?')
    .setHelpText('If you only have numbers for some phases, choose the first option: you will ' +
                 'be able to enter hours where you have them and estimate a range for the rest.')
    .setRequired(true);

  map.basis = item.getId();
  return { pb: pb, item: item };
}

/* ------------------------------------------------------------------ */
/* Секція 5 — Виміряні дані (усі поля опційні)                         */
/* ------------------------------------------------------------------ */

function buildSectionMeasured_(form, map) {
  var pb = form.addPageBreakItem()
    .setTitle('Measured data — baseline vs. with AI')
    .setHelpText(
      'Fill in only the phases where you have real measurements. All fields are optional.\n' +
      'Format: "baseline / with AI", two numbers separated by a slash. Example: 12 / 8.\n' +
      'Units are given in each question — the only requirement is that both numbers use the ' +
      'same unit.');

  for (var i = 0; i < PHASES.length; i++) {
    var p = PHASES[i];
    var help = 'Unit: ' + p.unit + '. Example: ' + p.example + '.';
    if (p.sign > 0) {
      help += ' Note: here bigger = better — how many test cases per hour you completed before ' +
              'and with AI.';
    }
    var validation = FormApp.createTextValidation()
      .setHelpText('Format: baseline / with AI, e.g. ' + p.example + ' — two numbers separated by a slash.')
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
/* Секція 6 — Самооцінка ефекту (фолбек без baseline)                  */
/* ------------------------------------------------------------------ */

function buildSectionEstimate_(form, map) {
  var pb = form.addPageBreakItem()
    .setTitle('Self-assessed impact')
    .setHelpText(
      'Estimate the MAGNITUDE of improvement compared to how you worked before AI.\n' +
      'For "Test Execution" this is a throughput gain (bigger = better); for every other ' +
      'phase it is a reduction in time spent. The sign (minus/plus) is applied automatically.\n' +
      'If you already entered hours for a phase in the previous section, they take priority ' +
      'over this estimate.');

  map.estimateGrid = form.addGridItem()
    .setTitle('Estimated improvement vs. before AI')
    .setHelpText('Choose one option per row. For phases where AI is not used or not possible, ' +
                 'choose "Not applicable".')
    .setRows(PHASES.map(function (p) { return p.short; }))
    .setColumns(BUCKET_ORDER)
    .setRequired(true)
    .getId();

  return pb;
}

/* ------------------------------------------------------------------ */
/* Секція 7 — Інструменти, сигнали якості, зворотний зв'язок           */
/* ------------------------------------------------------------------ */

function buildSectionTools_(form, map, cfg) {
  var pb = form.addPageBreakItem()
    .setTitle('Tools & feedback')
    .setHelpText('Last block. The percentage questions are optional — fill them in only if ' +
                 'you have those numbers.\n\n' +
                 'Note: these percentages are separate QUALITY metrics from the framework, not ' +
                 'another way to state the Target/Actual time figures from section 2. For ' +
                 'example, the ≥70% target below is the share of accepted test cases, not the ' +
                 '−25…30% target of the "Test Design" phase from the summary table.');

  var tools = form.addCheckboxItem()
    .setTitle('Which AI tool categories did you actually use this period?')
    .setHelpText('Categories from framework section 1.2. You can select more than one.')
    .setChoiceValues(TOOL_CATEGORIES)
    .setRequired(true);
  tools.showOtherOption(true);
  map.tools = tools.getId();

  if (cfg.INCLUDE_EXTRA_METRICS) {
    map.acceptanceRate = addPercentItem_(
      form,
      'Share of AI-generated test cases accepted without edits, %',
      'A separate QUALITY metric for the "Test Design" phase — NOT related to the Target/Actual ' +
      'time scale above (that phase\'s target there is −25…30%). The framework target for this ' +
      'metric specifically is ≥ 70%. Below 50% is a signal that prompts need refinement.');

    map.hallucinationRate = addPercentItem_(
      form,
      'Share of hallucinations / rework in AI artefacts, %',
      'A separate QUALITY metric for the "Defect Management" phase — NOT related to the ' +
      'Target/Actual time scale. The share of AI artefacts (test cases, bug reports) where ' +
      'review found factual errors or invented steps. Typically 3–8% for cloud LLMs.');

    map.automationCoverage = addPercentItem_(
      form,
      'Automation coverage, %',
      'A separate QUALITY metric for the "Test Automation" phase — NOT related to the ' +
      'Target/Actual time scale. Automated TCs / all TCs in the suite × 100. If there is no ' +
      'automation, enter 0.');
  }

  map.confidence = form.addMultipleChoiceItem()
    .setTitle('Confidence in the figures you reported')
    .setHelpText('Your confidence level is recorded in the note on every filled-in cell — this ' +
                 'protects against an estimate being read as an exact measurement.')
    .setChoiceValues(CONFIDENCE_OPTIONS)
    .setRequired(true)
    .getId();

  map.blockers = form.addParagraphTextItem()
    .setTitle('Main blockers to AI adoption and what support you need')
    .setHelpText('Example: no access to a tool, client restriction, no time for training, need ' +
                 'ready-made domain prompts.')
    .setRequired(false)
    .getId();

  map.win = form.addParagraphTextItem()
    .setTitle('Best AI win this period (1–2 sentences)')
    .setHelpText('A short case worth sharing with other teams.')
    .setRequired(false)
    .getId();

  return pb;
}

/* ------------------------------------------------------------------ */
/* Коротка гілка — AI не використовується на жодній фазі                */
/* ------------------------------------------------------------------ */

function buildSectionNoAiPath_(form, map) {
  var pb = form.addPageBreakItem()
    .setTitle('AI is not used on this project')
    .setHelpText('Choose one reason — it will apply to all 8 phases in the summary table. If ' +
                 'the reasons differ by phase, go back to the previous step and choose "Yes" so ' +
                 'you can specify them per phase.');

  map.noAiReason = form.addMultipleChoiceItem()
    .setTitle('Why is AI not used in any phase?')
    .setChoiceValues(noAiReasonLabels())
    .setRequired(true)
    .getId();

  map.noAiNeeds = form.addParagraphTextItem()
    .setTitle('What would it take to start using AI on this project?')
    .setHelpText('Example: client approval, tool access, automation, time to train the team. ' +
                 'This field is optional.')
    .setRequired(false)
    .getId();

  return pb;
}

function addPercentItem_(form, title, help) {
  var validation = FormApp.createTextValidation()
    .setHelpText('Enter a number between 0 and 100.')
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
/* Переходи між секціями                                               */
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

function wireGateNavigation_(form, map, pbUsage, pbNoAi) {
  var item = form.getItemById(map.overallUsage).asMultipleChoiceItem();
  item.setChoices([
    item.createChoice(OVERALL_USAGE.YES, pbUsage),
    item.createChoice(OVERALL_USAGE.NO, pbNoAi)
  ]);
}
