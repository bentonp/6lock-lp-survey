/* ============================================
   The 2026 LP Capital Integrity Index - 6lock
   Annual survey of private market investors.
   Sister product to the PE Security Index.
   ============================================ */

// ===== CONFIGURATION =====
const CONFIG = {
  emailjs: {
    serviceId: 'YOUR_SERVICE_ID',
    templateId: 'YOUR_TEMPLATE_ID',
    publicKey: 'YOUR_PUBLIC_KEY'
  },
  websiteUrl: 'https://6lock.com',
  securityIndexUrl: 'https://www.6lock.com/security-index',
  // Google Apps Script web app URL (deploy a NEW Apps Script for this survey - do NOT reuse Security Index endpoint)
  sheetsWebhookUrl: 'YOUR_LP_SURVEY_WEBHOOK_URL',
  webhookToken: '6lock-lpindex-2026-CHANGEME'
};

// ===== QUESTIONS =====
// Source: 6lock_LP_Capital_Integrity_Survey_FINAL.md (Keith, 2026-04-30)
// Question types: 'single' | 'multi' | 'matrix' | 'rating' | 'open'
// Special flags:
//   - answers[i].exclusive: true   → selecting clears all others (e.g. "Prefer not to say")
//   - answers[i].other: true       → selecting reveals a free-text input
//   - max: N (multi only)          → soft cap at N selections
const QUESTIONS = [
  {
    id: 1,
    type: 'single',
    text: 'Which best describes you as a private market investor?',
    answers: [
      { text: 'Individual / accredited investor' },
      { text: 'Family office (single or multi)' },
      { text: 'RIA, wealth advisor, or financial planner' },
      { text: 'General Partner or fund manager' },
      { text: 'Corporate executive or founder' },
      { text: 'Other' }
    ]
  },
  {
    id: 2,
    type: 'matrix',
    text: 'Compared to five years ago, moving money in your private market investments has become...',
    hint: 'Rate each row on a 1–5 scale.',
    rows: ['Safer', 'Easier and more efficient'],
    scale: 5,
    labels: ['Much worse', 'Much better']
  },
  {
    id: 3,
    type: 'multi',
    text: 'Which of these fraud or impersonation tactics targeting private market investors are you familiar with?',
    hint: 'Select all that apply.',
    answers: [
      { text: 'Business email compromise (BEC) / spoofed wire instructions' },
      { text: 'Deepfake voice or video impersonation of a GP, CFO, or fund admin' },
      { text: 'Phishing tied to capital call notifications' },
      { text: 'Fraudulent LP onboarding or KYC bypass' },
      { text: 'Insider impersonation by a compromised employee' },
      { text: "I'm not familiar with any of these", exclusive: true }
    ]
  },
  {
    id: 4,
    type: 'multi',
    text: 'In the past 24 months, have you or your firm experienced any of the following?',
    hint: 'Select all that apply.',
    answers: [
      { text: 'Received suspicious or fraudulent wire instructions tied to a fund' },
      { text: 'Been the target of an impersonation attempt (email, voice, or video)' },
      { text: "Witnessed a fraud incident at a fund I'm invested in" },
      { text: 'Heard of a peer or colleague being targeted' },
      { text: 'None of the above', exclusive: true },
      { text: 'Prefer not to say', exclusive: true }
    ]
  },
  {
    id: 5,
    type: 'rating',
    text: "How confident are you that your fund manager's current processes prevent unauthorized capital movement during capital calls and distributions?",
    scale: 5,
    labels: ['Not at all confident', 'Highly confident']
  },
  {
    id: 6,
    type: 'multi',
    text: "When you receive wire instructions for a capital call or distribution, how do you typically verify they're authentic?",
    hint: 'Select all that apply.',
    answers: [
      { text: 'Call the fund manager directly at a known, previously verified number' },
      { text: 'Reply to the email confirming the details' },
      { text: 'Compare against prior wire instructions on file' },
      { text: 'Use a secure investor portal with verification controls' },
      { text: 'Trust the email and proceed if it looks legitimate' },
      { text: "My back office, advisor, or admin handles this — I don't personally verify" }
    ]
  },
  {
    id: 7,
    type: 'rating',
    text: 'How frustrating do you find the current process of verifying wire instructions, confirming bank details, and re-authenticating with each fund manager?',
    scale: 5,
    labels: ["Not at all; it's smooth", 'A genuine pain point']
  },
  {
    id: 8,
    type: 'single',
    text: 'Roughly how many separate LP portals or fund manager systems do you (or your team) currently access for your private market investments?',
    answers: [
      { text: '1–2' },
      { text: '3–5' },
      { text: '6–10' },
      { text: '11+' },
      { text: 'I delegate this entirely to staff or an advisor' }
    ]
  },
  {
    id: 9,
    type: 'multi',
    max: 2,
    text: "If a fund you've invested in disclosed a wire fraud incident, even one that didn't directly affect your capital, how would you respond?",
    hint: 'Select up to 2.',
    answers: [
      { text: 'Reduce future commitments to that GP' },
      { text: 'Decline to participate in their next fund' },
      { text: 'Demand a detailed remediation plan before further commitment' },
      { text: 'Question my other GPs about their controls' },
      { text: 'No change — fraud happens; the response matters more than the incident' },
      { text: 'Try to withdraw or redeem if possible' }
    ]
  },
  {
    id: 10,
    type: 'single',
    text: "What's the single most important thing your GPs could do to strengthen capital integrity?",
    answers: [
      { text: 'Identity re-verification on every capital call and distribution' },
      { text: 'Independent third-party audits of money movement controls' },
      { text: 'Mandatory disclosure of fraud incidents and controls in LP reports' },
      { text: 'Transaction-level insurance coverage on capital movement' },
      { text: 'Stronger LP portal security (MFA, behavioral monitoring)' },
      { text: 'Other (please specify)', other: true }
    ]
  },
  {
    id: 11,
    type: 'open',
    optional: true,
    text: "In one or two sentences, what's your biggest concern about how money moves in your private market investments today? e.g. Fraud, friction, experience, other.",
    hint: 'Optional.'
  }
];

