/**
 * Menu.gs — меню «AI STLC» у таблиці.
 *
 * onOpen — простий тригер, тому для користувачів без права редагування він може
 * не спрацювати; усі ці функції також запускаються з редактора Apps Script.
 */

function onOpen() {
  if (!hasSpreadsheetUi_()) { return; }
  SpreadsheetApp.getUi()
    .createMenu('AI STLC')
    .addItem('Налаштувати (форма + аркуші + тригер)', 'menuSetup')
    .addItem('Показати посилання на форму', 'menuShowFormLink')
    .addSeparator()
    .addItem('Перерахувати все з відповідей', 'menuRecomputeAll')
    .addItem('Оновити умовне форматування', 'menuReapplyFormatting')
    .addItem('Оновити звіт про покриття', 'menuRefreshCoverage')
    .addSeparator()
    .addItem('Зберегти знімок періоду', 'menuSnapshot')
    .addItem('Наповнити форму зі скрипта', 'menuPopulateForm')
    .addSeparator()
    .addItem('Запустити самоперевірку', 'menuSelfTest')
    .addToUi();
}

function menuSetup() {
  var url = setup();
  alert_('Готово', 'Форму наповнено і прив\'язано до цієї таблиці:\n\n' + url +
         '\n\nЦе посилання можна роздавати QA тім-лідам.');
}

function menuShowFormLink() {
  var url = PropertiesService.getScriptProperties().getProperty(PROP.FORM_URL);
  alert_('Посилання на форму', url || 'Форму ще не наповнено — запустіть «Налаштувати».');
}

function menuRecomputeAll() {
  if (!hasSpreadsheetUi_()) { return recomputeAll(); }
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert('Перерахувати все',
    'Усі комірки «Actual, %» за активний період буде очищено і відтворено з останньої ' +
    'відповіді по кожному проєкту. Ручні правки цих комірок буде втрачено. Продовжити?',
    ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) { return; }

  var r = recomputeAll();
  alert_('Перерахунок завершено',
         'Записано проєктів: ' + r.applied +
         (r.skipped.length ? '\nПропущено: ' + r.skipped.join(', ') : ''));
}

function menuReapplyFormatting() {
  applyFormatting();
  alert_('Форматування', 'Правила умовного форматування застосовано до колонок «Actual, %».');
}

function menuRefreshCoverage() {
  buildCoverage();
  alert_('Покриття', 'Аркуш «' + getConfig().COVERAGE_SHEET + '» оновлено.');
}

function menuSnapshot() {
  var name = snapshotPeriod();
  alert_('Знімок', 'Поточні значення збережено на аркуші «' + name + '».');
}

function menuPopulateForm() {
  if (!hasSpreadsheetUi_()) { populateForm(); installTriggers(); return; }
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert('Наповнити форму',
    'Усі поточні питання форми буде видалено і створено заново зі скрипта. ' +
    'Посилання на форму і вже зібрані відповіді зберігаються. Продовжити?',
    ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) { return; }

  var form = populateForm();
  installTriggers();
  alert_('Форму наповнено', form.getPublishedUrl());
}

function menuSelfTest() {
  var r = runSelfTest();
  alert_('Самоперевірка', r.summary + (r.failures.length ? '\n\n' + r.failures.join('\n') : ''));
}

/**
 * Показує діалог, коли скрипт прив'язаний до таблиці, і пише в лог, коли ні
 * (у проєкті, створеному з форми або окремо, SpreadsheetApp.getUi() недоступний).
 */
function alert_(title, message) {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.alert(title, message, ui.ButtonSet.OK);
  } catch (e) {
    Logger.log(title + '\n' + message);
  }
}

/** true, якщо скрипт прив'язаний до таблиці і має UI. */
function hasSpreadsheetUi_() {
  try { SpreadsheetApp.getUi(); return true; } catch (e) { return false; }
}
