/**
 * BuildForm.gs — наповнення Google-форми питаннями.
 *
 * Скрипт працює з ІСНУЮЧОЮ формою за її ID (CONFIG.FORM_ID): він видаляє всі
 * поточні елементи і будує анкету заново. Посилання на форму не змінюється,
 * прив'язка до таблиці відповідей зберігається, раніше зібрані відповіді не
 * зникають.
 *
 * Форму не редагують кліками в UI: відповіді знаходяться за ID елементів
 * (властивість ITEM_MAP), тому додане вручну питання буде проігнороване.
 * Усі зміни — тут, далі меню «AI STLC ▸ Наповнити форму».
 */

var FORM_DESCRIPTION =
  'Опитування для QA тім-лідів: оцінка використання AI на кожній фазі STLC на вашому проєкті.\n\n' +
  'Заповнення займає ~10 хвилин. Відповіді автоматично потрапляють у зведену таблицю ' +
  '«AI QA Optimization — Target vs Actual» у рядок вашого проєкту.\n\n' +
  'Що підготувати заздалегідь: приблизні витрати часу «до AI» і «з AI» по фазах ' +
  '(тайм-логи Jira, таймшити або експертна оцінка). Якщо замірів немає — нічого страшного, ' +
  'у формі є варіант оцінити діапазоном.\n\n' +
  'Принцип фреймворку: AI доповнює, а не замінює інженера. Якщо на якійсь фазі AI не ' +
  'використовується або його неможливо застосувати — так і вкажіть, це коректна і корисна відповідь.';

/**
 * Наповнює форму CONFIG.FORM_ID. Повертає об'єкт Form.
 * Безпечно запускати повторно — форма щоразу перебудовується з нуля.
 */
