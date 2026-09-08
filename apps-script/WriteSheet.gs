/**
 * WriteSheet.gs — пошук рядка проєкту і запис у колонки «Actual, %».
 *
 * Аркуш зберігає вихідну форму A1:T: рядки 1–3 — об'єднаний заголовок, дані з
 * рядка 4, на кожну фазу — пара колонок Target/Actual. Нові проєкти дописуються
 * знизу, тому заголовок ніколи не зачіпається.
 */

function getMainSheet_() {
  var cfg = getConfig();
  var sheet = getTargetSpreadsheet().getSheetByName(cfg.SHEET_NAME);
  if (!sheet) {
    throw new Error('Аркуш «' + cfg.SHEET_NAME + '» не знайдено. ' +
                    'Задайте правильну назву у властивості скрипта SHEET_NAME.');
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

/** @return {number} 1-based рядок або -1, якщо проєкту в таблиці немає. */
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
 * Дописує рядок для проєкту, якого немає в таблиці: копіює формати і Target-значення
 * з першого рядка даних. Акаунт-менеджер і модель контракту лишаються порожніми —
 * форма їх не питає, це зона відповідальності менеджера.
 * @return {number} індекс нового рядка
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
 * Записує одну відповідь у таблицю.
 * @return {{row:number, action:string, warnings:string[], written:Object}}
 */
function applySubmission(submission) {
  var cfg = getConfig();
  var sheet = getMainSheet_();
  var warnings = [];
  var action = 'ЗАПИС';

  if (submission.period && cfg.ACTIVE_PERIOD && submission.period !== cfg.ACTIVE_PERIOD) {
    // Основна таблиця завжди показує активний період; інші лише логуються.
    return {
      row: -1, action: 'ІНШИЙ ПЕРІОД',
      warnings: ['Період відповіді «' + submission.period + '» не збігається з активним «' +
                 cfg.ACTIVE_PERIOD + '» — основну таблицю не змінено.'],
      written: {}
    };
  }

  var row = findProjectRow(sheet, submission.projectName);

  if (row === -1 && submission.isNewProject) {
    row = appendProjectRow_(sheet, submission);
    action = 'НОВИЙ ПРОЄКТ';
  } else if (row === -1) {
    return {
      row: -1, action: 'ПРОЄКТ НЕ ЗНАЙДЕНО',
      warnings: ['Проєкт «' + submission.projectName + '» не знайдено в колонці B, ' +
                 'і відповідь не позначена як новий проєкт. Нічого не записано.'],
      written: {}
    };
  } else if (submission.isNewProject) {
    warnings.push('Проєкт «' + submission.newProject.name + '» подано як новий, але він збігається ' +
                  'з наявним рядком ' + row + ' — оновлено наявний рядок (нечіткий збіг).');
  }

  var previous = readActualRow_(sheet, row);
  if (hasAnyValue_(previous) && action !== 'НОВИЙ ПРОЄКТ') { action = 'ПЕРЕЗАПИС'; }

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
      written[phase.key] = '(без змін)';
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

/** Аудит живе у примітці до комірки, тому таблиця зберігає форму A1:T. */
function buildCellNote_(submission, data, result) {
  var lines = [];
  if (result.value !== null) {
    lines.push('Actual: ' + formatPercent(result.value) +
               (result.source === 'measured' ? ' (заміри)' : ' (оцінка)'));
    var ok = meetsTarget(data.phase, result.value);
    lines.push('Target: ' + formatPercent(data.phase.target) + ' — ' + (ok ? 'досягнуто' : 'не досягнуто'));
  } else {
    lines.push('Actual: ' + result.text);
  }
  if (data.hours) {
    lines.push('Джерело: ' + data.hoursRaw + ' (' + data.phase.unit + ')');
  } else if (result.source === 'estimated') {
    lines.push('Джерело: самооцінка «' + data.bucketLabel + '»');
  }
  lines.push('Статус: ' + (data.statusLabel || 'не вказано'));
  if (data.maturityLabel) { lines.push('Зрілість: ' + data.maturityLabel); }
  if (submission.confidence) { lines.push('Довіра: ' + submission.confidence); }
  lines.push('Період: ' + submission.period);
  lines.push('Подано: ' + Utilities.formatDate(submission.timestamp,
              Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') +
             (submission.email ? ' — ' + submission.email : ''));
  if (submission.reporter) { lines.push('Автор: ' + submission.reporter); }
  lines.push('ID відповіді: ' + submission.responseId);
  return lines.join('\n');
}

/**
 * Звіряє відповіді з Applicability Matrix (розділ 1.3) і Governance (розділ 5).
 * Нічого не блокує — неправдоподібні комбінації показуються QA-менеджеру.
 */
function applicabilityWarnings_(submission) {
  var out = [];
  var manual = (submission.approach === TESTING_APPROACHES[0]);
  var used = function (key) {
    var s = submission.phases[key].status;
    return s === 'USED_MEASURED' || s === 'USED_UNMEASURED';
  };

  if (manual && used('p8')) {
    out.push('Мануальний проєкт заявляє використання AI в автоматизації тестування — перепитати тім-ліда.');
  }
  if (manual && used('p4')) {
    out.push('Мануальний проєкт заявляє використання AI у налаштуванні середовища — фреймворк ' +
             'обмежує це генерацією синтетичних даних. Уточнити, що саме вимірювали.');
  }
  if (submission.dataConstraints === DATA_CONSTRAINTS[2]) {
    var anyUsed = false;
    for (var i = 0; i < PHASES.length; i++) { if (used(PHASES[i].key)) { anyUsed = true; } }
    if (anyUsed) {
      out.push('Заявлено використання AI, хоча проєкт позначено як заборонений за NDA — ' +
               'уточнити, які інструменти погоджені (розділ 5 фреймворку).');
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Службові аркуші                                                     */
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

var LOG_HEADERS = ['Час', 'ID відповіді', 'Email', 'Автор', 'Проєкт', 'Рядок', 'Період',
                   'Дія', 'Записані значення', 'Попередні значення', 'Попередження'];

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
