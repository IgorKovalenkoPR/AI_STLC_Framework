/**
 * WriteSheet.gs — finds the project row and writes the «Actual, %» columns.
 *
 * The sheet keeps its original A1:T layout: rows 1–3 are the merged header,
 * data starts at row 4, each phase has a Target/Actual column pair. New
 * projects are appended at the bottom, so the header is never touched.
 */

function getMainSheet_() {
  var cfg = getConfig();
  var sheet = getTargetSpreadsheet().getSheetByName(cfg.SHEET_NAME);
  if (!sheet) {
    throw new Error('Sheet "' + cfg.SHEET_NAME + '" not found. ' +
                    'Set the correct name in the script property SHEET_NAME.');
  }
  return sheet;
}

function lastDataRow_(sheet) {
  var cfg = getConfig();
  var values = sheet.getRange(cfg.FIRST_DATA_ROW, cfg.COL_PROJECT,
                              Math.max(1, sheet.getMaxRows() - cfg.FIRST_DATA_ROW + 1), 1).getValues();
  var last = cfg.FIRST_DATA_ROW - 1;
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() !== '') { last = cfg.FIRST_DATA_ROW + i; }
  }
  return last;
}

/** @return {number} 1-based row, or -1 if the project is not in the sheet. */
function findProjectRow(sheet, projectName) {
  var cfg = getConfig();
  var wanted = normaliseProjectName(resolveProjectName(projectName));
  var last = lastDataRow_(sheet);
  if (last < cfg.FIRST_DATA_ROW) { return -1; }
  var values = sheet.getRange(cfg.FIRST_DATA_ROW, cfg.COL_PROJECT,
                              last - cfg.FIRST_DATA_ROW + 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (normaliseProjectName(values[i][0]) === wanted) { return cfg.FIRST_DATA_ROW + i; }
  }
  return -1;
}

/**
 * Appends a row for a project that isn't in the sheet yet: copies formats and
 * Target values from the first data row. Account manager and contract model
 * stay blank — the form doesn't ask for them, that's the manager's own area.
 * @return {number} index of the new row
 */
function appendProjectRow_(sheet, submission) {
  var cfg = getConfig();
  var newRow = lastDataRow_(sheet) + 1;
  if (newRow > sheet.getMaxRows()) { sheet.insertRowsAfter(sheet.getMaxRows(), 1); }

  sheet.getRange(cfg.FIRST_DATA_ROW, 1, 1, 20)
       .copyTo(sheet.getRange(newRow, 1, 1, 20), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);

  sheet.getRange(newRow, cfg.COL_NUM).setValue(newRow - cfg.FIRST_DATA_ROW + 1);
  sheet.getRange(newRow, cfg.COL_PROJECT).setValue(submission.newProject.name);
  sheet.getRange(newRow, cfg.COL_AM).clearContent();
  sheet.getRange(newRow, cfg.COL_MODEL).clearContent();

  for (var i = 0; i < PHASES.length; i++) {
    var p = PHASES[i];
    sheet.getRange(newRow, p.targetCol).setValue(p.target).setNumberFormat(cfg.NUMBER_FORMAT);
    sheet.getRange(newRow, p.actualCol).clearContent().clearNote();
  }
  return newRow;
}

/**
 * Writes one response into the sheet.
 * @return {{row:number, action:string, warnings:string[], written:Object}}
 */
function applySubmission(submission) {
  var cfg = getConfig();
  var sheet = getMainSheet_();
  var warnings = [];
  var action = 'WRITTEN';

  if (submission.period && cfg.ACTIVE_PERIOD && submission.period !== cfg.ACTIVE_PERIOD) {
    // The main sheet always shows the active period; other periods are only logged.
    return {
      row: -1, action: 'OTHER PERIOD',
      warnings: ['Response period "' + submission.period + '" does not match the active period "' +
                 cfg.ACTIVE_PERIOD + '" — the main sheet was not changed.'],
      written: {}
    };
  }

  var row = findProjectRow(sheet, submission.projectName);

  if (row === -1 && submission.isNewProject) {
    row = appendProjectRow_(sheet, submission);
    action = 'NEW PROJECT';
  } else if (row === -1) {
    return {
      row: -1, action: 'PROJECT NOT FOUND',
      warnings: ['Project "' + submission.projectName + '" was not found in column B, ' +
                 'and the response is not marked as a new project. Nothing was written.'],
      written: {}
    };
  } else if (submission.isNewProject) {
    warnings.push('Project "' + submission.newProject.name + '" was submitted as new, but it matches ' +
                  'existing row ' + row + ' — the existing row was updated (fuzzy match).');
  }

  var previous = readActualRow_(sheet, row);
  if (hasAnyValue_(previous) && action !== 'NEW PROJECT') { action = 'OVERWRITTEN'; }

  var written = {};
  for (var i = 0; i < PHASES.length; i++) {
    var phase = PHASES[i];
    var data = submission.phases[phase.key];
    var result = computeActual(data, cfg);
    warnings = warnings.concat(result.warnings);

    var cell = sheet.getRange(row, phase.actualCol);
    if (result.value !== null) {
      cell.setNumberFormat(cfg.NUMBER_FORMAT).setValue(result.value);
      written[phase.key] = formatPercent(result.value);
    } else if (result.text !== null) {
      cell.setNumberFormat(cfg.TEXT_FORMAT).setValue(result.text);
      written[phase.key] = result.text;
    } else {
      written[phase.key] = '(unchanged)';
      continue;
    }
    cell.setNote(buildCellNote_(submission, data, result));
  }

  warnings = warnings.concat(applicabilityWarnings_(submission));
  return { row: row, action: action, warnings: warnings, written: written, previous: previous };
}

