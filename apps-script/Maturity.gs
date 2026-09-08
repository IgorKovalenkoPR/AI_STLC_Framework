/**
 * Maturity.gs — the AI Maturity Model scoring (framework section 3).
 *
 * Kept on its own tab: the 0-3 scores answer "how mature is the process",
 * which is a different question from "how much time did AI save", and mixing
 * them into A1:T would change the shape of the client-facing table.
 */

function maturityHeaders_() {
  var h = ['Project', 'Period'];
  for (var i = 0; i < PHASES.length; i++) { h.push(PHASES[i].short); }
  h.push('TOTAL (0–24)', 'Level', 'Level description', 'Updated', 'Reporter');
  return h;
}

function levelForScore_(total) {
  for (var i = 0; i < MATURITY_LEVELS.length; i++) {
    var l = MATURITY_LEVELS[i];
    if (total >= l.min && total <= l.max) { return l; }
  }
  return { level: '—', desc: '' };
}

/** Upserts the maturity row for project + period. */
function writeMaturity(submission) {
  var cfg = getConfig();
  var sheet = ensureSheet_(cfg.MATURITY_SHEET, maturityHeaders_());

  var scores = [];
  var total = 0;
  var complete = true;
  for (var i = 0; i < PHASES.length; i++) {
    var s = submission.phases[PHASES[i].key].maturityScore;
    if (s === null) { complete = false; scores.push(''); }
    else { scores.push(s); total += s; }
  }

  var level = complete ? levelForScore_(total) : { level: 'incomplete', desc: 'Not all phases scored.' };
  var row = [submission.projectName, submission.period]
    .concat(scores)
    .concat([complete ? total : '', level.level, level.desc, new Date(), submission.reporter]);

  var target = findMaturityRow_(sheet, submission.projectName, submission.period);
  if (target === -1) {
    sheet.appendRow(row);
  } else {
    sheet.getRange(target, 1, 1, row.length).setValues([row]);
  }
  return { total: complete ? total : null, level: level.level };
}

function findMaturityRow_(sheet, projectName, period) {
  var last = sheet.getLastRow();
  if (last < 2) { return -1; }
  var values = sheet.getRange(2, 1, last - 1, 2).getValues();
  var wanted = normaliseProjectName(projectName);
  for (var i = 0; i < values.length; i++) {
    if (normaliseProjectName(values[i][0]) === wanted && String(values[i][1]).trim() === String(period).trim()) {
      return i + 2;
    }
  }
  return -1;
}
