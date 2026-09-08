/**
 * Triggers.gs — setup entry point and the form-submit handler.
 */

/**
 * One-time bootstrap. Safe to re-run: it reuses the existing form when there is
 * one and only re-creates the service sheets and triggers that are missing.
 */
function setup() {
  var cfg = getConfig();
  var props = PropertiesService.getScriptProperties();

  if (!props.getProperty(PROP.ACTIVE_PERIOD)) {
    props.setProperty(PROP.ACTIVE_PERIOD, cfg.ACTIVE_PERIOD);
  }

  var formId = props.getProperty(PROP.FORM_ID);
  var form;
  if (formId) {
    try { form = FormApp.openById(formId); } catch (e) { form = null; }
  }
  if (!form) { form = createForm(); }

  ensureSheet_(cfg.LOG_SHEET, LOG_HEADERS);
  ensureSheet_(cfg.MATURITY_SHEET, maturityHeaders_());
  applyFormatting();
  buildCoverage();
  installTriggers();

  var url = form.getPublishedUrl();
  props.setProperty(PROP.FORM_URL, url);
  Logger.log('Form ready: ' + url);
  Logger.log('Edit URL: ' + form.getEditUrl());
  return url;
}

/** Installs the form-submit trigger, replacing any previous one. */
function installTriggers() {
  var props = PropertiesService.getScriptProperties();
  var formId = props.getProperty(PROP.FORM_ID);
  if (!formId) { throw new Error('No form yet — run setup() first.'); }

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
 * Installable form-submit trigger. `e.response` is a FormResponse, which is why
 * the trigger is bound to the form rather than to the spreadsheet (the
 * spreadsheet variant only exposes header-keyed strings and breaks on re-wording).
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
  var needsAttention = (result.action === 'NEW_PROJECT' ||
                        result.action === 'PROJECT_NOT_FOUND' ||
                        result.action === 'ARCHIVED_ONLY' ||
                        (result.warnings && result.warnings.length > 0));
  if (!needsAttention) { return; }

  var body = [
    'Project: ' + submission.projectName,
    'Period: ' + submission.period,
    'Reported by: ' + submission.reporter + ' <' + submission.email + '>',
    'Action: ' + result.action,
    'Row: ' + (result.row > 0 ? result.row : 'n/a'),
    '',
    'Warnings:',
    (result.warnings || []).map(function (w) { return '  • ' + w; }).join('\n') || '  (none)',
    '',
    'Written values:',
    JSON.stringify(result.written || {}, null, 2)
  ].join('\n');

  MailApp.sendEmail(cfg.OWNER_EMAIL,
    '[AI STLC] ' + result.action + ' — ' + submission.projectName, body);
}

function logError_(err) {
  try {
    var sheet = ensureSheet_(getConfig().LOG_SHEET, LOG_HEADERS);
    sheet.appendRow([new Date(), '', '', '', '', '', '', 'ERROR', '', '',
                     String(err && err.stack ? err.stack : err)]);
  } catch (ignore) { /* logging must never mask the original error */ }
}

/**
 * Optional weekly reminder to the owner listing the projects that have not
 * reported for the active period. Install by hand from the menu if wanted.
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
    '[AI STLC] ' + missing.length + ' project(s) have not reported for ' + cfg.ACTIVE_PERIOD,
    'Still missing:\n' +
    missing.map(function (r) { return '  • ' + r.project; }).join('\n') +
    '\n\nForm: ' + url);
}