// ===== STATE =====
const state = {
  currentQuestion: 0,
  answers: [],
  respondent: null,
  sessionId: null,
  source: null
};

// ===== DOM REFS =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ===== SCREEN MANAGEMENT =====
function showScreen(screenId) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  const target = $('#' + screenId);
  void target.offsetWidth;
  target.classList.add('active');
  const progressBar = $('#progress-bar');
  if (screenId === 'screen-question') progressBar.classList.add('visible');
  else progressBar.classList.remove('visible');
}

function updateProgressBar() {
  const pct = (state.currentQuestion / QUESTIONS.length) * 100;
  $('#progress-fill').style.width = pct + '%';
}

// ===== RENDER QUESTION =====
function renderQuestion(index) {
  const q = QUESTIONS[index];
  state.currentQuestion = index;
  updateProgressBar();

  $('#btn-back-question').style.display = index === 0 ? 'none' : '';
  $('#question-counter').textContent = 'Question ' + (index + 1) + ' of ' + QUESTIONS.length;
  $('#question-text').textContent = q.text;

  const hint = $('#question-hint');
  if (q.hint) { hint.textContent = q.hint; hint.hidden = false; }
  else hint.hidden = true;

  const answersContainer = $('#question-answers');
  const textareaEl = $('#question-textarea');
  const otherInput = $('#question-other-text');
  answersContainer.innerHTML = '';
  answersContainer.hidden = false;
  textareaEl.hidden = true;
  textareaEl.value = '';
  otherInput.hidden = true;
  otherInput.value = '';
  $('#btn-next').hidden = true;

  if (q.type === 'single') renderSingleSelect(q, index);
  else if (q.type === 'multi') renderMultiSelect(q, index);
  else if (q.type === 'rating') renderRating(q, index);
  else if (q.type === 'matrix') renderMatrix(q, index);
  else if (q.type === 'open') renderOpen(q, index);

  restorePriorAnswer(q, index);
  showScreen('screen-question');
}

