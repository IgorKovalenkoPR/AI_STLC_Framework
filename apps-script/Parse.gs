/**
 * Parse.gs — перетворює сиру відповідь Google Forms на один канонічний об'єкт.
 *
 * Відповіді шукаються за ID елементів із властивості ITEM_MAP, тому мапінг
 * переживає будь-яку зміну формулювань у формі.
 */

function getItemMap() {
  var raw = PropertiesService.getScriptProperties().getProperty(PROP.ITEM_MAP);
  if (!raw) {
    throw new Error('No ITEM_MAP. Run "AI STLC ▸ Populate form" first.');
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
    newProject = { name: trimOrEmpty_(get(map.newProjectName)) };
  }

  var effectiveName = isNew ? (newProject.name || 'Unnamed project') : projectRaw;

  var overallUsage = trimOrEmpty_(get(map.overallUsage));
  var isNoAi = (overallUsage === OVERALL_USAGE.NO);
  var noAiReasonLabel = trimOrEmpty_(get(map.noAiReason));

  var usage = toArray_(get(map.usageGrid));
  var maturity = toArray_(get(map.maturityGrid));
  var estimates = toArray_(get(map.estimateGrid));

  var phases = {};
  for (var p = 0; p < PHASES.length; p++) {
    var phase = PHASES[p];
    if (isNoAi) {
      // Коротка гілка: одна причина застосовується до всіх 8 фаз, зрілість = 0
      // без окремого опитування — вона й так нульова, якщо AI не використовується.
      phases[phase.key] = {
        phase: phase,
        statusLabel: noAiReasonLabel,
        status: statusCodeFromLabel(noAiReasonLabel),
        maturityLabel: MATURITY_OPTIONS[0],
        maturityScore: 0,
        hoursRaw: '',
        hours: null,
        bucketLabel: ''
      };
      continue;
    }
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
    overallUsage: overallUsage,
    isNoAi: isNoAi,
    basis: trimOrEmpty_(get(map.basis)),
    phases: phases,
    tools: toArray_(get(map.tools)),
    acceptanceRate: parseNumberOrNull_(get(map.acceptanceRate)),
    hallucinationRate: parseNumberOrNull_(get(map.hallucinationRate)),
    automationCoverage: parseNumberOrNull_(get(map.automationCoverage)),
    confidence: trimOrEmpty_(get(map.confidence)),
    // У короткій гілці "blockers" — це відповідь на "що потрібно, щоб почати".
    blockers: trimOrEmpty_(get(map.blockers)) || trimOrEmpty_(get(map.noAiNeeds)),
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
