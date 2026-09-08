/**
 * Triggers.gs — точка входу та обробник надсилання форми.
 */

/**
 * Одноразове налаштування. Безпечно запускати повторно: форма перебудовується
 * з нуля, службові аркуші створюються лише якщо їх немає.
 */
function setup() {
  var cfg = getConfig();
  var props = PropertiesService.getScriptProperties();

  if (!props.getProperty(PROP.ACTIVE_PERIOD)) {
    props.setProperty(PROP.ACTIVE_PERIOD, cfg.ACTIVE_PERIOD);
  }

  var form = populateForm();

  ensureSheet_(cfg.LOG_SHEET, LOG_HEADERS);
  ensureSheet_(cfg.MATURITY_SHEET, maturityHeaders_());
  applyFormatting();
  buildCoverage();
  installTriggers();

  var url = form.getPublishedUrl();
  props.setProperty(PROP.FORM_URL, url);
  Logger.log('Форма готова: ' + url);
  Logger.log('Редагування форми: ' + form.getEditUrl());
  return url;
}

/** Ставить тригер на надсилання форми, знімаючи попередній. */
function installTriggers() {
  var cfg = getConfig();
  var formId = PropertiesService.getScriptProperties().getProperty(PROP.FORM_ID) || cfg.FORM_ID;
  if (!formId) { throw new Error('Немає ID форми — спочатку запустіть setup().'); }

  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'onFormSubmitHandler') {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }
  ScriptApp.newTrigger('onFormSubmitHandler')
    .forForm(FormApp.openById(formId))
    .onFormSubmit()
    .create();
}

/**
 * Тригер надсилання форми. `e.response` — це FormResponse, тому тригер вішається
 * саме на форму, а не на таблицю: варіант для таблиці віддає лише рядки,
 * підписані заголовками питань, і ламається від першої ж зміни формулювання.
 */
function onFormSubmitHandler(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var submission = parseSubmission(e.response);
    var result = applySubmission(submission);
    if (result.row > 0) {
      writeMaturity(submission);
      applyFormatting();
    }
    logSubmission_(submission, result);
    buildCoverage();
    notifyOwnerIfNeeded_(submission, result);
  } catch (err) {
    logError_(err);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function notifyOwnerIfNeeded_(submission, result) {
  var cfg = getConfig();
  if (!cfg.OWNER_EMAIL) { return; }
  var needsAttention = (result.action === 'НОВИЙ ПРОЄКТ' ||
                        result.action === 'ПРОЄКТ НЕ ЗНАЙДЕНО' ||
                        result.action === 'ІНШИЙ ПЕРІОД' ||
                        (result.warnings && result.warnings.length > 0));
  if (!needsAttention) { return; }

  var body = [
    'Проєкт: ' + submission.projectName,
    'Період: ' + submission.period,
    'Подав: ' + submission.reporter + ' <' + submission.email + '>',
    'Дія: ' + result.action,
    'Рядок: ' + (result.row > 0 ? result.row : 'немає'),
    '',
    'Попередження:',
    (result.warnings || []).map(function (w) { return '  • ' + w; }).join('\n') || '  (немає)',
    '',
    'Записані значення:',
    JSON.stringify(result.written || {}, null, 2)
  ].join('\n');

  MailApp.sendEmail(cfg.OWNER_EMAIL,
    '[AI STLC] ' + result.action + ' — ' + submission.projectName, body);
}

function logError_(err) {
  try {
    var sheet = ensureSheet_(getConfig().LOG_SHEET, LOG_HEADERS);
    sheet.appendRow([new Date(), '', '', '', '', '', '', 'ПОМИЛКА', '', '',
                     String(err && err.stack ? err.stack : err)]);
  } catch (ignore) { /* логування не має маскувати початкову помилку */ }
}

/**
 * Опційне щотижневе нагадування власнику про проєкти, які ще не відзвітували.
 * Вмикається запуском цієї функції вручну з редактора.
 */
function installWeeklyReminder() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'sendReminders') { ScriptApp.deleteTrigger(existing[i]); }
  }
  ScriptApp.newTrigger('sendReminders').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).create();
}

function sendReminders() {
  var cfg = getConfig();
  if (!cfg.OWNER_EMAIL) { return; }
  var missing = coverageStatus_().filter(function (r) { return !r.reported; });
  if (!missing.length) { return; }
  var url = PropertiesService.getScriptProperties().getProperty(PROP.FORM_URL) || '';
  MailApp.sendEmail(cfg.OWNER_EMAIL,
    '[AI STLC] Ще не відзвітували за ' + cfg.ACTIVE_PERIOD + ': ' + missing.length + ' проєкт(ів)',
    'Не заповнили форму:\n' +
    missing.map(function (r) { return '  • ' + r.project; }).join('\n') +
    '\n\nФорма: ' + url);
}
