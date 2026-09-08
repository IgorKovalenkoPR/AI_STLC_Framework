/**
 * WriteSheet.gs — locating the project row and writing the "Actual, %" cells.
 *
 * The main sheet keeps its original A1:T shape: rows 1-3 are the merged header
 * block, data starts at row 4, and every phase owns a Target/Actual column pair.
 * New projects are appended below the last data row so the header block is never
 * touched.
 */

function getMainSheet_() {
  var cfg = getConfig();
  var sheet = SpreadsheetApp.getActive().getSheetByName(cfg.SHEET_NAME);
  if (!sheet) {
    throw new Error('Sheet "' + cfg.SHEET_NAME + '" not found. ' +
                    'Set the SHEET_NAME script property to the correct tab name.');
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

/** @return {number} 1-based row, or -1 when the project is not in the sheet. */
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
 * Appends a row for a project the sheet does not know yet, copying formatting
 * and the Target values from the first data row.
 * @return {number} the new row index
 */
function appendProjectRow_(sheet, submission) {
  var cfg = getConfig();
  var last = lastDataRow_(sheet);
  var newRow = last + 1;
  if (newRow > sheet.getMaxRows()) { sheet.insertRowsAfter(sheet.getMaxRows(), 1); }

  // Copy the whole template row (formats only) so borders and % formats carry over.
  sheet.getRange(cfg.FIRST_DATA_ROW, 1, 1, 20)
       .copyTo(sheet.getRange(newRow, 1, 1, 20), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);

  sheet.getRange(newRow, cfg.COL_NUM).setValue(newRow - cfg.FIRST_DATA_ROW + 1);
  sheet.getRange(newRow, cfg.COL_PROJECT).setValue(submission.newProject.name);
  sheet.getRange(newRow, cfg.COL_AM).setValue(submission.newProject.am);
  sheet.getRange(newRow, cfg.COL_MODEL).setValue(submission.newProject.model);

  // Seed the Target columns from the framework defaults, clear the Actual ones.
  for (var i = 0; i < PHASES.length; i++) {
    var p = PHASES[i];
    sheet.getRange(newRow, p.targetCol).setValue(p.target).setNumberFormat(cfg.NUMBER_FORMAT);
    sheet.getRange(newRow, p.actualCol).clearContent().clearNote();
  }
  return newRow;
}

/**
 * Writes one submission into the sheet.
 * @return {{row:number, action:string, warnings:string[], written:Object}}
 */
function applySubmission(submission) {
  var cfg = getConfig();
  var sheet = getMainSheet_();
  var warnings = [];
  var action = 'UPDATE';

  if (submission.period && cfg.ACTIVE_PERIOD && submission.period !== cfg.ACTIVE_PERIOD) {
    // The main sheet always shows the active period; older periods are logged only.
    return {
      row: -1, action: 'ARCHIVED_ONLY',
      warnings: ['Reported period "' + submission.period + '" differs from the active period "' +
                 cfg.ACTIVE_PERIOD + '" — the main sheet was not modified.'],
      written: {}
    };
  }

  var row = findProjectRow(sheet, submission.projectName);

  if (row === -1 && submission.isNewProject) {
    row = appendProjectRow_(sheet, submission);
    action = 'NEW_PROJECT';
  } else if (row === -1) {
    return {
      row: -1, action: 'PROJECT_NOT_FOUND',
      warnings: ['Project "' + submission.projectName + '" was not found in column B and the response ' +
                 'was not marked as a new project. Nothing was written.'],
      written: {}
    };
  } else if (submission.isNewProject) {
    warnings.push('Project "' + submission.newProject.name + '" was submitted as new but matches ' +
                  'existing row ' + row + ' — the existing row was updated (FUZZY_MATCH).');
  }

  var previous = readActualRow_(sheet, row);
  if (hasAnyValue_(previous)) { action = (action === 'NEW_PROJECT') ? action : 'OVERWRITE'; }

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

/** The audit trail lives in the cell note, so the sheet keeps its A1:T shape. */
function buildCellNote_(submission, data, result) {
  var lines = [];
  if (result.value !== null) {
    lines.push('Actual: ' + formatPercent(result.value) + ' (' + result.source + ')');
    var ok = meetsTarget(data.phase, result.value);
    lines.push('Target: ' + formatPercent(data.phase.target) + ' — ' + (ok ? 'met' : 'not met'));
  } else {
    lines.push('Actual: ' + result.text);
  }
  if (data.hours) {
    lines.push('Source: ' + data.hoursRaw + ' (' + data.phase.unit + ')');
  } else if (result.source === 'estimated') {
    lines.push('Source: self-assessed range "' + data.bucketLabel + '"');
  }
  lines.push('Status: ' + (data.statusLabel || 'n/a'));
  if (data.maturityLabel) { lines.push('Maturity: ' + data.maturityLabel); }
  if (submission.confidence) { lines.push('Confidence: ' + submission.confidence); }
  lines.push('Period: ' + submission.period);
  lines.push('Submitted: ' + Utilities.formatDate(submission.timestamp,
              Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') +
             (submission.email ? ' by ' + submission.email : ''));
  if (submission.reporter) { lines.push('Reported by: ' + submission.reporter); }
  lines.push('Response ID: ' + submission.responseId);
  return lines.join('\n');
}

/**
 * Cross-checks the answers against the framework's Applicability Matrix (1.3).
 * Nothing is blocked — implausible combinations are surfaced to the QA manager.
 */
function applicabilityWarnings_(submission) {
  var out = [];
  var manual = (submission.approach === 'Manual only');
  var used = function (key) {
    var s = submission.phases[key].status;
    return s === 'USED_MEASURED' || s === 'USED_UNMEASURED';
  };

  if (manual && used('p8')) {
    out.push('Manual-only project reports AI usage in Test Automation — verify with the team lead.');
  }
  if (manual && used('p4')) {
    out.push('Manual-only project reports AI usage in Environment Setup — the framework limits this ' +
             'to synthetic data generation. Verify what was actually measured.');
  }
  if (submission.dataConstraints === 'Prohibited by NDA or client policy') {
    var anyUsed = false;
    for (var i = 0; i < PHASES.length; i++) { if (used(PHASES[i].key)) { anyUsed = true; } }
    if (anyUsed) {
      out.push('AI usage reported while the project is marked as NDA-prohibited — ' +
               'confirm which tools were approved (framework section 5).');
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Service sheets                                                      */
/* ------------------------------------------------------------------ */

function ensureSheet_(name, headers) {
  var ss = SpreadsheetApp.getActive();
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

var LOG_HEADERS = ['Timestamp', 'Response ID', 'Email', 'Reporter', 'Project', 'Row', 'Period',
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
