/**
 * Compute.gs — turns one phase's answers into the value written to "Actual, %".
 *
 * Source priority: measured hours > self-assessed bucket > status label.
 * Sign convention (framework section 6.1 and the sheet's Legend tab):
 *   phases 1-4, 6-8  improvement is a REDUCTION  -> negative fraction
 *   phase 5          improvement is THROUGHPUT   -> positive fraction
 * Values are fractions (-0.30), never whole percents (-30): the sheet's Target
 * cells store -0.3 with a percent number format and Actual must match.
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

  // Step 0 — "not possible" always wins over any number that may have been typed.
  if (status && !STATUSES[status].numeric) {
    if (status !== 'NOT_YET' && phaseData.hours) {
      warnings.push(phase.short + ': marked "' + STATUSES[status].label +
                    '" but hours were also provided (' + phaseData.hoursRaw + ') — hours ignored.');
    }
    return { value: null, text: STATUSES[status].cell, source: 'status', warnings: warnings };
  }

  if (!status) {
    warnings.push(phase.short + ': AI usage status is missing — nothing written.');
    return { value: null, text: null, source: 'none', warnings: warnings };
  }

  // Step 2 — measured hours.
  if (phaseData.hours) {
    var b = phaseData.hours.baseline;
    var a = phaseData.hours.ai;
    if (b === 0) {
      warnings.push(phase.short + ': baseline is 0, cannot compute a percentage — falling back to the estimate.');
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

  // Step 4 — used, but nothing quantified.
  return { value: null, text: LABEL_PENDING, source: 'pending', warnings: warnings };
}

function finalise_(raw, source, phase, warnings, cfg) {
  var value = Math.round(raw * 1000) / 1000;
  if (Math.abs(value) > cfg.OUTLIER_THRESHOLD) {
    warnings.push(phase.short + ': computed ' + formatPercent(value) +
                  ' looks like an outlier — verify the input numbers.');
  }
  if ((phase.sign > 0 && value < 0) || (phase.sign < 0 && value > 0)) {
    warnings.push(phase.short + ': the numbers describe a regression vs baseline (' +
                  formatPercent(value) + ').');
  }
  return { value: value, text: null, source: source, warnings: warnings };
}

/** True when Actual meets or beats Target, respecting the phase's direction. */
function meetsTarget(phase, value) {
  if (value === null || value === undefined) { return null; }
  return (phase.sign > 0) ? (value >= phase.target) : (value <= phase.target);
}

function formatPercent(value) {
  if (value === null || value === undefined) { return ''; }
  return (value > 0 ? '+' : '') + (Math.round(value * 1000) / 10).toFixed(1) + '%';
}
