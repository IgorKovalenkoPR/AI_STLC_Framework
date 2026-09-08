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

  // Крок 0 — «неможливо» перекриває будь-яке введене число.
  if (status && !STATUSES[status].numeric) {
    if (status !== 'NOT_YET' && phaseData.hours) {
      warnings.push(phase.short + ': позначено «' + STATUSES[status].label +
                    '», але водночас введено години (' + phaseData.hoursRaw + ') — години проігноровано.');
    }
    return { value: null, text: STATUSES[status].cell, source: 'status', warnings: warnings };
  }

  if (!status) {
    warnings.push(phase.short + ': не вказано статус використання AI — нічого не записано.');
    return { value: null, text: null, source: 'none', warnings: warnings };
  }

  // Крок 2 — виміряні години.
  if (phaseData.hours) {
    var b = phaseData.hours.baseline;
    var a = phaseData.hours.ai;
    if (b === 0) {
      warnings.push(phase.short + ': baseline = 0, відсоток порахувати неможливо — беремо оцінку діапазоном.');
    } else {
      var raw = (phase.sign > 0) ? (a - b) / b : -((b - a) / b);
      return finalise_(raw, 'measured', phase, warnings, cfg);
    }
  }

  // Крок 3 — самооцінка діапазоном.
  var mid = BUCKETS[phaseData.bucketLabel];
  if (mid !== undefined && mid !== null) {
    var v = (phase.sign > 0) ? mid : -mid;
    return finalise_(v, 'estimated', phase, warnings, cfg);
  }

  // Крок 4 — використовують, але нічого не виміряли.
  return { value: null, text: LABEL_PENDING, source: 'pending', warnings: warnings };
}

function finalise_(raw, source, phase, warnings, cfg) {
  var value = Math.round(raw * 1000) / 1000;
  if (Math.abs(value) > cfg.OUTLIER_THRESHOLD) {
    warnings.push(phase.short + ': розраховано ' + formatPercent(value) +
                  ' — схоже на викид, перевірте введені числа.');
  }
  if ((phase.sign > 0 && value < 0) || (phase.sign < 0 && value > 0)) {
    warnings.push(phase.short + ': числа описують регресію відносно baseline (' +
                  formatPercent(value) + ').');
  }
  return { value: value, text: null, source: source, warnings: warnings };
}

/** true, якщо Actual досягає або перевищує Target з урахуванням напрямку фази. */
function meetsTarget(phase, value) {
  if (value === null || value === undefined) { return null; }
  return (phase.sign > 0) ? (value >= phase.target) : (value <= phase.target);
}

function formatPercent(value) {
  if (value === null || value === undefined) { return ''; }
  return (value > 0 ? '+' : '') + (Math.round(value * 1000) / 10).toFixed(1) + '%';
}
