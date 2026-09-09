/**
 * Compute.gs — перетворює відповіді по одній фазі на значення для «Actual, %».
 *
 * Пріоритет джерел: виміряні години > оцінка діапазоном > текстова мітка статусу.
 * Знак (розділ 6.1 фреймворку і аркуш Legend & Sources):
 *   фази 1–4, 6–8  покращення = СКОРОЧЕННЯ    -> від'ємна частка
 *   фаза 5         покращення = ПРОПУСКНА ЗД. -> додатна частка
 * Значення — саме частки (-0.30), а не цілі відсотки (-30): у комірках Target
 * лежить -0.3 з відсотковим форматом, і Actual має бути в тому ж вигляді.
 */

/**
 * @param {Object} phaseData one entry of submission.phases
 * @param {Object} cfg getConfig()
 * @return {{value: ?number, text: ?string, source: string, warnings: string[]}}
 */
function computeActual(phaseData, cfg) {
  cfg = cfg || getConfig();
  var phase = phaseData.phase;
  var warnings = [];
  var status = phaseData.status;

  // Step 0 — "not possible" overrides any entered number.
  if (status && !STATUSES[status].numeric) {
    if (status !== 'NOT_YET' && phaseData.hours) {
      warnings.push(phase.short + ': marked "' + STATUSES[status].label +
                    '", but hours were also entered (' + phaseData.hoursRaw + ') — hours ignored.');
    }
    return { value: null, text: STATUSES[status].cell, source: 'status', warnings: warnings };
  }

  if (!status) {
    warnings.push(phase.short + ': AI-usage status not specified — nothing written.');
    return { value: null, text: null, source: 'none', warnings: warnings };
  }

  // Step 2 — measured hours.
  if (phaseData.hours) {
    var b = phaseData.hours.baseline;
    var a = phaseData.hours.ai;
    if (b === 0) {
      warnings.push(phase.short + ': baseline = 0, cannot calculate a percentage — falling back to the bucket estimate.');
    } else {
      var raw = (phase.sign > 0) ? (a - b) / b : -((b - a) / b);
      return finalise_(raw, 'measured', phase, warnings, cfg);
    }
  }

  // Step 3 — self-assessed bucket.
  var mid = BUCKETS[phaseData.bucketLabel];
  if (mid !== undefined && mid !== null) {
    var v = (phase.sign > 0) ? mid : -mid;
    return finalise_(v, 'estimated', phase, warnings, cfg);
  }

  // Step 4 — used, but nothing was measured.
  return { value: null, text: LABEL_PENDING, source: 'pending', warnings: warnings };
}

function finalise_(raw, source, phase, warnings, cfg) {
  var value = Math.round(raw * 1000) / 1000;
  if (Math.abs(value) > cfg.OUTLIER_THRESHOLD) {
    warnings.push(phase.short + ': calculated ' + formatPercent(value) +
                  ' — looks like an outlier, double-check the entered numbers.');
  }
  if ((phase.sign > 0 && value < 0) || (phase.sign < 0 && value > 0)) {
    warnings.push(phase.short + ': the numbers describe a regression versus baseline (' +
                  formatPercent(value) + ').');
  }
  return { value: value, text: null, source: source, warnings: warnings };
}

/** true if Actual meets or exceeds Target, accounting for the phase's direction. */
function meetsTarget(phase, value) {
  if (value === null || value === undefined) { return null; }
  return (phase.sign > 0) ? (value >= phase.target) : (value <= phase.target);
}

function formatPercent(value) {
  if (value === null || value === undefined) { return ''; }
  return (value > 0 ? '+' : '') + (Math.round(value * 1000) / 10).toFixed(1) + '%';
}
