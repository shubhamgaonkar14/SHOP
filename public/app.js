const API = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : '/api';

// Predefined bonus templates
const BONUS_TEMPLATES = [
  { name: 'Attendance Appreciation Bonus', amount: '', comment: 'महिन्यात ३ दिवसांपेक्षा कमी रजा घेतल्यामुळे विशेष बोनस देण्यात आला आहे.' },
  { name: 'Sales Performance Bonus', amount: '', comment: 'उत्कृष्ट विक्री कामगिरीमुळे बोनस देण्यात आला आहे.' },
  { name: 'Festival Bonus', amount: '', comment: 'सणानिमित्त बोनस देण्यात आला आहे.' },
  { name: 'Performance Incentive', amount: '', comment: 'उत्कृष्ट कामगिरीबद्दल प्रोत्साहन भत्ता.' },
  { name: 'Overtime Pay', amount: '', comment: 'अतिरिक्त काम केल्याबद्दल.' }
];

// Predefined note templates
const NOTE_TEMPLATES = [
  { text: 'The half day taken on the 12th has been treated as a full working day. (१२ तारखेला घेतलेला अर्धा दिवस पूर्ण कामकाजाचा दिवस म्हणून ग्राह्य धरण्यात आला आहे.)', id: 'halfday_note' },
  { text: 'Deductions are calculated as per company policy. (कपात कंपनीच्या धोरणानुसार मोजली जाते.)', id: 'deduction_note' }
];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setDefaultMonth();
  loadAllEmployees();
  initNoteTemplates();
});

function setDefaultMonth() {
  const today = new Date();
  let year = today.getFullYear();
  let month = today.getMonth();
  if (month === 0) { month = 12; year--; }
  document.getElementById('monthPicker').value = `${year}-${String(month).padStart(2, '0')}`;
}

function initNoteTemplates() {
  const noteTemplatesDiv = document.getElementById('noteTemplates');
  if (!noteTemplatesDiv) return;

  let html = '<div class="no-print" style="font-size:11px;color:#718096;margin-top:8px;"><strong>📋 Quick Notes:</strong></div>';
  NOTE_TEMPLATES.forEach(template => {
    html += `
      <label class="no-print" style="display:flex;align-items:flex-start;gap:8px;margin-top:6px;cursor:pointer;font-size:11px;">
        <input type="checkbox" 
               class="note-template-check" 
               data-note="${encodeURIComponent(template.text)}"
               onchange="toggleNoteTemplate(this)"
               style="margin-top:3px;accent-color:#2c5282;">
        <span style="color:#4a5568;">${template.text.substring(0, 80)}...</span>
      </label>`;
  });
  noteTemplatesDiv.innerHTML = html;
}

function toggleNoteTemplate(checkbox) {
  const noteContent = document.getElementById('manualNote');
  const templateText = decodeURIComponent(checkbox.dataset.note);

  if (checkbox.checked) {
    if (noteContent.innerHTML === '• ' || noteContent.innerHTML === '') {
      noteContent.innerHTML = '• ' + templateText;
    } else {
      noteContent.innerHTML += '<br>• ' + templateText;
    }
  } else {
    const currentText = noteContent.innerHTML;
    const escapedTemplate = templateText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('<br>?• ' + escapedTemplate, 'g');
    noteContent.innerHTML = currentText.replace(regex, '');
    if (noteContent.innerHTML.trim() === '' || noteContent.innerHTML === '<br>') {
      noteContent.innerHTML = '• ';
    }
  }
}

