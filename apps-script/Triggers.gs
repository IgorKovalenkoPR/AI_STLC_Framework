/**
 * Triggers.gs — entry point and the form-submit handler.
 */

/**
 * One-time setup. Safe to run again: the form is rebuilt from scratch, and
 * support sheets are created only if they don't already exist.
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
  ensureSheet_(cfg.FEEDBACK_SHEET, FEEDBACK_HEADERS);
  applyFormatting();
  buildCoverage();
  installTriggers();

  var url = form.getPublishedUrl();
  props.setProperty(PROP.FORM_URL, url);
  Logger.log('Form is ready: ' + url);
  Logger.log('Form edit link: ' + form.getEditUrl());
  return url;
}

/** Installs the form-submit trigger, removing any previous one. */
function installTriggers() {
  var cfg = getConfig();
  var formId = PropertiesService.getScriptProperties().getProperty(PROP.FORM_ID) || cfg.FORM_ID;
  if (!formId) { throw new Error('No form ID — run setup() first.'); }

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
 * Form-submit trigger. `e.response` is a FormResponse, so the trigger is bound
 * to the form itself rather than the sheet: the sheet-bound variant only hands
 * back rows keyed by question headers, and breaks the moment wording changes.
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
    logFeedback_(submission);
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
  var needsAttention = (result.action === 'NEW PROJECT' ||
                        result.action === 'PROJECT NOT FOUND' ||
                        result.action === 'OTHER PERIOD' ||
                        (result.warnings && result.warnings.length > 0));
  if (!needsAttention) { return; }

  var body = [
    'Project: ' + submission.projectName,
    'Period: ' + submission.period,
    'Submitted by: ' + submission.reporter + ' <' + submission.email + '>',
    'Action: ' + result.action,
    'Row: ' + (result.row > 0 ? result.row : 'none'),
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
  } catch (ignore) { /* logging must not mask the original error */ }
}

/**
 * Optional weekly reminder to the owner about projects that haven't reported
 * yet. Enabled by running this function manually from the editor.
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
    '[AI STLC] Not yet reported for ' + cfg.ACTIVE_PERIOD + ': ' + missing.length + ' project(s)',
    'Have not filled in the form:\n' +
    missing.map(function (r) { return '  • ' + r.project; }).join('\n') +
    '\n\nForm: ' + url);
}
