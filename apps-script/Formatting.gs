/**
 * Formatting.gs — conditional formatting for the "Actual, %" columns.
 *
 * Four states per cell, in this rule order (first match wins in Sheets):
 *   amber  "0% — not used yet"          — feasible, simply not started
 *   grey   any other text (N/A, pending) — out of scope or not quantified
 *   green  number that meets Target
 *   red    number that misses Target
 *
 * "Not used yet" is deliberately amber text rather than the number 0: for a
 * manager "0% because we never tried" and "0% because AI gave no measurable
 * gain" are different findings, and the latter arrives as a real 0.0.
 */

var COLOURS = {
  greenBg: '#d9ead3', greenFg: '#274e13',
  redBg:   '#f4cccc', redFg:   '#990000',
  amberBg: '#fff2cc', amberFg: '#7f6000',
  greyBg:  '#efefef', greyFg:  '#666666'
};

function applyFormatting() {
  var cfg = getConfig();
  var sheet = getMainSheet_();
  var firstRow = cfg.FIRST_DATA_ROW;
  var lastRow = Math.max(lastDataRow_(sheet), firstRow);
  var numRows = lastRow - firstRow + 1;

  var actualCols = {};
  for (var i = 0; i < PHASES.length; i++) { actualCols[PHASES[i].actualCol] = true; }

  // Drop every rule that touches an Actual column — our own from a previous run and
  // any wide rule inherited from the .xlsx import, which would otherwise win by order
  // and mask the text-label colours. Rules on other columns are left untouched.
  var kept = sheet.getConditionalFormatRules().filter(function (rule) {
    var ranges = rule.getRanges();
    for (var r = 0; r < ranges.length; r++) {
      var first = ranges[r].getColumn();
      var last = first + ranges[r].getNumColumns() - 1;
      for (var c = first; c <= last; c++) {
        if (actualCols[c]) { return false; }
      }
    }
    return true;
  });

  var rules = kept;
  for (var p = 0; p < PHASES.length; p++) {
    var phase = PHASES[p];
    var range = sheet.getRange(firstRow, phase.actualCol, numRows, 1);
    var a = columnLetter_(phase.actualCol) + firstRow;   // relative, e.g. F4
    var t = columnLetter_(phase.targetCol) + firstRow;   // e.g. E4
    var better = (phase.sign > 0) ? '>=' : '<=';
    var worse = (phase.sign > 0) ? '<' : '>';

    rules.push(textRule_(range, '=EXACT($' + a + ',"' + STATUSES.NOT_YET.cell + '")',
                         COLOURS.amberBg, COLOURS.amberFg, false));
    rules.push(textRule_(range, '=AND(ISTEXT($' + a + '),$' + a + '<>"")',
                         COLOURS.greyBg, COLOURS.greyFg, true));
    rules.push(textRule_(range, '=AND(ISNUMBER($' + a + '),ISNUMBER($' + t + '),$' + a + better + '$' + t + ')',
                         COLOURS.greenBg, COLOURS.greenFg, false));
    rules.push(textRule_(range, '=AND(ISNUMBER($' + a + '),ISNUMBER($' + t + '),$' + a + worse + '$' + t + ')',
                         COLOURS.redBg, COLOURS.redFg, false));
  }
  sheet.setConditionalFormatRules(rules);
}

function textRule_(range, formula, bg, fg, italic) {
  var builder = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(formula)
    .setBackground(bg)
    .setFontColor(fg);
  if (italic) { builder.setItalic(true); }
  return builder.setRanges([range]).build();
}

function columnLetter_(col) {
  var letter = '';
  while (col > 0) {
    var rem = (col - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}