async function loadAllEmployees() {
  try {
    const user = window.__currentUser;

    // Employee: only load their own record (admin endpoint not accessible)
    if (user && user.role === 'employee') {
      const res = await apiFetch(`${API}/get-employee/${user.empId}`);
      if (!res.ok) return;
      const emp = await res.json();
      if (!emp) return;
      const dropdown = document.getElementById('employeeDropdown');
      dropdown.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = emp.empId;
      opt.textContent = `${emp.empId} - ${emp.name || 'Unnamed'}`;
      dropdown.appendChild(opt);
      dropdown.value = emp.empId;
      dropdown.disabled = true;
      await onEmployeeSelect();
      return;
    }

    // Admin: full list
    const res = await apiFetch(`${API}/all-employees`);
    const employees = await res.json();
    const dropdown = document.getElementById('employeeDropdown');
    dropdown.innerHTML = '<option value="">-- Select Employee --</option>';
    (employees || []).forEach(emp => {
      const opt = document.createElement('option');
      opt.value = emp.empId;
      opt.textContent = `${emp.empId} - ${emp.name || 'Unnamed'}`;
      dropdown.appendChild(opt);
    });
  } catch (error) {
    showMessage('Failed to load employees', 'error');
  }
}

async function onEmployeeSelect() {
  const empId = document.getElementById('employeeDropdown').value;
  if (!empId) return;

  try {
    const res = await apiFetch(`${API}/get-employee/${empId}`);
    const emp = await res.json();
    if (emp) {
      document.getElementById('empId').value = emp.empId || '';
      document.getElementById('empName').value = emp.name || '';
      updateFilename();
      document.getElementById('idNo').value = emp.idNo || '';
      document.getElementById('mobileNo').value = emp.mobile || '';
      document.getElementById('emailId').value = emp.email || '';
      document.getElementById('baseSalary').value = emp.baseSalary || '6500';
      generateSlip();
      updateFilename();
    }
  } catch (error) {
    showMessage('Failed to load employee', 'error');
  }
}