// ===== RENDERERS =====
function renderSingleSelect(q, qIndex) {
  const container = $('#question-answers');
  q.answers.forEach((answer, aIndex) => {
    const card = document.createElement('div');
    card.className = 'answer-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.dataset.aIndex = aIndex;
    card.innerHTML = '<div class="answer-card__radio"></div><span class="answer-card__text">' + escapeHtml(answer.text) + '</span>';
    const handler = () => selectSingle(qIndex, aIndex);
    card.addEventListener('click', handler);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } });
    container.appendChild(card);
  });
}

function renderMultiSelect(q, qIndex) {
  const container = $('#question-answers');
  const counter = document.createElement('div');
  counter.className = 'multi-counter';
  counter.id = 'multi-counter-' + qIndex;
  counter.innerHTML = '<span><strong>0</strong>' + (q.max ? ' of ' + q.max : '') + ' selected</span>';
  container.appendChild(counter);

  q.answers.forEach((answer, aIndex) => {
    const card = document.createElement('div');
    card.className = 'answer-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.dataset.aIndex = aIndex;
    card.innerHTML = '<div class="answer-card__check"></div><span class="answer-card__text">' + escapeHtml(answer.text) + '</span>';
    const handler = () => toggleMulti(qIndex, aIndex);
    card.addEventListener('click', handler);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } });
    container.appendChild(card);
  });
}

function renderRating(q, qIndex) {
  const container = $('#question-answers');
  const scaleWrap = document.createElement('div');
  scaleWrap.className = 'rating-scale';
  for (let i = 1; i <= q.scale; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rating-btn';
    btn.textContent = i;
    btn.dataset.value = i;
    btn.addEventListener('click', () => selectRating(qIndex, i));
    scaleWrap.appendChild(btn);
  }
  container.appendChild(scaleWrap);
  if (q.labels) {
    const labels = document.createElement('div');
    labels.className = 'rating-labels';
    labels.innerHTML = '<span>' + escapeHtml(q.labels[0]) + '</span><span>' + escapeHtml(q.labels[1]) + '</span>';
    container.appendChild(labels);
  }
}

function renderMatrix(q, qIndex) {
  const container = $('#question-answers');
  const wrap = document.createElement('div');
  wrap.className = 'matrix';

  q.rows.forEach((rowLabel, rowIndex) => {
    const rowWrap = document.createElement('div');
    rowWrap.className = 'matrix-row';

    const label = document.createElement('div');
    label.className = 'matrix-row__label';
    label.textContent = rowLabel;
    rowWrap.appendChild(label);

    const scale = document.createElement('div');
    scale.className = 'matrix-row__scale';
    for (let i = 1; i <= q.scale; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'matrix-btn';
      btn.textContent = i;
      btn.dataset.row = rowIndex;
      btn.dataset.value = i;
      btn.addEventListener('click', () => selectMatrix(qIndex, rowIndex, i));
      scale.appendChild(btn);
    }
    rowWrap.appendChild(scale);

    if (q.labels) {
      const labels = document.createElement('div');
      labels.className = 'matrix-row__labels';
      labels.innerHTML = '<span>' + escapeHtml(q.labels[0]) + '</span><span>' + escapeHtml(q.labels[1]) + '</span>';
      rowWrap.appendChild(labels);
    }

    wrap.appendChild(rowWrap);
  });

  container.appendChild(wrap);
}

function renderOpen(q, qIndex) {
  $('#question-answers').hidden = true;
  const textareaEl = $('#question-textarea');
  textareaEl.hidden = false;
  // Optional Q11 → Next available immediately
  $('#btn-next').hidden = false;
  // Use property assignment to avoid stacking listeners across re-renders.
  textareaEl.oninput = () => {
    state.answers[qIndex] = { questionId: q.id, type: 'open', text: textareaEl.value };
  };
}

