/* ============================================
   LP Sentiment Survey - 6lock
   Anonymous LP perception capture for the PE
   Capital Trust Report. Sister app to the
   PE Security Index.
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
  // Google Apps Script web app URL (deploy a NEW Apps Script for the LP survey - do NOT reuse Security Index endpoint)
  sheetsWebhookUrl: 'YOUR_LP_SURVEY_WEBHOOK_URL',
  // Shared secret - must match VALID_TOKEN in google-apps-script.js for the LP survey
  webhookToken: '6lock-lpsurvey-2026-CHANGEME'
};

// ===== QUESTIONS DATA =====
// Source: questionnaire/lp-sentiment-framework.md
// Question types: 'single' | 'multi' | 'rating' | 'binary' | 'open'
const QUESTIONS = [
  {
    id: 1,
    section: 'Respondent Context',
    type: 'single',
    text: 'Which best describes your role?',
    answers: [
      'Family Office',
      'Institutional LP (Endowment / Pension / Foundation)',
      'Wealth or Alternatives team',
      'Finance or Operations',
      'Other'
    ]
  },
  {
    id: 2,
    section: 'Respondent Context',
    type: 'single',
    text: 'How many PE funds do you actively invest in?',
    answers: ['1-3', '4-10', '11-25', '25+']
  },
  {
    id: 3,
    section: 'Capital Call Experience',
    type: 'rating',
    text: 'Overall, how would you rate your capital call experience today?',
    scale: 5,
    labels: ['Very poor', 'Excellent']
  },
  {
    id: 4,
    section: 'Capital Call Experience',
    type: 'multi',
    max: 3,
    text: 'What frustrates you most during capital calls?',
    hint: 'Select up to 3.',
    answers: [
      'Unclear instructions',
      'Short notice / urgency',
      'Manual processes',
      'Email-based coordination',
      'Security concerns',
      'Multiple portals or logins',
      'Lack of confirmation',
      'None — generally smooth'
    ]
  },
  {
    id: 5,
    section: 'Security & Trust',
    type: 'single',
    text: 'How concerned are you about fraud or misdirected funds during capital events?',
    answers: ['Not concerned', 'Slightly concerned', 'Moderately concerned', 'Very concerned']
  },
  {
    id: 6,
    section: 'Security & Trust',
    type: 'binary',
    text: 'Have you ever delayed or double-checked a capital call because of security concerns?',
    answers: ['Yes', 'No'],
    isHeadline: true
  },
  {
    id: 7,
    section: 'Security & Trust',
    type: 'multi',
    max: null,
    text: 'What signals increase your trust in a PE firm\'s transaction process?',
    hint: 'Select all that apply.',
    answers: [
      'Verified sender identity',
      'Secure portal vs. email',
      'Clear audit trail',
      'Multi-step confirmation',
      'Bank-level controls',
      'Consistent process across funds'
    ]
  },
  {
    id: 8,
    section: 'Responsiveness',
    type: 'single',
    text: 'How quickly do you typically respond to a capital call once received?',
    answers: ['Same day', '1-2 days', '3-5 days', 'Longer than 5 days']
  },
  {
    id: 9,
    section: 'Future Expectations',
    type: 'single',
    text: 'Compared to 3 years ago, your expectations for secure transaction processes are:',
    answers: ['Much higher', 'Somewhat higher', 'About the same', 'Lower']
  },
  {
    id: 10,
    section: 'Open',
    type: 'open',
    text: 'What single change would most improve your capital-event experience?',
    hint: 'Optional. One sentence is plenty. Anonymous quotes from this question may appear in the published report.'
  }
];

// ===== STATE =====
const state = {
  currentQuestion: 0,
  answers: [],          // sparse array; each entry varies by question type
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

  // Hint (used by multi-select and open)
  const hint = $('#question-hint');
  if (q.hint) {
    hint.textContent = q.hint;
    hint.hidden = false;
  } else {
    hint.hidden = true;
  }

  const answersContainer = $('#question-answers');
  const textareaEl = $('#question-textarea');
  answersContainer.innerHTML = '';
  answersContainer.hidden = false;
  textareaEl.hidden = true;
  textareaEl.value = '';

  // Reset next button
  $('#btn-next').hidden = true;

  // Render based on type
  if (q.type === 'single' || q.type === 'binary') renderSingleSelect(q, index);
  else if (q.type === 'multi') renderMultiSelect(q, index);
  else if (q.type === 'rating') renderRating(q, index);
  else if (q.type === 'open') renderOpen(q, index);

  // Restore prior answer (back-nav)
  restorePriorAnswer(q, index);

  showScreen('screen-question');
}

// ===== RENDERERS =====
function renderSingleSelect(q, qIndex) {
  const container = $('#question-answers');
  q.answers.forEach((text, aIndex) => {
    const card = document.createElement('div');
    card.className = 'answer-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.innerHTML = '<div class="answer-card__radio"></div><span class="answer-card__text">' + escapeHtml(text) + '</span>';
    const handler = () => selectSingle(qIndex, aIndex);
    card.addEventListener('click', handler);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } });
    container.appendChild(card);
  });
}

function renderMultiSelect(q, qIndex) {
  const container = $('#question-answers');

  // Counter pill
  const counter = document.createElement('div');
  counter.className = 'multi-counter';
  counter.id = 'multi-counter-' + qIndex;
  counter.innerHTML = '<span><strong>0</strong>' + (q.max ? ' of ' + q.max : '') + ' selected</span>';
  container.appendChild(counter);

  q.answers.forEach((text, aIndex) => {
    const card = document.createElement('div');
    card.className = 'answer-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.dataset.aIndex = aIndex;
    card.innerHTML = '<div class="answer-card__check"></div><span class="answer-card__text">' + escapeHtml(text) + '</span>';
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

function renderOpen(q, qIndex) {
  const answersContainer = $('#question-answers');
  answersContainer.hidden = true;
  const textareaEl = $('#question-textarea');
  textareaEl.hidden = false;
  textareaEl.placeholder = q.hint ? 'Type your response (optional)' : 'Type your response';
  // Open question always shows Next immediately (it's optional)
  $('#btn-next').hidden = false;
  // Live update of state on input
  textareaEl.addEventListener('input', () => {
    state.answers[qIndex] = { questionId: q.id, type: 'open', text: textareaEl.value };
  });
}

function restorePriorAnswer(q, index) {
  const prior = state.answers[index];
  if (!prior) return;
  if (q.type === 'single' || q.type === 'binary') {
    const cards = $$('#question-answers .answer-card');
    if (cards[prior.selectedIndex]) cards[prior.selectedIndex].classList.add('selected');
    showInlineTooltip(q);
  } else if (q.type === 'multi') {
    const cards = $$('#question-answers .answer-card');
    (prior.selectedIndices || []).forEach(idx => { if (cards[idx]) cards[idx].classList.add('selected'); });
    updateMultiCounter(index);
    if ((prior.selectedIndices || []).length > 0) {
      showInlineTooltip(q);
    }
  } else if (q.type === 'rating') {
    const btns = $$('.rating-btn');
    btns.forEach(b => { if (parseInt(b.dataset.value, 10) === prior.value) b.classList.add('selected'); });
    showInlineTooltip(q);
  } else if (q.type === 'open') {
    $('#question-textarea').value = prior.text || '';
  }
}

// ===== ANSWER HANDLERS =====
function selectSingle(qIndex, aIndex) {
  const q = QUESTIONS[qIndex];
  $$('#question-answers .answer-card').forEach((card, i) => {
    card.classList.toggle('selected', i === aIndex);
  });
  state.answers[qIndex] = {
    questionId: q.id,
    type: q.type,
    selectedIndex: aIndex,
    selectedText: q.answers[aIndex]
  };
  showInlineTooltip(q);
}

function toggleMulti(qIndex, aIndex) {
  const q = QUESTIONS[qIndex];
  let prior = state.answers[qIndex];
  if (!prior || prior.type !== 'multi') {
    prior = { questionId: q.id, type: 'multi', selectedIndices: [] };
    state.answers[qIndex] = prior;
  }
  const set = new Set(prior.selectedIndices);
  const cards = $$('#question-answers .answer-card');

  if (set.has(aIndex)) {
    set.delete(aIndex);
  } else {
    if (q.max && set.size >= q.max) return; // soft cap
    set.add(aIndex);
  }
  prior.selectedIndices = Array.from(set);
  prior.selectedTexts = prior.selectedIndices.map(i => q.answers[i]);

  // Update visual state
  cards.forEach((card) => {
    const idx = parseInt(card.dataset.aIndex, 10);
    if (Number.isNaN(idx)) return;
    card.classList.toggle('selected', set.has(idx));
    if (q.max) card.classList.toggle('disabled', !set.has(idx) && set.size >= q.max);
  });

  updateMultiCounter(qIndex);

  if (set.size > 0) {
    showInlineTooltip(q);
  } else {
    $('#btn-next').hidden = true;
  }
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
  showInlineTooltip(q);
}

function showInlineTooltip(question) {
  // Tooltips removed per user direction. Function retained as the "show next button" hook.
  $('#btn-next').hidden = false;
}

// ===== ADVANCE / BACK =====
function advanceQuestion() {
  savePartialToSheets();
  const next = state.currentQuestion + 1;
  if (next < QUESTIONS.length) {
    renderQuestion(next);
  } else {
    $('#progress-fill').style.width = '100%';
    setTimeout(showThanksScreen, 300);
  }
}

function goBack() {
  if (state.currentQuestion > 0) renderQuestion(state.currentQuestion - 1);
  else showScreen('screen-landing');
}

// ===== THANKS / CAPTURE =====
function showThanksScreen() { showScreen('screen-thanks'); }

function submitCaptureForm(e) {
  e.preventDefault();
  if ($('#field-website').value) return; // honeypot

  const name = ($('#field-name').value || '').trim();
  const email = ($('#field-email').value || '').trim();
  const mailingList = $('#field-mailinglist').checked;

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    $('#field-email').classList.add('error');
    return;
  }
  $('#field-email').classList.remove('error');

  state.respondent = { name, email, mailingList, wantsReport: !!email };
  finalizeSubmission();
}

function skipCapture() {
  state.respondent = { name: '', email: '', mailingList: false, wantsReport: false };
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

// ===== SHEETS - PARTIAL SAVE =====
function savePartialToSheets() {
  if (CONFIG.sheetsWebhookUrl === 'YOUR_LP_SURVEY_WEBHOOK_URL' || !state.sessionId) return;
  const payload = buildAnswerPayload(true);
  fetch(CONFIG.sheetsWebhookUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(err => console.error('Partial save failed:', err));
}

// ===== SHEETS - COMPLETE SUBMISSION =====
function submitToSheets() {
  if (CONFIG.sheetsWebhookUrl === 'YOUR_LP_SURVEY_WEBHOOK_URL') {
    console.log('Sheets webhook not configured. Payload:', buildAnswerPayload(false));
    return;
  }
  const payload = buildAnswerPayload(false);
  fetch(CONFIG.sheetsWebhookUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
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
    payload.mailingList = state.respondent.mailingList ? 'Yes' : 'No';
    payload.wantsReport = state.respondent.wantsReport ? 'Yes' : 'No';
  }
  QUESTIONS.forEach((q, i) => {
    const a = state.answers[i];
    if (!a) {
      payload['q' + q.id] = '';
      return;
    }
    if (q.type === 'single' || q.type === 'binary') payload['q' + q.id] = a.selectedText || '';
    else if (q.type === 'multi') payload['q' + q.id] = (a.selectedTexts || []).join(' | ');
    else if (q.type === 'rating') payload['q' + q.id] = a.value != null ? String(a.value) : '';
    else if (q.type === 'open') payload['q' + q.id] = a.text || '';
  });
  return payload;
}

// ===== EMAIL NOTIFICATION =====
function sendNotificationEmail() {
  const grade = '(LP sentiment - no score)';
  const answersSummary = QUESTIONS.map((q, i) => {
    const a = state.answers[i];
    let val = '(no answer)';
    if (a) {
      if (q.type === 'multi') val = (a.selectedTexts || []).join(', ');
      else if (q.type === 'rating') val = String(a.value);
      else if (q.type === 'open') val = a.text || '(blank)';
      else val = a.selectedText;
    }
    return 'Q' + (i + 1) + ': ' + q.text + '\nA: ' + val;
  }).join('\n\n');

  const params = {
    respondent_name: state.respondent.name || '(anonymous)',
    respondent_email: state.respondent.email || '(none)',
    wants_report: state.respondent.wantsReport ? 'Yes' : 'No',
    mailing_list: state.respondent.mailingList ? 'Yes' : 'No',
    all_answers: answersSummary,
    timestamp: new Date().toISOString(),
    grade: grade
  };

  emailjs.send(CONFIG.emailjs.serviceId, CONFIG.emailjs.templateId, params, CONFIG.emailjs.publicKey)
    .then(() => console.log('Email sent'))
    .catch(err => console.error('Email failed:', err));
}

// ===== UTIL =====
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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

  if (CONFIG.emailjs.publicKey !== 'YOUR_PUBLIC_KEY') {
    emailjs.init(CONFIG.emailjs.publicKey);
  }
});
