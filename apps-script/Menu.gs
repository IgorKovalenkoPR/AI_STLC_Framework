/**
 * Menu.gs — the "AI STLC" menu in the spreadsheet.
 *
 * onOpen is a simple trigger, so it may not fire for users without edit
 * access; all of these functions can also be run from the Apps Script editor.
 */

function onOpen() {
  if (!hasSpreadsheetUi_()) { return; }
  SpreadsheetApp.getUi()
    .createMenu('AI STLC')
    .addItem('Set up (form + sheets + trigger)', 'menuSetup')
    .addItem('Show form link', 'menuShowFormLink')
    .addSeparator()
    .addItem('Recompute all from responses', 'menuRecomputeAll')
    .addItem('Reapply conditional formatting', 'menuReapplyFormatting')
    .addItem('Refresh coverage report', 'menuRefreshCoverage')
    .addItem('Refresh Target columns from framework', 'menuResyncTargets')
    .addSeparator()
    .addItem('Save period snapshot', 'menuSnapshot')
    .addItem('Populate form from script', 'menuPopulateForm')
    .addSeparator()
    .addItem('Run self-test', 'menuSelfTest')
    .addSeparator()
    .addItem('Clear all test data', 'menuResetAllData')
    .addToUi();
}

function menuSetup() {
  var url = setup();
  alert_('Done', 'The form has been populated and linked to this spreadsheet:\n\n' + url +
         '\n\nYou can share this link with QA team leads.');
}

function menuShowFormLink() {
  var url = PropertiesService.getScriptProperties().getProperty(PROP.FORM_URL);
  alert_('Form link', url || 'The form has not been populated yet — run "Set up".');
}

function menuRecomputeAll() {
  if (!hasSpreadsheetUi_()) { return recomputeAll(); }
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert('Recompute all',
    'All "Actual, %" cells for the active period will be cleared and rebuilt from the latest ' +
    'response for each project. Manual edits to these cells will be lost. Continue?',
    ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) { return; }

  var r = recomputeAll();
  alert_('Recompute finished',
         'Projects written: ' + r.applied +
         (r.skipped.length ? '\nSkipped: ' + r.skipped.join(', ') : ''));
}

function menuReapplyFormatting() {
  applyFormatting();
  alert_('Formatting', 'Conditional formatting rules were applied to the "Actual, %" columns.');
}

function menuRefreshCoverage() {
  buildCoverage();
  alert_('Coverage', 'The "' + getConfig().COVERAGE_SHEET + '" sheet has been updated.');
}

function menuResyncTargets() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert('Refresh Target columns',
    'This overwrites every "Target, %" cell in "' + getConfig().SHEET_NAME + '" with the current ' +
    'value from Config.gs (PHASES[].target) for that phase. Use this after changing a target value ' +
    'in code. Any per-project Target overrides you typed manually will be lost. Continue?',
    ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) { return; }

  var r = resyncTargetColumns();
  alert_('Done', 'Target columns refreshed for ' + r.rows + ' row(s).');
}

function menuSnapshot() {
  var name = snapshotPeriod();
  alert_('Snapshot', 'Current values were saved to the "' + name + '" sheet.');
}

function menuPopulateForm() {
  if (!hasSpreadsheetUi_()) { populateForm(); installTriggers(); return; }
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert('Populate form',
    'All current form questions will be deleted and recreated from the script. ' +
    'The form link and already-collected responses are preserved. Continue?',
    ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) { return; }

  var form = populateForm();
  installTriggers();
  alert_('Form populated', form.getPublishedUrl());
}

function menuResetAllData() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert('Clear all test data',
    'This will clear the "Actual, %" columns in "' + getConfig().SHEET_NAME + '", as well as all rows in ' +
    '"Submission Log" and "AI Maturity". Target columns, headers, and projects are NOT touched.\n\n' +
    'This does NOT delete the form\'s own responses — Apps Script has no API for that. ' +
    'Do that separately: in the form, Responses → ⋮ → Delete all responses, ' +
    'BEFORE or AFTER this step (order doesn\'t matter, as long as both are done).\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) { return; }

  resetAllData();
  alert_('Done', 'Test data cleared. Don\'t forget to delete the responses in the form itself, ' +
                    'if you haven\'t already.');
}

function menuSelfTest() {
  var r = runSelfTest();
  alert_('Self-test', r.summary + (r.failures.length ? '\n\n' + r.failures.join('\n') : ''));
}

/**
 * Shows a dialog when the script is bound to the spreadsheet, and logs
 * instead when it isn't (in a project created from the form or standalone,
 * SpreadsheetApp.getUi() isn't available).
 */
function alert_(title, message) {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.alert(title, message, ui.ButtonSet.OK);
  } catch (e) {
    Logger.log(title + '\n' + message);
  }
}

/** true if the script is bound to the spreadsheet and has a UI. */
function hasSpreadsheetUi_() {
  try { SpreadsheetApp.getUi(); return true; } catch (e) { return false; }
}