function restorePriorAnswer(q, index) {
  const prior = state.answers[index];
  if (!prior) return;
  if (q.type === 'single') {
    const cards = $$('#question-answers .answer-card');
    if (cards[prior.selectedIndex]) cards[prior.selectedIndex].classList.add('selected');
    // Restore "other" text + reattach input handler if the prior answer was an "other" choice
    const priorAnswer = q.answers[prior.selectedIndex];
    if (priorAnswer && priorAnswer.other) {
      const otherInput = $('#question-other-text');
      otherInput.hidden = false;
      otherInput.value = prior.otherText || '';
      otherInput.oninput = () => {
        const cur = state.answers[index];
        if (cur) cur.otherText = otherInput.value;
      };
    }
    showNext();
  } else if (q.type === 'multi') {
    const cards = $$('#question-answers .answer-card');
    (prior.selectedIndices || []).forEach(idx => { if (cards[idx]) cards[idx].classList.add('selected'); });
    updateMultiCounter(index);
    if ((prior.selectedIndices || []).length > 0) showNext();
  } else if (q.type === 'rating') {
    $$('.rating-btn').forEach(b => { if (parseInt(b.dataset.value, 10) === prior.value) b.classList.add('selected'); });
    showNext();
  } else if (q.type === 'matrix') {
    if (prior.values) {
      Object.keys(prior.values).forEach(rowIdx => {
        const v = prior.values[rowIdx];
        $$('.matrix-btn[data-row="' + rowIdx + '"]').forEach(b => {
          if (parseInt(b.dataset.value, 10) === v) b.classList.add('selected');
        });
      });
      if (matrixComplete(q, prior)) showNext();
    }
  } else if (q.type === 'open') {
    $('#question-textarea').value = prior.text || '';
  }
}

// ===== ANSWER HANDLERS =====
function selectSingle(qIndex, aIndex) {
  const q = QUESTIONS[qIndex];
  const answer = q.answers[aIndex];
  $$('#question-answers .answer-card').forEach((card, i) => card.classList.toggle('selected', i === aIndex));

  const otherInput = $('#question-other-text');
  if (answer.other) {
    otherInput.hidden = false;
    otherInput.focus();
  } else {
    otherInput.hidden = true;
    otherInput.value = '';
  }

  state.answers[qIndex] = {
    questionId: q.id,
    type: 'single',
    selectedIndex: aIndex,
    selectedText: answer.text,
    otherText: answer.other ? otherInput.value : ''
  };

  // Update otherText on input
  if (answer.other) {
    otherInput.oninput = () => {
      const cur = state.answers[qIndex];
      if (cur) cur.otherText = otherInput.value;
    };
  }

  showNext();
}

function toggleMulti(qIndex, aIndex) {
  const q = QUESTIONS[qIndex];
  const tappedAnswer = q.answers[aIndex];
  let prior = state.answers[qIndex];
  if (!prior || prior.type !== 'multi') {
    prior = { questionId: q.id, type: 'multi', selectedIndices: [] };
    state.answers[qIndex] = prior;
  }
  let set = new Set(prior.selectedIndices);
  const cards = $$('#question-answers .answer-card');

  if (set.has(aIndex)) {
    set.delete(aIndex);
  } else {
    if (tappedAnswer.exclusive) {
      // Exclusive option: clear all others
      set = new Set([aIndex]);
    } else {
      // Tapping non-exclusive: clear any exclusive option(s) currently set
      q.answers.forEach((a, i) => { if (a.exclusive) set.delete(i); });
      if (q.max && set.size >= q.max) return;
      set.add(aIndex);
    }
  }
  prior.selectedIndices = Array.from(set);
  prior.selectedTexts = prior.selectedIndices.map(i => q.answers[i].text);

  cards.forEach((card) => {
    const idx = parseInt(card.dataset.aIndex, 10);
    if (Number.isNaN(idx)) return;
    card.classList.toggle('selected', set.has(idx));
    if (q.max) {
      const tappedIsExclusive = q.answers[idx] && q.answers[idx].exclusive;
      // disable non-exclusive cards when max reached AND not selected
      card.classList.toggle('disabled', !set.has(idx) && !tappedIsExclusive && set.size >= q.max);
    }
  });

  updateMultiCounter(qIndex);

  if (set.size > 0) showNext();
  else $('#btn-next').hidden = true;
}

