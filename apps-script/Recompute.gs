/**
 * Recompute.gs — rebuild the Actual columns from the stored form responses,
 * plus the coverage report and the end-of-period snapshot.
 *
 * "Recompute all" is the recovery path: editing a submitted response does not
 * reliably re-fire the submit trigger, and a trigger can fail (quota, timeout).
 * Replaying the responses makes the sheet a pure function of the response log.
 */

/**
 * Повне очищення тестових даних: чистить Actual-колонки, "Журнал відповідей",
 * "Зрілість AI" і перебудовує "Покриття" з нуля. НЕ чіпає Target-колонки,
 * заголовки чи форматування — лише накопичені дані.
 *
 * Apps Script не має API для видалення відповідей форми — це єдиний крок,
 * який лишається зробити вручну: форма → Відповіді → ⋮ → Видалити всі відповіді.
 * Робіть це ДО запуску resetAllData(), інакше recomputeAll() (не викликається
 * тут) міг би одразу відновити щойно стерті рядки зі старих відповідей.
 */
function resetAllData() {
  var cfg = getConfig();
  var ss = getTargetSpreadsheet();

  clearActualColumns_();
  clearDataRows_(ss.getSheetByName(cfg.LOG_SHEET));
  clearDataRows_(ss.getSheetByName(cfg.MATURITY_SHEET));

  buildCoverage();
  return { cleared: true };
}

/** Прибирає всі рядки з даними, лишаючи заголовок (рядок 1). */
function clearDataRows_(sheet) {
  if (!sheet || sheet.getLastRow() <= 1) { return; }
  sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
}

/**
 * Clears and rebuilds every Actual cell for the active period using the latest
 * response per project.
 */
function recomputeAll() {
  var cfg = getConfig();
  var props = PropertiesService.getScriptProperties();
  var formId = props.getProperty(PROP.FORM_ID) || cfg.FORM_ID;
  if (!formId) { throw new Error('Форму ще не наповнено — спочатку запустіть setup().'); }

  var responses = FormApp.openById(formId).getResponses();
  var latest = {};   // normalised project -> submission (active period only)

  for (var i = 0; i < responses.length; i++) {
    var s;
    try { s = parseSubmission(responses[i]); } catch (e) { continue; }
    if (cfg.ACTIVE_PERIOD && s.period !== cfg.ACTIVE_PERIOD) { continue; }
    var key = normaliseProjectName(s.projectName);
    if (!latest[key] || s.timestamp > latest[key].timestamp) { latest[key] = s; }
  }

  clearActualColumns_();

  var applied = 0;
  var skipped = [];
  for (var k in latest) {
    var result = applySubmission(latest[k]);
    if (result.row > 0) { writeMaturity(latest[k]); applied++; }
    else { skipped.push(latest[k].projectName + ' (' + result.action + ')'); }
    logSubmission_(latest[k], result);
  }

  applyFormatting();
  buildCoverage();
  return { applied: applied, skipped: skipped };
}

function clearActualColumns_() {
  var cfg = getConfig();
  var sheet = getMainSheet_();
  var firstRow = cfg.FIRST_DATA_ROW;
  var lastRow = Math.max(lastDataRow_(sheet), firstRow);
  for (var i = 0; i < PHASES.length; i++) {
    var range = sheet.getRange(firstRow, PHASES[i].actualCol, lastRow - firstRow + 1, 1);
    range.clearContent();
    range.clearNote();
    range.setNumberFormat(cfg.NUMBER_FORMAT);
  }
}

/* ------------------------------------------------------------------ */
/* Coverage                                                            */
/* ------------------------------------------------------------------ */

function coverageStatus_() {
  var cfg = getConfig();
  var sheet = getMainSheet_();
  var firstRow = cfg.FIRST_DATA_ROW;
  var lastRow = Math.max(lastDataRow_(sheet), firstRow);
  var names = sheet.getRange(firstRow, cfg.COL_PROJECT, lastRow - firstRow + 1, 1).getValues();

  var out = [];
  for (var i = 0; i < names.length; i++) {
    var project = String(names[i][0]).trim();
    if (!project) { continue; }
    var row = firstRow + i;
    var filled = 0;
    for (var p = 0; p < PHASES.length; p++) {
      var v = sheet.getRange(row, PHASES[p].actualCol).getValue();
      if (v !== '' && v !== null) { filled++; }
    }
    out.push({ project: project, row: row, filled: filled, reported: filled > 0 });
  }
  return out;
}

function buildCoverage() {
  var cfg = getConfig();
  var sheet = ensureSheet_(cfg.COVERAGE_SHEET,
    ['Проєкт', 'Рядок', 'Заповнено фаз (з 8)', 'Статус', 'Період', 'Оновлено']);
  var status = coverageStatus_();
  var now = new Date();

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).clearContent();
  }
  if (!status.length) { return; }

  var rows = status.map(function (r) {
    return [r.project, r.row, r.filled, r.reported ? 'Відзвітував' : 'Немає даних', cfg.ACTIVE_PERIOD, now];
  });
  sheet.getRange(2, 1, rows.length, 6).setValues(rows);
}

/* ------------------------------------------------------------------ */
/* End-of-period snapshot                                              */
/* ------------------------------------------------------------------ */

/** Copies the current Actual columns to "Archive <period>" so history survives. */
function snapshotPeriod() {
  var cfg = getConfig();
  var sheet = getMainSheet_();
  var name = 'Архів ' + cfg.ACTIVE_PERIOD;
  var ss = getTargetSpreadsheet();
  if (ss.getSheetByName(name)) { ss.deleteSheet(ss.getSheetByName(name)); }

  var headers = ['Проєкт'];
  for (var i = 0; i < PHASES.length; i++) { headers.push(PHASES[i].short); }
  var archive = ss.insertSheet(name);
  archive.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  archive.setFrozenRows(1);

  var firstRow = cfg.FIRST_DATA_ROW;
  var lastRow = Math.max(lastDataRow_(sheet), firstRow);
  var rows = [];
  for (var r = firstRow; r <= lastRow; r++) {
    var project = String(sheet.getRange(r, cfg.COL_PROJECT).getValue()).trim();
    if (!project) { continue; }
    var line = [project];
    for (var p = 0; p < PHASES.length; p++) {
      line.push(sheet.getRange(r, PHASES[p].actualCol).getDisplayValue());
    }
    rows.push(line);
  }
  if (rows.length) { archive.getRange(2, 1, rows.length, headers.length).setValues(rows); }
  return name;
}
