/**
 * Menu.gs — the "AI STLC" menu in the spreadsheet.
 *
 * onOpen is a simple trigger, so it may not run for viewers without edit
 * rights; everything here is also callable from the Apps Script editor.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('AI STLC')
    .addItem('Setup (create form + sheets + triggers)', 'menuSetup')
    .addItem('Show form link', 'menuShowFormLink')
    .addSeparator()
    .addItem('Recompute all from responses', 'menuRecomputeAll')
    .addItem('Reapply conditional formatting', 'menuReapplyFormatting')
    .addItem('Refresh coverage report', 'menuRefreshCoverage')
    .addSeparator()
    .addItem('Snapshot current period', 'menuSnapshot')
    .addItem('Rebuild form from script', 'menuRebuildForm')
    .addSeparator()
    .addItem('Run self-test', 'menuSelfTest')
    .addToUi();
}

function menuSetup() {
  var url = setup();
  alert_('Setup complete', 'Form is ready:\n\n' + url +
         '\n\nShare this link with the QA team leads.');
}

function menuShowFormLink() {
  var url = PropertiesService.getScriptProperties().getProperty(PROP.FORM_URL);
  alert_('Form link', url || 'No form yet — run Setup first.');
}

function menuRecomputeAll() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert('Recompute all',
    'This clears every "Actual, %" cell for the active period and rebuilds it from the ' +
    'latest form response per project. Manual edits to those cells will be lost. Continue?',
    ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) { return; }

  var r = recomputeAll();
  alert_('Recompute finished',
         'Projects written: ' + r.applied +
         (r.skipped.length ? '\nSkipped: ' + r.skipped.join(', ') : ''));
}

function menuReapplyFormatting() {
  applyFormatting();
  alert_('Formatting', 'Conditional formatting rules reapplied to the Actual columns.');
}

function menuRefreshCoverage() {
  buildCoverage();
  alert_('Coverage', 'The "' + getConfig().COVERAGE_SHEET + '" tab has been refreshed.');
}

function menuSnapshot() {
  var name = snapshotPeriod();
  alert_('Snapshot', 'Current values archived to the "' + name + '" tab.');
}

function menuRebuildForm() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert('Rebuild form',
    'A NEW form will be created from the current script. The old form keeps its ' +
    'responses but stops feeding this sheet, and its link stops being the one to share. Continue?',
    ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) { return; }

  var props = PropertiesService.getScriptProperties();
  var oldId = props.getProperty(PROP.FORM_ID);
  if (oldId) {
    try {
      var old = FormApp.openById(oldId);
      old.setTitle(old.getTitle() + ' (retired ' +
        Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd') + ')');
      old.setAcceptingResponses(false);
    } catch (e) { /* already gone */ }
  }
  props.deleteProperty(PROP.FORM_ID);
  var form = createForm();
  installTriggers();
  alert_('Form rebuilt', 'New form:\n\n' + form.getPublishedUrl());
}

function menuSelfTest() {
  var r = runSelfTest();
  alert_('Self-test', r.summary + (r.failures.length ? '\n\n' + r.failures.join('\n') : ''));
}

function alert_(title, message) {
  SpreadsheetApp.getUi().alert(title, message, SpreadsheetApp.getUi().ButtonSet.OK);
}