function updateMultiCounter(qIndex) {
  const q = QUESTIONS[qIndex];
  const prior = state.answers[qIndex];
  const count = prior && prior.selectedIndices ? prior.selectedIndices.length : 0;
  const counter = $('#multi-counter-' + qIndex);
  if (counter) counter.innerHTML = '<span><strong>' + count + '</strong>' + (q.max ? ' of ' + q.max : '') + ' selected</span>';
}

function selectRating(qIndex, value) {
  const q = QUESTIONS[qIndex];
  $$('.rating-btn').forEach(b => b.classList.toggle('selected', parseInt(b.dataset.value, 10) === value));
  state.answers[qIndex] = { questionId: q.id, type: 'rating', value: value };
  showNext();
}

function selectMatrix(qIndex, rowIndex, value) {
  const q = QUESTIONS[qIndex];
  let prior = state.answers[qIndex];
  if (!prior || prior.type !== 'matrix') {
    prior = { questionId: q.id, type: 'matrix', values: {} };
    state.answers[qIndex] = prior;
  }
  prior.values[rowIndex] = value;

  // Visual: clear other selections in this row, set this one
  $$('.matrix-btn[data-row="' + rowIndex + '"]').forEach(b => {
    b.classList.toggle('selected', parseInt(b.dataset.value, 10) === value);
  });

  if (matrixComplete(q, prior)) showNext();
}

function matrixComplete(q, answer) {
  if (!answer || !answer.values) return false;
  return q.rows.every((_, idx) => answer.values[idx] != null);
}

function showNext() { $('#btn-next').hidden = false; }

// ===== ADVANCE / BACK =====
function advanceQuestion() {
  savePartialToSheets();
  const next = state.currentQuestion + 1;
  if (next < QUESTIONS.length) renderQuestion(next);
  else { $('#progress-fill').style.width = '100%'; setTimeout(showThanksScreen, 300); }
}

function goBack() {
  if (state.currentQuestion > 0) renderQuestion(state.currentQuestion - 1);
  else showScreen('screen-landing');
}

// ===== THANKS / CAPTURE =====
function showThanksScreen() { showScreen('screen-thanks'); }

function submitCaptureForm(e) {
  e.preventDefault();
  if ($('#field-website').value) return;

  const name = ($('#field-name').value || '').trim();
  const email = ($('#field-email').value || '').trim();
  const firm = ($('#field-firm').value || '').trim();
  const mailingList = $('#field-mailinglist').checked;

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    $('#field-email').classList.add('error');
    return;
  }
  $('#field-email').classList.remove('error');

  state.respondent = { name, email, firm, mailingList, wantsReport: !!email };
  finalizeSubmission();
}

function skipCapture() {
  state.respondent = { name: '', email: '', firm: '', mailingList: false, wantsReport: false };
  finalizeSubmission();
}

function finalizeSubmission() {
  submitToSheets();
  if (CONFIG.emailjs.publicKey !== 'YOUR_PUBLIC_KEY') sendNotificationEmail();
  if (CONFIG.sheetsWebhookUrl !== 'YOUR_LP_SURVEY_WEBHOOK_URL' && state.sessionId) {
    fetch(CONFIG.sheetsWebhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: CONFIG.webhookToken, sessionId: state.sessionId, isPartial: false })
    }).catch(err => console.error('Partial completion marker failed:', err));
  }
  showScreen('screen-done');
}

// ===== SHEETS =====
function savePartialToSheets() {
  if (CONFIG.sheetsWebhookUrl === 'YOUR_LP_SURVEY_WEBHOOK_URL' || !state.sessionId) return;
  fetch(CONFIG.sheetsWebhookUrl, {
    method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildAnswerPayload(true))
  }).catch(err => console.error('Partial save failed:', err));
}

