/* ====================================================================
   DENIAL DEFENDER — ENGINE
==================================================================== */

//const ETIOLOGIES = JSON.parse(document.getElementById('etiologies-data').textContent);
//const CASES_DATA = JSON.parse(document.getElementById('cases-data').textContent);

const [CASES_DATA, ETIOLOGIES] = await Promise.all([
  fetch('cases.json').then(res => res.json()),
  fetch('etiologies.json').then(res => res.json())
]);
const ALL_CASES = CASES_DATA.cases;

const SESSION_SIZE = 5;

// SESSION STATE
let session = null; // { cases: [], currentIdx: 0, results: [] }
let currentResponse = null; // { indication: "DFU", criteria: { id: {answer, evidence} } }

// ====================================================================
// UTILITIES
// ====================================================================

function $(id) { return document.getElementById(id); }
function el(tag, opts = {}, children = []) {
  const e = document.createElement(tag);
  if (opts.className) e.className = opts.className;
  if (opts.text) e.textContent = opts.text;
  if (opts.html) e.innerHTML = opts.html;
  if (opts.attrs) Object.entries(opts.attrs).forEach(([k, v]) => e.setAttribute(k, v));
  if (opts.style) Object.entries(opts.style).forEach(([k, v]) => e.style[k] = v);
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return e;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Path 4: keyword match for evidence text — case-insensitive, punctuation-normalized substring check.
// Both sides get the same normalization so tokens like "x-ray" or "02/15" still match the trainee's text.
// Returns array of tokens that hit (in original form). If tokens missing/empty, returns null (engine skips the soft signal).
function tokenMatch(yourText, tokens) {
  if (!tokens || !Array.isArray(tokens) || tokens.length === 0) return null;
  if (!yourText) return [];
  const normalize = s => String(s).toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' ').replace(/\s+/g, ' ').trim();
  const normalizedText = normalize(yourText);
  return tokens.filter(t => normalizedText.includes(normalize(t)));
}