function readActualRow_(sheet, row) {
  var out = {};
  for (var i = 0; i < PHASES.length; i++) {
    var v = sheet.getRange(row, PHASES[i].actualCol).getValue();
    out[PHASES[i].key] = (v === '' || v === null) ? null : v;
  }
  return out;
}

function hasAnyValue_(obj) {
  for (var k in obj) { if (obj[k] !== null && obj[k] !== '') { return true; } }
  return false;
}

/** The audit trail lives in the cell note, so the sheet keeps its A1:T layout. */
function buildCellNote_(submission, data, result) {
  var lines = [];
  if (result.value !== null) {
    lines.push('Actual: ' + formatPercent(result.value) +
               (result.source === 'measured' ? ' (measured)' : ' (estimated)'));
    var ok = meetsTarget(data.phase, result.value);
    lines.push('Target: ' + formatPercent(data.phase.target) + ' — ' + (ok ? 'met' : 'not met'));
  } else {
    lines.push('Actual: ' + result.text);
  }
  if (data.hours) {
    lines.push('Source: ' + data.hoursRaw + ' (' + data.phase.unit + ')');
  } else if (result.source === 'estimated') {
    lines.push('Source: self-assessment "' + data.bucketLabel + '"');
  }
  lines.push('Status: ' + (data.statusLabel || 'not specified'));
  if (data.maturityLabel) { lines.push('Maturity: ' + data.maturityLabel); }
  if (submission.confidence) { lines.push('Confidence: ' + submission.confidence); }
  lines.push('Period: ' + submission.period);
  lines.push('Submitted: ' + Utilities.formatDate(submission.timestamp,
              Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') +
             (submission.email ? ' — ' + submission.email : ''));
  if (submission.reporter) { lines.push('Reported by: ' + submission.reporter); }
  lines.push('Response ID: ' + submission.responseId);
  return lines.join('\n');
}

/**
 * Cross-checks responses against the Applicability Matrix (section 1.3) and
 * Governance (section 5). Nothing is blocked — implausible combinations are
 * just surfaced to the QA manager.
 */
function applicabilityWarnings_(submission) {
  var out = [];
  var manual = (submission.approach === TESTING_APPROACHES[0]);
  var used = function (key) {
    var s = submission.phases[key].status;
    return s === 'USED_MEASURED' || s === 'USED_UNMEASURED';
  };

  if (manual && used('p8')) {
    out.push('A manual project reports using AI in test automation — check with the team lead.');
  }
  if (manual && used('p4')) {
    out.push('A manual project reports using AI in environment setup — the framework ' +
             'limits this to synthetic data generation. Confirm exactly what was measured.');
  }
  if (submission.dataConstraints === DATA_CONSTRAINTS[2]) {
    var anyUsed = false;
    for (var i = 0; i < PHASES.length; i++) { if (used(PHASES[i].key)) { anyUsed = true; } }
    if (anyUsed) {
      out.push('AI usage is reported even though the project is marked as restricted under NDA — ' +
               'confirm which tools were approved (framework section 5).');
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Support sheets                                                      */
/* ------------------------------------------------------------------ */

function ensureSheet_(name, headers) {
  var ss = getTargetSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers && headers.length) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

var LOG_HEADERS = ['Timestamp', 'Response ID', 'Email', 'Reported by', 'Project', 'Row', 'Period',
                   'Action', 'Written values', 'Previous values', 'Warnings'];

function logSubmission_(submission, result) {
  var sheet = ensureSheet_(getConfig().LOG_SHEET, LOG_HEADERS);
  sheet.appendRow([
    submission.timestamp,
    submission.responseId,
    submission.email,
    submission.reporter,
    submission.projectName,
    result.row > 0 ? result.row : '',
    submission.period,
    result.action,
    JSON.stringify(result.written || {}),
    JSON.stringify(result.previous || {}),
    (result.warnings || []).join(' | ')
  ]);
}

var FEEDBACK_HEADERS = ['Timestamp', 'Project', 'Period', 'AI tool categories',
                        'Accepted suggestions, %', 'Hallucination rate, %', 'Automation coverage, %',
                        'Confidence level', 'Main blockers', 'Best win', 'Reported by', 'Response ID'];

/**
 * Form section 7 (tool categories, quality metrics, blockers, best win) doesn't
 * belong to any single phase and so has no home in the "Actual, %" columns —
 * it's logged here as its own row, otherwise these answers would go nowhere.
 */
function logFeedback_(submission) {
  var sheet = ensureSheet_(getConfig().FEEDBACK_SHEET, FEEDBACK_HEADERS);
  sheet.appendRow([
    submission.timestamp,
    submission.projectName,
    submission.period,
    (submission.tools || []).join(', '),
    submission.acceptanceRate,
    submission.hallucinationRate,
    submission.automationCoverage,
    submission.confidence,
    submission.blockers,
    submission.win,
    submission.reporter,
    submission.responseId
  ]);
}