async function updateEmployee() {
  const empId = document.getElementById('empId').value;
  if (!empId) return showMessage('Enter EMP ID first', 'error');
  if (!confirm(`Update details for ${empId}?`)) return;

  const empData = {
    empId,
    name: document.getElementById('empName').value,
    idNo: document.getElementById('idNo').value,
    mobile: document.getElementById('mobileNo').value,
    email: document.getElementById('emailId').value,
    baseSalary: document.getElementById('baseSalary').value,
    lastUpdated: new Date().toISOString()
  };

  try {
    const res = await apiFetch(`${API}/save-employee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(empData)
    });
    if (res.ok) {
      showMessage('Employee updated!', 'success');
      loadAllEmployees();
    }
  } catch (error) {
    showMessage('Update failed', 'error');
  }
}

function generateSlip() {
  const empId = document.getElementById('empId').value || 'EMP001';
  const name = document.getElementById('empName').value || '—';
  const idNo = document.getElementById('idNo').value || '—';
  const mobile = document.getElementById('mobileNo').value || '—';
  const email = document.getElementById('emailId').value || '—';
  const monthInput = document.getElementById('monthPicker').value;
  const monthDisplay = formatMonth(monthInput);

  document.getElementById('detailsBlock').innerHTML = `
    <div class="details-grid">
      <div><strong>🆔 EMP ID:</strong> ${empId}</div>
      <div><strong>👤 Name:</strong> ${name}</div>
      <div><strong>🪪 ID:</strong> ${idNo}</div>
      <div><strong>📱 Mobile:</strong> ${mobile}</div>
      <div><strong>✉️ Email:</strong> ${email}</div>
      <div><strong>📅 Month:</strong> ${monthDisplay}</div>
    </div>
  `;

  if (!monthInput) return;

  const [year, monthNum] = monthInput.split('-');
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const firstDay = new Date(year, monthNum - 1, 1).getDay();

  const tbody = document.querySelector('#calendarTable tbody');
  tbody.innerHTML = '';
  let dateCounter = 1;

  for (let row = 0; row < 6; row++) {
    const tr = document.createElement('tr');
    for (let col = 0; col < 7; col++) {
      const td = document.createElement('td');
      if ((row === 0 && col < firstDay) || dateCounter > daysInMonth) {
        td.innerHTML = '';
      } else {
        td.classList.add('present');
        td.innerHTML = `
          <b>${dateCounter}</b>
          <select onchange="updateCellColor(this); autoCalculate();">
            <option value="Present" selected>Present</option>
            <option value="HalfDay">Half Day</option>
            <option value="Absent">Absent</option>
            <option value="Paid">Paid Leave</option>
            <option value="NA">NA</option>
          </select>
          <span class="print-status">P</span>`;
        dateCounter++;
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
    if (dateCounter > daysInMonth) break;
  }

  rebuildSummary();
  updateFilename();
}

function updateCellColor(sel) {
  const cell = sel.closest('td');
  cell.className = '';
  const v = sel.value.toLowerCase();
  const printStatus = cell.querySelector('.print-status');

  if (v === 'present') {
    cell.classList.add('present');
    if (printStatus) printStatus.textContent = 'P';
  } else if (v === 'halfday') {
    cell.classList.add('halfday');
    if (printStatus) printStatus.textContent = 'HD';
  } else if (v === 'absent') {
    cell.classList.add('absent');
    if (printStatus) printStatus.textContent = 'A';
  } else if (v === 'paid') {
    cell.classList.add('paid');
    if (printStatus) printStatus.textContent = 'PL';
  } else if (v === 'na') {
    cell.classList.add('na');
    if (printStatus) printStatus.textContent = 'NA';
  }
}

function autoCalculate() {
  collectBonusData();
  rebuildSummary();
}

function handleBonusToggle() {
  if (!document.getElementById('enableBonusCheckbox').checked) collectBonusData();
  rebuildSummary();
}

let savedBonusData = [];

function collectBonusData() {
  savedBonusData = [];
  document.querySelectorAll('#bonusEntries .bonus-entry').forEach(e => {
    savedBonusData.push({
      name: e.querySelector('.bonus-name')?.value || '',
      amount: e.querySelector('.bonus-amount')?.value || '0',
      comment: e.querySelector('.bonus-comment')?.value || ''
    });
  });
}

function quickAddBonus(templateIndex) {
  const template = BONUS_TEMPLATES[templateIndex];
  document.getElementById('enableBonusCheckbox').checked = true;
  handleBonusToggle();

  setTimeout(() => {
    addBonusRowWithData(template.name, template.amount, template.comment);
    collectBonusData();
    rebuildSummary();
  }, 100);
}

function rebuildSummary() {
  const baseSalary = parseFloat(document.getElementById('baseSalary').value) || 6500;
  const monthInput = document.getElementById('monthPicker').value;
  const daysInMonth = getDaysInMonth(monthInput);

  let p = 0, hd = 0, a = 0, pl = 0, na = 0;
  document.querySelectorAll('#calendarTable select').forEach(s => {
    if (s.value === 'Present') p++;
    else if (s.value === 'HalfDay') hd++;
    else if (s.value === 'Absent') a++;
    else if (s.value === 'Paid') pl++;
    else if (s.value === 'NA') na++;
  });

  const dailyRate = baseSalary / daysInMonth;
  const halfDayDeduction = hd * dailyRate * 0.5;
  const fullDeduction = (a + na) * dailyRate;
  const totalDeduction = fullDeduction + halfDayDeduction;
  const bonusOn = document.getElementById('enableBonusCheckbox').checked;

  const totalDeductionDays = a + na + (hd * 0.5);
  const deductionDaysDisplay = totalDeductionDays % 1 === 0 ? totalDeductionDays.toString() : totalDeductionDays.toFixed(1);

  let html = `
    <div class="row-flex"><span>✅ Present Days</span><span>${p}</span></div>
    <div class="row-flex"><span>🌓 Half Days</span><span style="color:#e53e3e;font-weight:700;">${hd}</span></div>
    <div class="row-flex"><span>🟡 Paid Leave</span><span>${pl}</span></div>
    <div class="row-flex"><span>⛔ NA</span><span style="color:#e53e3e;font-weight:700;">${na}</span></div>
    <div class="row-flex"><span>❌ Unpaid Absent</span><span style="color:#e53e3e;font-weight:700;">${a}</span></div>
    <hr>
    <div class="row-flex"><span>💼 Base Salary</span><span>₹${baseSalary.toLocaleString()}</span></div>
    <div class="row-flex"><span>📆 Working Days</span><span>${daysInMonth}</span></div>
    <div class="row-flex"><span>📉 Deduction (${deductionDaysDisplay} days)</span><span style="color:#e53e3e;font-weight:700;">- ₹${totalDeduction.toFixed(2)}</span></div>
  `;

  if (bonusOn) {
    html += `
      <div class="bonus-dynamic-box no-print">
        <h4>✨ Bonus / Incentives</h4>
        <div class="no-print" style="margin-bottom:10px;padding:8px;background:#f0fff4;border-radius:6px;border:1px solid #c6f6d5;">
          <small style="color:#276749;font-weight:600;">📌 Quick Add Bonus:</small>
          <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;">
            ${BONUS_TEMPLATES.map((t, i) => `
              <button onclick="quickAddBonus(${i})" style="background:#38a169;color:white;border:none;padding:5px 10px;border-radius:4px;font-size:10px;cursor:pointer;white-space:nowrap;" title="${t.comment}">
                ➕ ${t.name}
              </button>
            `).join('')}
          </div>
        </div>
        <div id="bonusEntries"></div>
        <button onclick="addBonusRow()" class="add-bonus-btn">+ Add Custom Bonus</button>
      </div>`;
  }

  document.getElementById('summaryContainer').innerHTML = html;

  if (bonusOn && savedBonusData.length > 0) {
    savedBonusData.forEach(d => addBonusRowWithData(d.name, d.amount, d.comment));
  }

  updateFinalSalary(baseSalary, totalDeduction);
}

function addBonusRow() { addBonusRowWithData('', '0', ''); }

function addBonusRowWithData(name = '', amount = '0', comment = '') {
  const be = document.getElementById('bonusEntries');
  if (!be) return;
  const div = document.createElement('div');
  div.className = 'bonus-entry';
  div.innerHTML = `
    <input type="text" placeholder="Bonus name" class="bonus-name" value="${escapeHtml(name)}">
    <input type="number" value="${amount}" class="bonus-amount" onchange="onBonusChange()" placeholder="Amount">
    <input type="text" placeholder="Comment" class="bonus-comment" value="${escapeHtml(comment)}">
    <button onclick="this.closest('.bonus-entry').remove();onBonusChange();" style="background:#e53e3e;">✕</button>`;
  be.appendChild(div);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function onBonusChange() { collectBonusData(); autoCalculate(); }

function calculateSalary() { collectBonusData(); rebuildSummary(); }

function updateFinalSalary(baseSalary, deduction) {
  const bonusOn = document.getElementById('enableBonusCheckbox').checked;
  let totalBonus = 0;
  let details = [];

  if (bonusOn) {
    document.querySelectorAll('.bonus-amount').forEach((inp, i) => {
      const amt = parseFloat(inp.value) || 0;
      if (amt > 0) {
        totalBonus += amt;
        details.push({
          name: document.querySelectorAll('.bonus-name')[i]?.value || 'Bonus',
          amount: amt,
          comment: document.querySelectorAll('.bonus-comment')[i]?.value || ''
        });
      }
    });
  }

  const final = baseSalary - deduction + totalBonus;

  let finalHTML = '';

  if (bonusOn && details.length > 0) {
    finalHTML += '<div class="bonus-breakdown-print"><div class="bonus-title">✨ Bonus / Incentives</div>';
    details.forEach(b => {
      finalHTML += `<div class="bonus-row"><span class="bonus-name-side">➕ ${b.name} ${b.comment ? `<span style="color:#718096;font-size:11px;">(${b.comment})</span>` : ''}</span><span class="bonus-amount-side">+ ₹${b.amount.toFixed(2)}</span></div>`;
    });
    finalHTML += '</div>';
  }

  finalHTML += `
    <div class="final-box">
      <span>💰 Net Payable Salary</span>
      <span class="final-amount">₹${final.toFixed(2)}</span>
    </div>`;

  document.getElementById('finalSection').innerHTML = finalHTML;
}

async function saveCurrentSlip() {
  const empId = document.getElementById('empId').value;
  const month = document.getElementById('monthPicker').value;

  if (!empId || !month) return showMessage('Enter EMP ID and select month', 'error');

  const calendarData = [];
  document.querySelectorAll('#calendarTable td').forEach(td => {
    const select = td.querySelector('select');
    const dateSpan = td.querySelector('b');
    if (select && dateSpan) {
      calendarData.push({ date: dateSpan.textContent, status: select.value });
    }
  });

  let bonusData = [];
  if (document.getElementById('enableBonusCheckbox').checked) {
    document.querySelectorAll('#bonusEntries .bonus-entry').forEach(entry => {
      bonusData.push({
        name: entry.querySelector('.bonus-name')?.value || '',
        amount: entry.querySelector('.bonus-amount')?.value || '0',
        comment: entry.querySelector('.bonus-comment')?.value || ''
      });
    });
  }

  const slipData = {
    empId,
    employeeName: document.getElementById('empName').value,
    month,
    baseSalary: document.getElementById('baseSalary').value,
    calendar: calendarData,
    bonusEnabled: document.getElementById('enableBonusCheckbox').checked,
    bonusData,
    notes: document.getElementById('manualNote').innerHTML
  };

  try {
    const res = await apiFetch(`${API}/save-slip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empId, month, slipData })
    });
    const result = await res.json();
    if (res.ok) {
      showMessage(`Slip saved! Version: ${result.version}`, 'success');
    } else {
      showMessage(result.error || 'Save failed', 'error');
    }
  } catch (error) {
    showMessage('Save failed', 'error');
  }
}

