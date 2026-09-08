/**
 * Parse.gs — turns a raw Google Forms response into one canonical object.
 *
 * Answers are looked up by item ID from the ITEM_MAP script property, so the
 * mapping survives any re-wording of the questions in the form UI.
 */

function getItemMap() {
  var raw = PropertiesService.getScriptProperties().getProperty(PROP.ITEM_MAP);
  if (!raw) {
    throw new Error('ITEM_MAP is missing. Run "AI STLC ▸ Setup" (or Rebuild form) first.');
  }
  return JSON.parse(raw);
}

/**
 * @param {FormResponse} formResponse
 * @return {Object} canonical submission
 */
function parseSubmission(formResponse) {
  var map = getItemMap();
  var answers = {};
  var itemResponses = formResponse.getItemResponses();
  for (var i = 0; i < itemResponses.length; i++) {
    answers[String(itemResponses[i].getItem().getId())] = itemResponses[i].getResponse();
  }

  var get = function (id) {
    if (id === undefined || id === null) { return null; }
    var v = answers[String(id)];
    return (v === undefined) ? null : v;
  };

  var projectRaw = get(map.project);
  var isNew = (projectRaw === PROJECT_OTHER);
  var newProject = null;
  if (isNew) {
    newProject = {
      name: trimOrEmpty_(get(map.newProjectName)),
      am: trimOrEmpty_(get(map.newProjectAm)),
      model: trimOrEmpty_(get(map.newProjectModel))
    };
  }

  var effectiveName = isNew ? (newProject.name || 'Unnamed project') : projectRaw;

  var usage = toArray_(get(map.usageGrid));
  var maturity = toArray_(get(map.maturityGrid));
  var estimates = toArray_(get(map.estimateGrid));

  var phases = {};
  for (var p = 0; p < PHASES.length; p++) {
    var phase = PHASES[p];
    var hoursRaw = map.hours ? get(map.hours[phase.key]) : null;
    phases[phase.key] = {
      phase: phase,
      statusLabel: trimOrEmpty_(usage[p]),
      status: statusCodeFromLabel(usage[p]),
      maturityLabel: trimOrEmpty_(maturity[p]),
      maturityScore: maturityScoreFromLabel_(maturity[p]),
      hoursRaw: trimOrEmpty_(hoursRaw),
      hours: parseHoursPair(hoursRaw),
      bucketLabel: trimOrEmpty_(estimates[p])
    };
  }

  return {
    timestamp: formResponse.getTimestamp(),
    responseId: formResponse.getId(),
    email: formResponse.getRespondentEmail() || '',
    reporter: trimOrEmpty_(get(map.reporter)),
    projectRaw: projectRaw,
    projectName: isNew ? effectiveName : resolveProjectName(projectRaw),
    isNewProject: isNew,
    newProject: newProject,
    period: trimOrEmpty_(get(map.period)),
    approach: trimOrEmpty_(get(map.approach)),
    productTypes: toArray_(get(map.productType)),
    dataConstraints: trimOrEmpty_(get(map.dataConstraints)),
    basis: trimOrEmpty_(get(map.basis)),
    phases: phases,
    tools: toArray_(get(map.tools)),
    acceptanceRate: parseNumberOrNull_(get(map.acceptanceRate)),
    hallucinationRate: parseNumberOrNull_(get(map.hallucinationRate)),
    automationCoverage: parseNumberOrNull_(get(map.automationCoverage)),
    confidence: trimOrEmpty_(get(map.confidence)),
    blockers: trimOrEmpty_(get(map.blockers)),
    win: trimOrEmpty_(get(map.win))
  };
}

/**
 * Parses "12 / 8", "12,5 ; 8", " 6/7.5 " into {baseline, ai}.
 * Returns null when the value is empty or not a well-formed pair.
 */
function parseHoursPair(raw) {
  var s = trimOrEmpty_(raw);
  if (!s) { return null; }
  var parts = s.split(/[\/;]/);
  if (parts.length !== 2) { return null; }
  var baseline = parseNumberOrNull_(parts[0]);
  var ai = parseNumberOrNull_(parts[1]);
  if (baseline === null || ai === null) { return null; }
  return { baseline: baseline, ai: ai };
}

/** Locale-tolerant number parse: accepts "12,5" as 12.5. */
function parseNumberOrNull_(raw) {
  if (raw === null || raw === undefined) { return null; }
  var s = String(raw).trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') { return null; }
  var n = Number(s);
  return isNaN(n) ? null : n;
}

/** Maturity grid label -> 0..3. */
function maturityScoreFromLabel_(label) {
  var s = trimOrEmpty_(label);
  if (!s) { return null; }
  for (var i = 0; i < MATURITY_OPTIONS.length; i++) {
    if (MATURITY_OPTIONS[i] === s) { return i; }
  }
  var m = s.match(/^\s*([0-3])/);
  return m ? Number(m[1]) : null;
}

function trimOrEmpty_(v) {
  return (v === null || v === undefined) ? '' : String(v).trim();
}

function toArray_(v) {
  if (v === null || v === undefined) { return []; }
  return Array.isArray(v) ? v : [v];
}
