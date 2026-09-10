/**
 * Test.gs — non-destructive self-test of the calculation layer.
 *
 * Run `runSelfTest()` from the editor (or the menu) and read the log. It never
 * touches the spreadsheet: every case goes straight through computeActual().
 * The same file runs under Node for CI — see docs/deployment.md.
 */

function fixture_(phaseKey, opts) {
  opts = opts || {};
  return {
    phase: getPhaseByKey(phaseKey),
    statusLabel: opts.status ? STATUSES[opts.status].label : '',
    status: opts.status || null,
    maturityLabel: '',
    maturityScore: null,
    hoursRaw: opts.hours || '',
    hours: parseHoursPair(opts.hours || ''),
    bucketLabel: opts.bucket || ''
  };
}

function selfTestCases_() {
  return [
    // --- measured hours, time-reduction phases -----------------------------
    { name: 'Ph3 measured 5/3.5 -> -30% (beats -25% target)',
      data: fixture_('p3', { status: 'USED_MEASURED', hours: '5 / 3.5' }),
      expect: { value: -0.3, source: 'measured', meets: true } },
    { name: 'Ph1 measured 8/5 -> -37.5% (beats -20% target)',
      data: fixture_('p1', { status: 'USED_MEASURED', hours: '8 / 5' }),
      expect: { value: -0.375, source: 'measured', meets: true } },
    { name: 'Ph2 measured 16/14 -> -12.5% (misses -20% target)',
      data: fixture_('p2', { status: 'USED_MEASURED', hours: '16 / 14' }),
      expect: { value: -0.125, source: 'measured', meets: false } },

    // --- throughput phase keeps the opposite sign --------------------------
    { name: 'Ph5 measured 6/7.5 -> +25% (beats +5% target)',
      data: fixture_('p5', { status: 'USED_MEASURED', hours: '6 / 7.5' }),
      expect: { value: 0.25, source: 'measured', meets: true } },
    { name: 'Ph5 measured 8/8 -> 0% (misses +5% target)',
      data: fixture_('p5', { status: 'USED_MEASURED', hours: '8 / 8' }),
      expect: { value: 0, source: 'measured', meets: false } },

    // --- regression: AI made it slower -------------------------------------
    { name: 'Ph1 regression 8/10 -> +25%, flagged',
      data: fixture_('p1', { status: 'USED_MEASURED', hours: '8 / 10' }),
      expect: { value: 0.25, source: 'measured', meets: false, minWarnings: 1 } },

    // --- locale and separators ---------------------------------------------
    { name: 'Ph6 comma decimals "20,0 ; 13" -> -35%',
      data: fixture_('p6', { status: 'USED_MEASURED', hours: '20,0 ; 13' }),
      expect: { value: -0.35, source: 'measured', meets: true } },

    // --- zero baseline falls back to the bucket ----------------------------
    { name: 'Ph4 baseline 0 falls back to the 20-30% bucket',
      data: fixture_('p4', { status: 'USED_MEASURED', hours: '0 / 4', bucket: '20–30%' }),
      expect: { value: -0.25, source: 'estimated', minWarnings: 1 } },

    // --- estimates ----------------------------------------------------------
    { name: 'Ph7 bucket 30-40% -> -35%',
      data: fixture_('p7', { status: 'USED_UNMEASURED', bucket: '30–40%' }),
      expect: { value: -0.35, source: 'estimated', meets: true } },
    { name: 'Ph5 bucket 20-30% keeps a positive sign',
      data: fixture_('p5', { status: 'USED_UNMEASURED', bucket: '20–30%' }),
      expect: { value: 0.25, source: 'estimated', meets: true } },
    { name: 'Ph8 bucket "No change (0%)" -> 0, misses target',
      data: fixture_('p8', { status: 'USED_UNMEASURED', bucket: 'No change (0%)' }),
      expect: { value: 0, source: 'estimated', meets: false } },

    // --- the "not used / not possible" answers the form is built around ----
    { name: 'Ph8 NOT_YET -> "0% — not used yet"',
      data: fixture_('p8', { status: 'NOT_YET' }),
      expect: { text: STATUSES.NOT_YET.cell, source: 'status' } },
    { name: 'Ph4 NA_PRODUCT -> "N/A — product specifics"',
      data: fixture_('p4', { status: 'NA_PRODUCT' }),
      expect: { text: STATUSES.NA_PRODUCT.cell, source: 'status' } },
    { name: 'Ph1 NA_NDA -> "N/A — NDA / data privacy"',
      data: fixture_('p1', { status: 'NA_NDA' }),
      expect: { text: STATUSES.NA_NDA.cell, source: 'status' } },
    { name: 'Ph8 NA_TOOLING -> "N/A — no automation / CI-CD"',
      data: fixture_('p8', { status: 'NA_TOOLING' }),
      expect: { text: STATUSES.NA_TOOLING.cell, source: 'status' } },
    { name: 'NA wins over hours, with a warning',
      data: fixture_('p4', { status: 'NA_PRODUCT', hours: '6 / 4' }),
      expect: { text: STATUSES.NA_PRODUCT.cell, source: 'status', minWarnings: 1 } },
    { name: 'NOT_YET wins over a bucket, without a warning',
      data: fixture_('p2', { status: 'NOT_YET', bucket: '10–20%' }),
      expect: { text: STATUSES.NOT_YET.cell, source: 'status', minWarnings: 0 } },

    // --- used but nothing quantified ---------------------------------------
    { name: 'Used but no data -> "Data pending"',
      data: fixture_('p6', { status: 'USED_UNMEASURED', bucket: 'Not applicable' }),
      expect: { text: LABEL_PENDING, source: 'pending' } },
    { name: 'Missing status -> nothing written',
      data: fixture_('p3', {}),
      expect: { text: null, value: null, source: 'none', minWarnings: 1 } },

    // --- malformed input ----------------------------------------------------
    { name: 'Unparsable hours fall back to the bucket',
      data: fixture_('p3', { status: 'USED_MEASURED', hours: 'about five hours', bucket: '10–20%' }),
      expect: { value: -0.15, source: 'estimated' } }
  ];
}