async function loadSavedSlip() {
  const empId = document.getElementById('empId').value;
  const month = document.getElementById('monthPicker').value;

  if (!empId || !month) return showMessage('Enter EMP ID and select month', 'error');

  try {
    const res = await apiFetch(`${API}/get-slip/${empId}/${month}`);
    if (!res.ok) return showMessage('No saved slip found', 'error');

    const slip = await res.json();

    document.getElementById('baseSalary').value = slip.baseSalary || '6500';
    document.getElementById('manualNote').innerHTML = slip.notes || '';

    if (slip.calendar && slip.calendar.length > 0) {
      const selects = document.querySelectorAll('#calendarTable select');
      slip.calendar.forEach((day, i) => {
        if (selects[i]) {
          selects[i].value = day.status;
          updateCellColor(selects[i]);
        }
      });
    }

    document.getElementById('enableBonusCheckbox').checked = slip.bonusEnabled || false;
    handleBonusToggle();

    if (slip.bonusData && slip.bonusData.length > 0) {
      const bonusEntries = document.getElementById('bonusEntries');
      if (bonusEntries) {
        bonusEntries.innerHTML = '';
        slip.bonusData.forEach(b => addBonusRowWithData(b.name, b.amount, b.comment));
      }
    }

    calculateSalary();
    showMessage('Slip loaded successfully!', 'success');
  } catch (error) {
    showMessage('Load failed', 'error');
  }
}