function submitToSheets() {
  if (CONFIG.sheetsWebhookUrl === 'YOUR_LP_SURVEY_WEBHOOK_URL') {
    console.log('Sheets webhook not configured. Payload:', buildAnswerPayload(false));
    return;
  }
  fetch(CONFIG.sheetsWebhookUrl, {
    method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildAnswerPayload(false))
  }).then(() => console.log('Sheets: submitted'))
    .catch(err => console.error('Sheets submit failed:', err));
}

function buildAnswerPayload(isPartial) {
  const payload = {
    token: CONFIG.webhookToken,
    sessionId: state.sessionId,
    timestamp: new Date().toISOString(),
    isPartial: !!isPartial,
    source: state.source || ''
  };
  if (!isPartial && state.respondent) {
    payload.name = state.respondent.name || '';
    payload.email = state.respondent.email || '';
    payload.firm = state.respondent.firm || '';
    payload.mailingList = state.respondent.mailingList ? 'Yes' : 'No';
    payload.wantsReport = state.respondent.wantsReport ? 'Yes' : 'No';
  }
  QUESTIONS.forEach((q, i) => {
    const a = state.answers[i];
    if (!a) { payload['q' + q.id] = ''; return; }
    if (q.type === 'single') {
      payload['q' + q.id] = a.selectedText || '';
      if (a.otherText) payload['q' + q.id + '_other'] = a.otherText;
    } else if (q.type === 'multi') {
      payload['q' + q.id] = (a.selectedTexts || []).join(' | ');
    } else if (q.type === 'rating') {
      payload['q' + q.id] = a.value != null ? String(a.value) : '';
    } else if (q.type === 'matrix') {
      const parts = q.rows.map((label, idx) => label + ': ' + (a.values && a.values[idx] != null ? a.values[idx] : ''));
      payload['q' + q.id] = parts.join(' | ');
    } else if (q.type === 'open') {
      payload['q' + q.id] = a.text || '';
    }
  });
  return payload;
}

function sendNotificationEmail() {
  const answersSummary = QUESTIONS.map((q, i) => {
    const a = state.answers[i];
    let val = '(no answer)';
    if (a) {
      if (q.type === 'multi') val = (a.selectedTexts || []).join(', ');
      else if (q.type === 'rating') val = String(a.value);
      else if (q.type === 'matrix') val = q.rows.map((r, idx) => r + ': ' + (a.values[idx] || '-')).join('; ');
      else if (q.type === 'open') val = a.text || '(blank)';
      else val = a.selectedText + (a.otherText ? ' — ' + a.otherText : '');
    }
    return 'Q' + (i + 1) + ': ' + q.text + '\nA: ' + val;
  }).join('\n\n');

  const params = {
    respondent_name: state.respondent.name || '(anonymous)',
    respondent_email: state.respondent.email || '(none)',
    respondent_firm: state.respondent.firm || '(none)',
    wants_report: state.respondent.wantsReport ? 'Yes' : 'No',
    mailing_list: state.respondent.mailingList ? 'Yes' : 'No',
    all_answers: answersSummary,
    timestamp: new Date().toISOString()
  };
  emailjs.send(CONFIG.emailjs.serviceId, CONFIG.emailjs.templateId, params, CONFIG.emailjs.publicKey)
    .then(() => console.log('Email sent'))
    .catch(err => console.error('Email failed:', err));
}

// ===== UTIL =====
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ===== EVENT LISTENERS =====
document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  state.source = urlParams.get('src') || '';

  $('#btn-start').addEventListener('click', () => {
    state.sessionId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'sess-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
    renderQuestion(0);
  });

  $('#btn-next').addEventListener('click', advanceQuestion);
  $('#btn-back-question').addEventListener('click', goBack);
  $('#capture-form').addEventListener('submit', submitCaptureForm);
  $('#btn-skip-capture').addEventListener('click', skipCapture);

  if (CONFIG.emailjs.publicKey !== 'YOUR_PUBLIC_KEY') emailjs.init(CONFIG.emailjs.publicKey);
});