function populateForm() {
  var cfg = getConfig();
  if (!cfg.FORM_ID) {
    throw new Error('Не задано FORM_ID. Вкажіть його у Config.gs або у властивостях скрипта.');
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
  buildSectionMaturity_(form, map);

  var basisItem = null;
  var pbMeasured = null;
  if (cfg.INCLUDE_MEASURED_HOURS_SECTION) {
    basisItem = buildSectionBasis_(form, map);
    pbMeasured = buildSectionMeasured_(form, map);
  }
  var pbEstimate = buildSectionEstimate_(form, map);
  var pbTools = buildSectionTools_(form, map, cfg);
  // Гілка «AI не використовується» додається останньою і завжди веде на
  // відправку явно — тому її фізична позиція в документі не впливає на решту
  // сторінок, які й далі йдуть одна за одною за замовчуванням (CONTINUE).
  var pbNoAi = buildSectionNoAiPath_(form, map);

  // Переходи можна прописати лише після того, як усі цільові сторінки створені.
  wireProjectNavigation_(form, map, pbNewProject, pbGate);
  pbNewProject.setGoToPage(pbGate);
  wireGateNavigation_(form, map, pbUsage, pbNoAi);
  if (basisItem && pbMeasured) {
    wireBasisNavigation_(basisItem, pbMeasured, pbEstimate);
    pbMeasured.setGoToPage(pbEstimate);
  }
  // Явно фіксуємо кінець «довгого» шляху: без цього кінцева сторінка за
  // замовчуванням продовжила б у наступну за порядком у документі — тепер
  // це секція pbNoAi, а не відправка форми.
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
    .setTitle('Проєкт')
    .setHelpText('Оберіть проєкт зі списку. Якщо вашого проєкту тут немає — оберіть «' +
                 PROJECT_OTHER + '».')
    .setRequired(true);
  map.project = project.getId();   // варіанти задаємо пізніше, коли є сторінки

  map.reporter = form.addTextItem()
    .setTitle('Ваше ім\'я та роль')
    .setHelpText('Наприклад: Іван Петренко, QA Team Lead')
    .setRequired(true)
    .getId();

  map.period = form.addListItem()
    .setTitle('Звітний період')
    .setHelpText('Період, за який ви оцінюєте використання AI на проєкті.')
    .setChoiceValues(PERIODS)
    .setRequired(true)
    .getId();

  map.approach = form.addMultipleChoiceItem()
    .setTitle('Підхід до тестування на проєкті')
    .setHelpText('Впливає на те, які AI-можливості взагалі застосовні на проєкті ' +
                 '(Applicability Matrix, розділ 1.3 фреймворку).')
    .setChoiceValues(TESTING_APPROACHES)
    .setRequired(true)
    .getId();

  map.productType = form.addCheckboxItem()
    .setTitle('Тип продукту')
    .setHelpText('Можна обрати кілька варіантів.')
    .setChoiceValues(PRODUCT_TYPES)
    .setRequired(true)
    .getId();

  map.dataConstraints = form.addMultipleChoiceItem()
    .setTitle('Обмеження щодо даних і приватності')
    .setHelpText('Чи дозволяє клієнт передавати артефакти проєкту в AI-інструменти ' +
                 '(розділ 5 фреймворку, Data & Privacy Governance). Заборона за NDA — ' +
                 'поширена і цілком легітимна причина, чому AI на проєкті не застосовується.')
    .setChoiceValues(DATA_CONSTRAINTS)
    .setRequired(true)
    .getId();
}

/* ------------------------------------------------------------------ */
/* Секція 1b — Новий проєкт (лише після вибору «Інший»)                */
/* ------------------------------------------------------------------ */

function buildSectionNewProject_(form, map) {
  var pb = form.addPageBreakItem()
    .setTitle('Новий проєкт')
    .setHelpText('Цю секцію заповнюють лише ті, хто обрав «' + PROJECT_OTHER + '». ' +
                 'Для проєкту буде створено новий рядок у таблиці.');

  map.newProjectName = form.addTextItem()
    .setTitle('Назва проєкту')
    .setHelpText('Назва так, як вона має з\'явитися у зведеній таблиці.')
    .setRequired(true)
    .getId();

  return pb;
}

/* ------------------------------------------------------------------ */
/* Шлюз — визначає, чи буде решта форми довгою чи короткою              */
/* ------------------------------------------------------------------ */

function buildSectionGate_(form, map) {
  var pb = form.addPageBreakItem()
    .setTitle('Загальне використання AI')
    .setHelpText('Це визначає, наскільки довгою буде решта форми. Якщо оберете «Ні» — ' +
                 'далі буде лише одне коротке питання про причину, без розділів про зрілість, ' +
                 'виміряні дані чи метрики якості.');

  map.overallUsage = form.addMultipleChoiceItem()
    .setTitle('Чи використовується AI хоча б на одній фазі STLC на цьому проєкті?')
    .setHelpText('Якщо на різних фазах причини різні (частина — специфіка продукту, частина — ' +
                 'NDA), або AI використовується хоча б десь — оберіть «Так»: деталі по кожній ' +
                 'фазі окремо вкажете на наступному кроці.')
    .setRequired(true)
    .getId();

  return pb;
}

/* ------------------------------------------------------------------ */
/* Секція 2 — Використання AI по фазах (ядро форми)                    */
/* ------------------------------------------------------------------ */

function buildSectionUsage_(form, map) {
  var pb = form.addPageBreakItem()
    .setTitle('Використання AI по фазах STLC')
    .setHelpText(
      'Для кожної з 8 фаз вкажіть, чи використовуєте ви AI — і чи це взагалі можливо на вашому проєкті.\n\n' +
      'Підказки з Applicability Matrix (розділ 1.3 фреймворку):\n' +
      '• Мануальні проєкти: налаштування середовища застосовне лише частково (генерація ' +
      'синтетичних даних); виконання тестів — лише розумна пріоритизація, бо visual AI ' +
      'потребує автоматизації; автоматизація при нульовому baseline дає ефект через 9–12 місяців.\n' +
      '• Desktop-продукти: налаштування середовища — лише за наявності бекенду або тестової БД; ' +
      'visual regression не застосовний без web-оболонки.\n' +
      '• Робота з дефектами: Jira AI доступний лише в Jira Cloud; на Server/DC — Claude як заміна.');

  map.usageGrid = form.addGridItem()
    .setTitle('Чи використовуєте ви AI на цій фазі — і чи це взагалі можливо на цьому проєкті?')
    .setHelpText('Оберіть один варіант у кожному рядку. Відповідь «Ні» з причиною — ' +
                 'це повноцінна відповідь, вона так і буде відображена в таблиці.')
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
    .setTitle('Зрілість використання AI')
    .setHelpText(
      'Самооцінка за шкалою 0–3 з розділу 3 фреймворку. Сума по 8 фазах (0–24) дає рівень зрілості:\n' +
      'L0 = 0–4 · L1 = 5–8 · L2 = 9–14 · L3 = 15–19 (★ цільовий рівень) · L4 = 20–24.\n' +
      'Ці бали не впливають на колонку «Actual, %» — вони пишуться на окремий аркуш «Зрілість AI».');

  map.maturityGrid = form.addGridItem()
    .setTitle('Рівень зрілості використання AI по фазах (0–3)')
    .setHelpText('0 — фаза виконується повністю вручну; 1 — пробували AI 1–2 рази, процесу немає; ' +
                 '2 — AI використовується систематично, є описаний процес або спільна бібліотека ' +
                 'промптів; 3 — те саме плюс виміряний ефект і квартальний перегляд підходу.')
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
  form.addPageBreakItem()
    .setTitle('На основі чого ви можете оцінити ефект')
    .setHelpText('Принцип фреймворку: «Measure before and after. No baseline = no proof of value.» ' +
                 'Якщо точних замірів немає — це нормально: оцінимо діапазоном, ' +
                 'а в таблиці позначимо рівень довіри до цифри.');

  var item = form.addMultipleChoiceItem()
    .setTitle('На основі чого ви можете оцінити ефект?')
    .setHelpText('Якщо цифри є лише по частині фаз — оберіть перший варіант: ви зможете ввести ' +
                 'години там, де вони є, і оцінити діапазоном решту.')
    .setRequired(true);

  map.basis = item.getId();
  return item;
}

/* ------------------------------------------------------------------ */
/* Секція 5 — Виміряні дані (усі поля опційні)                         */
/* ------------------------------------------------------------------ */

function buildSectionMeasured_(form, map) {
  var pb = form.addPageBreakItem()
    .setTitle('Виміряні дані — було / з AI')
    .setHelpText(
      'Заповнюйте лише ті фази, де у вас є реальні заміри. Усі поля опційні.\n' +
      'Формат: «було / стало», два числа через слеш. Наприклад: 12 / 8.\n' +
      'Одиниці виміру вказані в кожному питанні — головне, щоб обидва числа були в одній одиниці.');

  for (var i = 0; i < PHASES.length; i++) {
    var p = PHASES[i];
    var help = 'Одиниця виміру: ' + p.unit + '. Приклад: ' + p.example + '.';
    if (p.sign > 0) {
      help += ' Увага: тут більше = краще — скільки тест-кейсів на годину проходили раніше ' +
              'і скільки з AI.';
    }
    var validation = FormApp.createTextValidation()
      .setHelpText('Формат: було / з AI, напр. ' + p.example + ' — два числа через слеш.')
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
    .setTitle('Самооцінка ефекту')
    .setHelpText(
      'Оцініть ВЕЛИЧИНУ покращення порівняно з тим, як працювали до AI.\n' +
      'Для фази «Виконання тестів» це приріст пропускної здатності (більше = краще), ' +
      'для решти фаз — скорочення витраченого часу. Знак (мінус/плюс) підставиться автоматично.\n' +
      'Якщо для фази ви вже ввели години в попередній секції — вони мають пріоритет над цією оцінкою.');

  map.estimateGrid = form.addGridItem()
    .setTitle('Оцінене покращення порівняно зі станом до AI')
    .setHelpText('Оберіть один варіант у кожному рядку. Для фаз, де AI не використовується ' +
                 'або неможливий, оберіть «Не застосовно».')
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
    .setTitle('Інструменти та зворотний зв\'язок')
    .setHelpText('Останній блок. Питання про відсотки — опційні, заповнюйте лише якщо ці цифри у вас є.\n\n' +
                 'Увага: ці відсотки — окремі метрики ЯКОСТІ з фреймворку, а НЕ ще один спосіб ' +
                 'вказати Target/Actual за часом із секції 2. Наприклад, ціль ≥70% нижче — це частка ' +
                 'прийнятих тест-кейсів, а не ціль −25…30% фази «Дизайн тестів» із зведеної таблиці.');

  var tools = form.addCheckboxItem()
    .setTitle('Які категорії AI-інструментів ви реально використовували цього періоду?')
    .setHelpText('Категорії з розділу 1.2 фреймворку. Можна обрати кілька.')
    .setChoiceValues(TOOL_CATEGORIES)
    .setRequired(true);
  tools.showOtherOption(true);
  map.tools = tools.getId();

  if (cfg.INCLUDE_EXTRA_METRICS) {
    map.acceptanceRate = addPercentItem_(
      form,
      'Частка AI-згенерованих тест-кейсів, прийнятих без правок, %',
      'Окрема метрика ЯКОСТІ фази «Дизайн тестів» — НЕ пов\'язана зі шкалою Target/Actual за ' +
      'часом вище (там ціль цієї фази −25…30%). Ціль фреймворку саме для цієї метрики: ≥ 70%. ' +
      'Нижче 50% — сигнал, що промпти потребують доопрацювання.');

    map.hallucinationRate = addPercentItem_(
      form,
      'Частка галюцинацій / переробок в AI-артефактах, %',
      'Окрема метрика ЯКОСТІ фази «Робота з дефектами» — НЕ пов\'язана зі шкалою Target/Actual за ' +
      'часом. Частка AI-артефактів (тест-кейсів, баг-репортів), у яких під час рев\'ю знайшли ' +
      'фактичні помилки або вигадані кроки. Типово 3–8% для хмарних LLM.');

    map.automationCoverage = addPercentItem_(
      form,
      'Покриття автоматизацією, %',
      'Окрема метрика ЯКОСТІ фази «Автоматизація тестування» — НЕ пов\'язана зі шкалою ' +
      'Target/Actual за часом. Автоматизовані ТК / усі ТК у наборі × 100. Якщо автоматизації ' +
      'немає — вкажіть 0.');
  }

  map.confidence = form.addMultipleChoiceItem()
    .setTitle('Рівень довіри до наведених вами цифр')
    .setHelpText('Рівень довіри записується в примітку до кожної заповненої комірки таблиці — ' +
                 'це захист від того, щоб оцінка читалася як точний замір.')
    .setChoiceValues(CONFIDENCE_OPTIONS)
    .setRequired(true)
    .getId();

  map.blockers = form.addParagraphTextItem()
    .setTitle('Основні блокери впровадження AI і яка підтримка потрібна')
    .setHelpText('Наприклад: немає доступу до інструменту, заборона клієнта, бракує часу на ' +
                 'навчання, потрібні готові промпти під домен.')
    .setRequired(false)
    .getId();

  map.win = form.addParagraphTextItem()
    .setTitle('Найкращий кейс використання AI за цей період (1–2 речення)')
    .setHelpText('Короткий кейс, який варто показати іншим командам.')
    .setRequired(false)
    .getId();

  return pb;
}

/* ------------------------------------------------------------------ */
/* Коротка гілка — AI не використовується на жодній фазі                */
/* ------------------------------------------------------------------ */

function buildSectionNoAiPath_(form, map) {
  var pb = form.addPageBreakItem()
    .setTitle('AI не використовується на проєкті')
    .setHelpText('Оберіть одну причину — вона застосується до всіх 8 фаз у зведеній таблиці. ' +
                 'Якщо причини відрізняються по фазах, поверніться на попередній крок і оберіть ' +
                 '«Так», щоб вказати їх окремо для кожної фази.');

  map.noAiReason = form.addMultipleChoiceItem()
    .setTitle('Чому AI не використовується на жодній фазі?')
    .setChoiceValues(noAiReasonLabels())
    .setRequired(true)
    .getId();

  map.noAiNeeds = form.addParagraphTextItem()
    .setTitle('Що потрібно, щоб почати використовувати AI на цьому проєкті?')
    .setHelpText('Наприклад: дозвіл клієнта, доступ до інструменту, автоматизація, час на ' +
                 'навчання команди. Це поле опційне.')
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