async function deleteCurrentSlip() {
  const empId = document.getElementById('empId').value;
  const month = document.getElementById('monthPicker').value;

  if (!empId || !month) return showMessage('Enter EMP ID and select month', 'error');
  if (!confirm(`Delete slip for ${empId} - ${month}? This removes ALL versions!`)) return;

  try {
    const res = await apiFetch(`${API}/delete-slip/${empId}/${month}`, { method: 'DELETE' });
    if (res.ok) {
      showMessage('Slip deleted!', 'success');
      generateSlip();
    }
  } catch (error) {
    showMessage('Delete failed', 'error');
  }
}

function formatMonth(mv) {
  if (!mv) return '—';
  const [y, m] = mv.split('-');
  return new Date(y, m - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function getDaysInMonth(monthInput) {
  if (!monthInput) return 30;
  const [year, month] = monthInput.split('-');
  return new Date(year, month, 0).getDate();
}

function showMessage(message, type = 'success') {
  const msgDiv = document.getElementById('statusMessage');
  msgDiv.textContent = message;
  msgDiv.className = `status-message status-${type}`;
  setTimeout(() => { msgDiv.className = 'status-message'; }, 3000);
}

function updateFilename() {
  const empName = document.getElementById('empName').value || 'employee';
  const monthInput = document.getElementById('monthPicker').value;

  const formattedName = empName.toLowerCase().replace(/\s+/g, '_');

  let monthName = '';
  if (monthInput) {
    const [year, monthNum] = monthInput.split('-');
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    monthName = months[parseInt(monthNum) - 1] + '_' + year;
  }

  const filename = `${formattedName}_${monthName}_salary_slip`;
  document.getElementById('filenameText').textContent = filename;
}

function copyFilename() {
  const filename = document.getElementById('filenameText').textContent;
  navigator.clipboard.writeText(filename).then(() => {
    const copyMsg = document.getElementById('copyMsg');
    copyMsg.style.display = 'inline';
    setTimeout(() => { copyMsg.style.display = 'none'; }, 2000);
  });
}

// ============ PAINT MODE (Bulk Fill Attendance) ============
// Click a status button, then click or drag over calendar days to apply it.

let paintStatus = null;
let isPainting = false;

function initPaintMode() {
  const toolbar = document.getElementById('paintToolbar');
  if (!toolbar) return;

  const buttons = toolbar.querySelectorAll('.paint-btn');
  const hint = document.getElementById('paintHint');

  // Click a status button → toggle paint mode
  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const status = btn.dataset.status;

      if (paintStatus === status) {
        // Turn off
        paintStatus = null;
        buttons.forEach(b => b.classList.remove('active'));
        document.body.classList.remove('paint-mode-active');
        if (hint) hint.textContent = 'Click a status, then drag over calendar days';
      } else {
        paintStatus = status;
        buttons.forEach(b => b.classList.toggle('active', b === btn));
        document.body.classList.add('paint-mode-active');
        if (hint) hint.textContent = `Painting: ${btn.textContent.trim()} — drag over days`;
      }
    });
  });

  const table = document.getElementById('calendarTable');
  if (!table) return;

  // Apply paint to a specific <td>
  const applyToCell = (td) => {
    if (!paintStatus || !td) return;
    const sel = td.querySelector('select');
    if (!sel) return; // empty cell
    if (sel.value === paintStatus) return; // already correct → skip
    sel.value = paintStatus;
    updateCellColor(sel);
  };

  // Mouse down: start painting
  table.addEventListener('mousedown', (e) => {
    if (!paintStatus) return;
    const td = e.target.closest('td');
    if (!td) return;
    e.preventDefault(); // stop text selection during drag
    isPainting = true;
    applyToCell(td);
  });

  // Mouse enter on cells while dragging
  table.addEventListener('mouseover', (e) => {
    if (!isPainting || !paintStatus) return;
    const td = e.target.closest('td');
    if (!td) return;
    applyToCell(td);
  });

  // Mouse up anywhere: stop painting & recalc once
  document.addEventListener('mouseup', () => {
    if (!isPainting) return;
    isPainting = false;
    autoCalculate(); // single recalc after the whole drag
  });

  // Touch support (mobile): tap-to-apply one cell at a time
  table.addEventListener('touchstart', (e) => {
    if (!paintStatus) return;
    const touch = e.touches[0];
    const td = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('td');
    if (!td) return;
    applyToCell(td);
    autoCalculate();
  }, { passive: true });
}

// Run once the DOM is ready
document.addEventListener('DOMContentLoaded', initPaintMode);

window.onload = () => generateSlip();