function showScreen(id) {
  ['screen-landing', 'screen-case', 'screen-feedback', 'screen-end'].forEach(s => {
    $(s).classList.add('hidden');
  });
  $(id).classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ====================================================================
// SESSION START — in-memory shuffle-bag (anti-repeat across rounds)
// ====================================================================

var _tierDecks = {};   // tier -> remaining shuffled case ids (this page-load)
var _lastDealt = {};   // tier -> last dealt id (seam guard at reshuffle)

function startSession() {
  const TIERS = ['L1', 'L2', 'L3', 'L4', 'L5'];
  const picked = [];
  const missing = [];

  TIERS.forEach(tier => {
    const tierCases = ALL_CASES.filter(c => c.difficulty === tier);
    if (tierCases.length === 0) { missing.push(tier); return; }

    let deck = _tierDecks[tier] || [];

    // deck spent (or first round this page-load) -> reshuffle a fresh deck
    if (deck.length === 0) {
      deck = shuffle(tierCases.map(c => c.id));
      // seam guard: don't repeat the just-seen case back-to-back
      const last = _lastDealt[tier];
      if (deck.length > 1 && deck[0] === last) {
        const swapAt = 1 + Math.floor(Math.random() * (deck.length - 1));
        const tmp = deck[0]; deck[0] = deck[swapAt]; deck[swapAt] = tmp;
      }
    }

    const nextId = deck.shift();   // deal one card
    _lastDealt[tier] = nextId;
    _tierDecks[tier] = deck;       // save remainder for next round

    const chosen = tierCases.find(c => c.id === nextId);
    if (chosen) picked.push(chosen);
  });

  if (missing.length > 0) {
    console.warn('no cases authored for tier(s): ' + missing.join(', ') + '. Session length: ' + picked.length + ' instead of 5.');
  }

  // Shuffle the picked cases so the trainee doesn't see an L1->L5 ramp
  session = { cases: shuffle(picked), currentIdx: 0, results: [] };
  renderCase();
}

// ====================================================================
// CASE RENDERING
// ====================================================================

function renderCase() {
  const c = session.cases[session.currentIdx];
  showScreen('screen-case');

  // Progress
  $('case-num').textContent = session.currentIdx + 1;
  $('case-total').textContent = session.cases.length;
  const dots = $('progress-dots');
  dots.innerHTML = '';
  for (let i = 0; i < session.cases.length; i++) {
    const dot = el('div', { className: 'dot' });
    if (i < session.currentIdx) {
      dot.classList.add(session.results[i].indicationCorrect && session.results[i].allCriteriaCorrect ? 'done' : 'wrong');
    } else if (i === session.currentIdx) {
      dot.classList.add('active');
    }
    dots.appendChild(dot);
  }

  // Patient Card
  renderPatientCard(c);

  // Decision Panel reset
  currentResponse = { indication: '', criteria: {} };
  renderIndicationSelect();
  $('criteria-container').innerHTML = '';
  $('criteria-container').classList.remove('active');
  $('btn-submit').disabled = true;
}

function renderPatientCard(c) {
  const p = c.patient;
  const card = $('patient-card');
  card.innerHTML = '';

  // Header
  card.appendChild(el('div', { className: 'ph-header' }, [
    el('div', { className: 'ph-name', text: p.name }),
    el('div', { className: 'ph-review', text: `Review Date: ${c.review_date}` })
  ]));

  // Body
  const body = el('div', { className: 'ph-body' });

  // Demographics
  body.appendChild(makeSection('Demographics', [
    makeRow('DOB', p.dob),
    makeRow('Age', String(p.age)),
    makeRow('Sex', p.sex),
  ]));

  // Diagnoses
  body.appendChild(makeSection('Diagnoses', [makeList(p.dx)]));

  // Medications
  if (p.medications && p.medications.length) {
    body.appendChild(makeSection('Medications', [makeList(p.medications)]));
  }

  // Surgeries
  if (p.surgeries && p.surgeries.length) {
    body.appendChild(makeSection('Surgical History', [
      makeTable(['Procedure', 'Date'], p.surgeries.map(s => [s.procedure, s.date]))
    ]));
  }

  // Labs
  if (p.labs && p.labs.length) {
    body.appendChild(makeSection('Labs', [
      makeTable(['Test', 'Value', 'Date'], p.labs.map(l => [l.test, l.value, l.date]))
    ]));
  }

  // Radiology
  if (p.radiology && p.radiology.length) {
    body.appendChild(makeSection('Radiology', [
      makeTable(['Study', 'Date', 'Finding'], p.radiology.map(r => [r.study, r.date, r.finding]))
    ]));
  }

  // Medical Devices
  if (p.medical_devices && p.medical_devices.length) {
    body.appendChild(makeSection('Medical Devices', [makeList(p.medical_devices)]));
  }

  // Assistive Devices
  if (p.assistive_devices && p.assistive_devices.length) {
    body.appendChild(makeSection('Assistive Devices', [makeList(p.assistive_devices)]));
  }

  // Wound Measurements
  if (p.wound_measurements && p.wound_measurements.length) {
    body.appendChild(makeSection('Wound Measurements', [
      makeTable(
        ['Date', 'L (cm)', 'W (cm)', 'D (cm)', 'Area (cm²)'],
        p.wound_measurements.map(w => [w.date, w.length_cm || '—', w.width_cm || '—', w.depth_cm || '—', w.area_cm2 || '—'])
      )
    ]));
  }

  // Wound Dressing
  if (p.wound_dressing) {
    body.appendChild(makeSection('Wound Dressing', [el('div', { text: p.wound_dressing, style: { fontSize: '14px' } })]));
  }

  // Radiotherapy
  if (p.radiotherapy) {
    const rtText = typeof p.radiotherapy === 'object'
      ? [
          p.radiotherapy.total_dose_cGy != null ? `${p.radiotherapy.total_dose_cGy} cGy` : null,
          p.radiotherapy.anatomical_field || null,
          p.radiotherapy.end_date ? `completed ${p.radiotherapy.end_date}` : null,
          p.radiotherapy.fractionation || null
        ].filter(Boolean).join(' · ')
      : p.radiotherapy;
    body.appendChild(makeSection('Radiotherapy', [el('div', { className: 'ph-radio', text: rtText })]));
  }

  // Clinical Notes
  body.appendChild(makeSection('Clinical Notes', [el('div', { className: 'ph-notes', text: p.clinical_notes })]));

  card.appendChild(body);
}

function makeSection(title, children) {
  const s = el('div', { className: 'ph-section' });
  s.appendChild(el('h4', { text: title }));
  (Array.isArray(children) ? children : [children]).forEach(c => s.appendChild(c));
  return s;
}

function makeRow(k, v) {
  return el('div', { className: 'row' }, [
    el('span', { className: 'k', text: k }),
    el('span', { text: v })
  ]);
}

function makeList(items) {
  const ul = el('ul');
  items.forEach(it => ul.appendChild(el('li', { text: it })));
  return ul;
}

function makeTable(headers, rows) {
  const t = el('table', { className: 'ph-table' });
  const thead = el('thead');
  const hr = el('tr');
  headers.forEach(h => hr.appendChild(el('th', { text: h })));
  thead.appendChild(hr);
  t.appendChild(thead);
  const tbody = el('tbody');
  rows.forEach(r => {
    const tr = el('tr');
    r.forEach(c => tr.appendChild(el('td', { text: String(c) })));
    tbody.appendChild(tr);
  });
  t.appendChild(tbody);
  return t;
}

// ====================================================================
// DECISION PANEL
// ====================================================================

function renderIndicationSelect() {
  const sel = $('indication-select');
  sel.innerHTML = '<option value="">— Select an indication —</option>';

  // Group: real indications first, then non-indication answers
  const realKeys = Object.keys(ETIOLOGIES).filter(k =>
    !k.startsWith('_') && ETIOLOGIES[k].category !== 'non_indication'
  ).sort((a, b) => ETIOLOGIES[a].label.localeCompare(ETIOLOGIES[b].label));
  const nonIndKeys = Object.keys(ETIOLOGIES).filter(k =>
    !k.startsWith('_') && ETIOLOGIES[k].category === 'non_indication'
  );

  const grpReal = el('optgroup', { attrs: { label: 'Wound Etiologies' } });
  realKeys.forEach(k => grpReal.appendChild(el('option', { text: ETIOLOGIES[k].label, attrs: { value: k } })));
  sel.appendChild(grpReal);

  const grpNon = el('optgroup', { attrs: { label: 'Other Outcomes' } });
  nonIndKeys.forEach(k => grpNon.appendChild(el('option', { text: ETIOLOGIES[k].label, attrs: { value: k } })));
  sel.appendChild(grpNon);

  sel.value = '';
}

$('indication-select').addEventListener('change', (e) => {
  const key = e.target.value;
  currentResponse.indication = key;
  currentResponse.criteria = {};
  renderCriteria(key);
  updateSubmitState();
});

function renderCriteria(indicationKey) {
  const container = $('criteria-container');
  container.innerHTML = '';
  if (!indicationKey) {
    container.classList.remove('active');
    return;
  }

  const ind = ETIOLOGIES[indicationKey];
  container.classList.add('active');

  if (ind.category === 'non_indication') {
    const note = ind.key === 'NOT_WC_PATHWAY'
      ? 'You are calling this wound outside the outpatient wound care pathway (emergency, HBOT-direct, or non-WC). Click Submit to lock in your call.'
      : 'You are calling this chart incomplete — clinical eligibility may exist, but required documentation is missing. Click Submit to lock in your call.';
    container.appendChild(el('div', { className: 'dp-noind', text: note }));
    return;
  }

  container.appendChild(el('h4', { text: `${ind.label} — Criteria` }));

  ind.criteria.forEach(crit => {
    const item = el('div', { className: 'dp-crit-item' });
    item.appendChild(el('div', { className: 'dp-crit-label', text: crit.label }));

    const radios = el('div', { className: 'dp-crit-radios' });
    crit.answer_options.forEach(opt => {
      const lbl = el('label');
      const radio = el('input', { attrs: { type: 'radio', name: `crit-${crit.id}`, value: opt } });
      radio.addEventListener('change', () => {
        if (!currentResponse.criteria[crit.id]) currentResponse.criteria[crit.id] = {};
        currentResponse.criteria[crit.id].answer = opt;
        updateSubmitState();
      });
      lbl.appendChild(radio);
      lbl.appendChild(document.createTextNode(' ' + opt));
      radios.appendChild(lbl);
    });
    item.appendChild(radios);

    if (crit.requires_evidence) {
      const ev = el('input', {
        className: 'dp-crit-evidence',
        attrs: { type: 'text', placeholder: 'Cite the supporting evidence from the chart…' }
      });
      ev.addEventListener('input', (e) => {
        if (!currentResponse.criteria[crit.id]) currentResponse.criteria[crit.id] = {};
        currentResponse.criteria[crit.id].evidence = e.target.value;
        updateSubmitState();
      });
      item.appendChild(ev);
    }

    container.appendChild(item);
  });
}

function updateSubmitState() {
  if (!currentResponse.indication) {
    $('btn-submit').disabled = true;
    return;
  }
  const ind = ETIOLOGIES[currentResponse.indication];
  if (ind.category === 'non_indication') {
    $('btn-submit').disabled = false;
    return;
  }
  // Real indication: require all criteria to have an answer + evidence (if criterion requires evidence)
  const allAnswered = ind.criteria.every(c => {
    const r = currentResponse.criteria[c.id];
    if (!r || !r.answer) return false;
    if (c.requires_evidence && r.answer === 'Yes' && !(r.evidence && r.evidence.trim())) return false;
    return true;
  });
  $('btn-submit').disabled = !allAnswered;
}

$('btn-submit').addEventListener('click', submitCall);

// ====================================================================
// SUBMIT & GRADE
// ====================================================================

function submitCall() {
  const c = session.cases[session.currentIdx];

  const indicationCorrect = currentResponse.indication === c.correct_indication;
  const critResults = {};
  let critCorrectCount = 0;
  let critTotalCount = 0;

  if (ETIOLOGIES[c.correct_indication].category === 'non_indication') {
    // No criteria to grade; indication call alone determines correctness
} else if (indicationCorrect) {
    const ind = ETIOLOGIES[c.correct_indication];
    ind.criteria.forEach(crit => {
      critTotalCount++;
      const correctCrit = c.correct_criteria[crit.id] || {};
      const yourCrit = currentResponse.criteria[crit.id] || {};
      const isCorrect = correctCrit.answer === yourCrit.answer;
      if (isCorrect) critCorrectCount++;
      // Path 4: silent token match. Returns null if no tokens authored — feedback will skip the soft signal.
      const tokensHit = tokenMatch(yourCrit.evidence, correctCrit.tokens);
      critResults[crit.id] = {
        label: crit.label,
        yourAnswer: yourCrit.answer,
        correctAnswer: correctCrit.answer,
        correctEvidence: correctCrit.evidence,
        yourEvidence: yourCrit.evidence,
        tokensHit,
        tokensTotal: (correctCrit.tokens || []).length,
        isCorrect
      };
    });
  }

  const allCriteriaCorrect = critTotalCount === 0 || critCorrectCount === critTotalCount;

  const result = {
    caseId: c.id,
    patientName: c.patient.name,
    yourIndication: currentResponse.indication,
    correctIndication: c.correct_indication,
    indicationCorrect,
    critResults,
    critCorrectCount,
    critTotalCount,
    allCriteriaCorrect,
    teachingMoment: c.teaching_moment,
    difficulty: c.difficulty,
    difficultyExplanation: c.difficulty_explanation
  };

  session.results.push(result);
  renderFeedback(result);
}

// ====================================================================
// FEEDBACK
// ====================================================================

function renderFeedback(result) {
  showScreen('screen-feedback');

  // Banner
  let bannerClass = 'wrong';
  let bannerText = 'Not Quite — Let\'s Look at What Happened';
  if (result.indicationCorrect && result.allCriteriaCorrect) {
    bannerClass = 'correct';
    bannerText = 'Correct — Nailed the Call';
  } else if (result.indicationCorrect && !result.allCriteriaCorrect) {
    bannerClass = 'partial';
    bannerText = 'Partial — Right Etiology, Missed Some Criteria';
  }
  $('fb-banner').className = `fb-banner ${bannerClass}`;
  $('fb-banner').textContent = bannerText;

  const body = $('fb-body');
  body.innerHTML = '';

  // Difficulty tag
  body.appendChild(el('div', { className: `fb-difficulty ${result.difficulty}`, text: `${result.difficulty} — ${result.difficultyExplanation.replace(/^L\d\s*[—-]\s*/, '')}` }));

  // Indication comparison
  const indSection = el('div', { className: 'fb-section' });
  indSection.appendChild(el('h3', { text: 'Etiology Call' }));
  const indCompare = el('div', { className: 'fb-ind-compare' });

  const yourCell = el('div', { className: `fb-ind-cell ${result.indicationCorrect ? 'your-correct' : 'your-wrong'}` });
  yourCell.appendChild(el('div', { className: 'label', text: 'Your Call' }));
  yourCell.appendChild(el('div', { className: 'value', text: result.yourIndication ? ETIOLOGIES[result.yourIndication].label : '(none)' }));
  indCompare.appendChild(yourCell);

  const correctCell = el('div', { className: 'fb-ind-cell correct-answer' });
  correctCell.appendChild(el('div', { className: 'label', text: 'Correct Call' }));
  correctCell.appendChild(el('div', { className: 'value', text: ETIOLOGIES[result.correctIndication].label }));
  indCompare.appendChild(correctCell);
  indSection.appendChild(indCompare);
  body.appendChild(indSection);

  // Criteria breakdown (only if indication was right + criteria exist)
  if (result.indicationCorrect && result.critTotalCount > 0) {
    const critSection = el('div', { className: 'fb-section' });
    critSection.appendChild(el('h3', { text: `Criteria — ${result.critCorrectCount} of ${result.critTotalCount} correct` }));
    Object.values(result.critResults).forEach(cr => {
      const item = el('div', { className: 'fb-crit-item' });
      item.appendChild(el('div', { className: `fb-crit-icon ${cr.isCorrect ? 'ok' : 'fail'}`, text: cr.isCorrect ? '✓' : '✗' }));
      item.appendChild(el('div', { className: 'fb-crit-label', text: cr.label }));
      const ansBlock = el('div', { className: 'fb-crit-answer' });
      ansBlock.appendChild(el('div', { className: 'a-label', text: 'Your answer' }));
      ansBlock.appendChild(el('div', { className: `a-value ${cr.isCorrect ? 'correct' : 'you'}`, text: cr.yourAnswer || '(blank)' }));
      if (!cr.isCorrect) {
        ansBlock.appendChild(el('div', { className: 'a-label', style: { marginTop: '4px' }, text: 'Correct' }));
        ansBlock.appendChild(el('div', { className: 'a-value correct', text: cr.correctAnswer || '(blank)' }));
      }
      if (cr.correctEvidence) {
        ansBlock.appendChild(el('div', { className: 'a-label', style: { marginTop: '4px' }, text: 'Look for' }));
        ansBlock.appendChild(el('div', { className: 'small muted', text: cr.correctEvidence }));
      }
      // Path 4: soft signal — only shown when tokens were authored on this criterion
      if (cr.tokensHit !== null && cr.tokensTotal > 0) {
        ansBlock.appendChild(el('div', { className: 'a-label', style: { marginTop: '6px' }, text: 'Your citation captured' }));
        const hitText = cr.tokensHit.length > 0
          ? `${cr.tokensHit.length} of ${cr.tokensTotal} key element${cr.tokensTotal === 1 ? '' : 's'}: ${cr.tokensHit.join(', ')}`
          : `0 of ${cr.tokensTotal} key elements — review what to look for above`;
        ansBlock.appendChild(el('div', { className: 'small muted', text: hitText }));
      }
      item.appendChild(ansBlock);
      critSection.appendChild(item);
    });
    body.appendChild(critSection);
  }

  // Teaching moment
  const tm = el('div', { className: 'fb-section' });
  const tmBox = el('div', { className: 'fb-teaching' });
  tmBox.appendChild(el('h4', { text: 'Teaching Moment' }));
  tmBox.appendChild(el('p', { text: result.teachingMoment }));
  tm.appendChild(tmBox);
  body.appendChild(tm);

  // Actions
  const actions = el('div', { className: 'fb-actions' });
  const isLast = session.currentIdx === session.cases.length - 1;
  const next = el('button', { className: 'btn btn-primary', text: isLast ? 'See Session Summary' : 'Next Case' });
  next.addEventListener('click', () => {
    if (isLast) renderSessionEnd();
    else {
      session.currentIdx++;
      renderCase();
    }
  });
  actions.appendChild(next);
  body.appendChild(actions);
}

// ====================================================================
// SESSION END
// ====================================================================

function renderSessionEnd() {
  showScreen('screen-end');

  const total = session.results.length;
  const indCorrect = session.results.filter(r => r.indicationCorrect).length;
  const critCorrectTotal = session.results.reduce((s, r) => s + r.critCorrectCount, 0);
  const critTotalTotal = session.results.reduce((s, r) => s + r.critTotalCount, 0);

  const summary = $('end-summary');
  summary.innerHTML = '';

  const indPct = Math.round((indCorrect / total) * 100);
  summary.appendChild(scoreRow('Indications Correct', `${indCorrect} / ${total}  (${indPct}%)`));
  if (critTotalTotal > 0) {
    const cPct = Math.round((critCorrectTotal / critTotalTotal) * 100);
    summary.appendChild(scoreRow('Criteria Correct', `${critCorrectTotal} / ${critTotalTotal}  (${cPct}%)`));
  }

  const list = $('end-case-list');
  list.innerHTML = '';
  session.results.forEach((r, idx) => {
    const ok = r.indicationCorrect && r.allCriteriaCorrect;
    const item = el('div', { className: `case-list-item ${ok ? 'ok' : 'fail'}` });
    item.appendChild(el('div', {}, [
      el('span', { className: 'num', text: `#${idx + 1}` }),
      el('span', { className: 'patient-name', text: r.patientName }),
      el('span', { className: 'small muted', text: `  ·  ${r.difficulty}` })
    ]));
    item.appendChild(el('span', { className: 'result', text: ok ? '✓ Correct' : '✗ Review' }));
    list.appendChild(item);
  });
}

function scoreRow(label, value) {
  return el('div', { className: 'score-row' }, [
    el('div', { className: 'label', text: label }),
    el('div', { className: 'value', text: value })
  ]);
}

$('btn-start').addEventListener('click', startSession);
$('btn-replay').addEventListener('click', startSession);
$('btn-done').addEventListener('click', () => showScreen('screen-landing'));

// ====================================================================
// DATA VALIDATOR  (smoke-screen: bad case data bounces at the door)
// ====================================================================
function validateData() {
  const errors = [];
  const etioKeys = new Set(Object.keys(ETIOLOGIES).filter(k => !k.startsWith('_')));
  ALL_CASES.forEach(c => {
    if (!/^L[1-5]$/.test(c.difficulty || '')) errors.push(c.id + ': bad difficulty "' + c.difficulty + '"');
    if (!etioKeys.has(c.correct_indication)) {
      errors.push(c.id + ': unknown etiology key "' + c.correct_indication + '"');
      return;
    }
    const etio = ETIOLOGIES[c.correct_indication];
    if (etio.category === 'non_indication') return; // no criteria to check
    const critIds = new Set(etio.criteria.map(cr => cr.id));
    const key = c.correct_criteria || {};
    etio.criteria.forEach(cr => {
      if (!(cr.id in key)) errors.push(c.id + ': missing answer-key for criterion "' + cr.id + '"');
    });
    const chartText = JSON.stringify(c.patient || {}).toLowerCase();
    Object.entries(key).forEach(([cid, ck]) => {
      if (!critIds.has(cid)) errors.push(c.id + ': criterion "' + cid + '" not in etiology "' + c.correct_indication + '"');
      (ck.tokens || []).forEach(t => {
        const norm = String(t).toLowerCase();
        if (norm && !chartText.includes(norm)) errors.push(c.id + '.' + cid + ': token "' + t + '" not found in chart');
      });
    });
  });
  return errors;
}

function showDataError(errors) {
  const banner = el('div', { style: {
    background: '#894038', color: '#fff', padding: '14px 18px', margin: '0 0 16px',
    borderRadius: '8px', fontSize: '14px', lineHeight: '1.5', fontFamily: 'monospace'
  }});
  banner.appendChild(el('strong', { text: 'Denial Defender — DATA VALIDATION FAILED (' + errors.length + '). Fix before authoring/shipping:' }));
  const ul = el('ul', { style: { margin: '8px 0 0', paddingLeft: '20px' } });
  errors.slice(0, 50).forEach(e => ul.appendChild(el('li', { text: e })));
  banner.appendChild(ul);
  const app = $('app');
  app.insertBefore(banner, app.firstChild);
}

const _dataErrors = validateData();
if (_dataErrors.length) {
  console.error('Denial Defender data validation FAILED:\n' + _dataErrors.join('\n'));
  showDataError(_dataErrors);
} else {
  console.log('Denial Defender: data validation passed (' + ALL_CASES.length + ' cases).');
}