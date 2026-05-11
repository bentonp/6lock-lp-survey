// ============================================================
// Google Apps Script — 6lock 2026 LP Capital Integrity Index
// Sheets logger
// ============================================================
// DEPLOYMENT INSTRUCTIONS:
//
// 1. Create a new Google Spreadsheet in the crossvine.ai Drive
//    (or whichever account owns the survey backend).
//    Name it "6lock-lp-capital-integrity-2026".
// 2. Rename the first sheet tab to "Complete Submissions"
//    (the script will create the "Partial Responses" tab on
//    first use).
// 3. Extensions > Apps Script
// 4. Replace the default Code.gs with this entire file.
// 5. Click Deploy > New deployment > Web app
//    - Description: "6lock LP Capital Integrity Index v1"
//    - Execute as: Me (your crossvine.ai account)
//    - Who has access: Anyone
//    - Click Deploy
//    - Authorize the scopes when prompted (one-time browser flow)
//    - Copy the resulting Web App URL
// 6. Send the URL back to Benton — he wires it into app.js
//    CONFIG.sheetsWebhookUrl and pushes.
//
// TO UPDATE later:
//   - Edit code in Apps Script editor
//   - Deploy > Manage deployments > Edit (pencil) >
//     Version: New version > Deploy
//   - Existing URL stays valid; no app.js change needed.
//
// PRIVACY NOTE: This handler does NOT log IP, user agent, or
// device fingerprint. Q4 (24-month fraud exposure) is the most
// sensitive question in the survey — keep this handler minimal.
// ============================================================

// Shared secret — must match CONFIG.webhookToken in app.js
var VALID_TOKEN = '6lock-lpindex-2026-aP9k4NxzE7';

var PARTIAL_SHEET_NAME = 'Partial Responses';

var PARTIAL_HEADERS = [
  'Session ID',
  'First Seen',
  'Last Updated',
  'Status',
  'Q1 - Investor Type',
  'Q2 - Movement: Safer & Easier',
  'Q3 - Fraud Tactics Familiarity',
  'Q4 - 24mo Incident Exposure',
  'Q5 - Confidence in Manager',
  'Q6 - Verification Behavior',
  'Q7 - Friction Level',
  'Q8 - Portal Count',
  'Q9 - Behavioral Response to Disclosure',
  'Q10 - Top GP Improvement',
  'Q10 - Other (specify)',
  'Q11 - Open Concern',
  'Source'
];

var COMPLETE_HEADERS = [
  'Timestamp',
  'Name',
  'Email',
  'Firm',
  'Wants Report',
  'Mailing List',
  'Q1 - Investor Type',
  'Q2 - Movement: Safer & Easier',
  'Q3 - Fraud Tactics Familiarity',
  'Q4 - 24mo Incident Exposure',
  'Q5 - Confidence in Manager',
  'Q6 - Verification Behavior',
  'Q7 - Friction Level',
  'Q8 - Portal Count',
  'Q9 - Behavioral Response to Disclosure',
  'Q10 - Top GP Improvement',
  'Q10 - Other (specify)',
  'Q11 - Open Concern',
  'Source'
];

// Strip formula-injection characters from user input
function sanitize(val) {
  if (typeof val !== 'string') return val;
  return val.replace(/^[=+\-@\t\r]+/, '');
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    if (data.token !== VALID_TOKEN) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: 'invalid token' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.isPartial === true) {
      return handlePartialSave(data);
    } else if (data.isPartial === false) {
      return handlePartialComplete(data);
    } else {
      return handleCompleteSubmission(data);
    }
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Upsert partial answers to "Partial Responses" sheet
function handlePartialSave(data) {
  var sheet = getOrCreatePartialSheet();
  var sessionId = data.sessionId;
  var now = new Date().toISOString();

  var answerValues = [];
  for (var i = 1; i <= 11; i++) {
    if (i === 10) {
      answerValues.push(sanitize(data['q10'] || ''));
      answerValues.push(sanitize(data['q10_other'] || ''));
    } else {
      answerValues.push(sanitize(data['q' + i] || ''));
    }
  }
  answerValues.push(sanitize(data.source || ''));

  // Look for existing row with this sessionId
  var lastRow = sheet.getLastRow();
  var rowIndex = -1;
  if (lastRow > 1) {
    var sessionCol = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var r = 0; r < sessionCol.length; r++) {
      if (sessionCol[r][0] === sessionId) {
        rowIndex = r + 2;
        break;
      }
    }
  }

  if (rowIndex > 0) {
    // Update existing row: Last Updated + Status + answers
    sheet.getRange(rowIndex, 3).setValue(now);
    sheet.getRange(rowIndex, 4).setValue('partial');
    sheet.getRange(rowIndex, 5, 1, answerValues.length).setValues([answerValues]);
  } else {
    sheet.appendRow([sessionId, now, now, 'partial'].concat(answerValues));
  }

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', action: 'partial_saved' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Mark a partial session as completed
function handlePartialComplete(data) {
  var sheet = getOrCreatePartialSheet();
  var sessionId = data.sessionId;

  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var sessionCol = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var r = 0; r < sessionCol.length; r++) {
      if (sessionCol[r][0] === sessionId) {
        var rowIndex = r + 2;
        sheet.getRange(rowIndex, 3).setValue(new Date().toISOString());
        sheet.getRange(rowIndex, 4).setValue('completed');
        break;
      }
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', action: 'partial_completed' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Append complete submission
function handleCompleteSubmission(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Complete Submissions') || ss.getActiveSheet();

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COMPLETE_HEADERS);
    sheet.getRange(1, 1, 1, COMPLETE_HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  var answerValues = [];
  for (var i = 1; i <= 11; i++) {
    if (i === 10) {
      answerValues.push(sanitize(data['q10'] || ''));
      answerValues.push(sanitize(data['q10_other'] || ''));
    } else {
      answerValues.push(sanitize(data['q' + i] || ''));
    }
  }

  sheet.appendRow([
    data.timestamp || new Date().toISOString(),
    sanitize(data.name || ''),
    sanitize(data.email || ''),
    sanitize(data.firm || ''),
    sanitize(data.wantsReport || ''),
    sanitize(data.mailingList || '')
  ].concat(answerValues).concat([
    sanitize(data.source || '')
  ]));

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreatePartialSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PARTIAL_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(PARTIAL_SHEET_NAME);
    sheet.appendRow(PARTIAL_HEADERS);
    sheet.getRange(1, 1, 1, PARTIAL_HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  return sheet;
}