function runSelfTest() {
  var cfg = getConfig();
  var cases = selfTestCases_();
  var failures = [];

  for (var i = 0; i < cases.length; i++) {
    var c = cases[i];
    var got = computeActual(c.data, cfg);
    var problems = [];

    if (c.expect.value !== undefined && got.value !== c.expect.value) {
      problems.push('value: expected ' + c.expect.value + ', got ' + got.value);
    }
    if (c.expect.text !== undefined && got.text !== c.expect.text) {
      problems.push('text: expected ' + JSON.stringify(c.expect.text) + ', got ' + JSON.stringify(got.text));
    }
    if (c.expect.source !== undefined && got.source !== c.expect.source) {
      problems.push('source: expected ' + c.expect.source + ', got ' + got.source);
    }
    if (c.expect.meets !== undefined) {
      var meets = meetsTarget(c.data.phase, got.value);
      if (meets !== c.expect.meets) {
        problems.push('meetsTarget: expected ' + c.expect.meets + ', got ' + meets);
      }
    }
    if (c.expect.minWarnings !== undefined && got.warnings.length < c.expect.minWarnings) {
      problems.push('warnings: expected at least ' + c.expect.minWarnings + ', got ' + got.warnings.length);
    }
    if (c.expect.minWarnings === 0 && got.warnings.length !== 0) {
      problems.push('warnings: expected none, got ' + JSON.stringify(got.warnings));
    }

    if (problems.length) { failures.push(c.name + ' -> ' + problems.join('; ')); }
  }

  var summary = (cases.length - failures.length) + '/' + cases.length + ' passed';
  if (typeof Logger !== 'undefined') {
    Logger.log(summary);
    for (var f = 0; f < failures.length; f++) { Logger.log('FAIL ' + failures[f]); }
  }
  return { total: cases.length, failed: failures.length, failures: failures, summary: summary };
}
