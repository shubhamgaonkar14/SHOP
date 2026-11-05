const API = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : '/api';

document.addEventListener('DOMContentLoaded', loadEmployees);

async function loadEmployees() {
  try {
    const res = await apiFetch(`${API}/all-employees`);
    const employees = await res.json();

    if (!Array.isArray(employees) || employees.length === 0) {
      document.getElementById('employeesList').innerHTML =
        '<p style="color:#718096;text-align:center;padding:40px;">No employees added yet</p>';
      return;
    }

    let html = '';
    employees.forEach(emp => {
      html += `
        <div class="employee-card">
          <div class="employee-info">
            <h4>${emp.name || 'Unnamed'} (${emp.empId})</h4>
            <p>📱 ${emp.mobile || 'N/A'} | ✉️ ${emp.email || 'N/A'}</p>
            <p>💰 Base Salary: ₹${parseFloat(emp.baseSalary || 0).toLocaleString()}</p>
          </div>
          <div>
            <button class="btn-view" onclick="editEmployee('${emp.empId}')">✏️ Edit</button>
            <button class="btn-view" style="background:#d97706;" onclick="resetPassword('${emp.empId}')">🔑 Reset Password</button>
            <button class="btn-delete" onclick="deleteEmployee('${emp.empId}')">🗑️ Delete</button>
          </div>
        </div>`;
    });
    document.getElementById('employeesList').innerHTML = html;
  } catch (error) {
    console.error('Failed to load employees', error);
  }
}

async function addEmployee() {
  const empData = {
    empId: document.getElementById('newEmpId').value.trim(),
    name: document.getElementById('newEmpName').value.trim(),
    idNo: document.getElementById('newIdNo').value.trim(),
    mobile: document.getElementById('newMobile').value.trim(),
    email: document.getElementById('newEmail').value.trim(),
    baseSalary: document.getElementById('newSalary').value
  };

  if (!empData.empId || !empData.name) {
    alert('EMP ID and Name are required');
    return;
  }

  try {
    const res = await apiFetch(`${API}/save-employee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(empData)
    });
    const result = await res.json();

    if (!res.ok) {
      alert('Failed: ' + (result.error || 'Unknown error'));
      return;
    }

    if (result.credentials) {
      alert(
        `✅ Employee added!\n\n` +
        `🔐 LOGIN CREDENTIALS (save these — will not be shown again):\n` +
        `   Username: ${result.credentials.username}\n` +
        `   Password: ${result.credentials.password}\n\n` +
        `Give this to the employee. They can log in at /login.html.`
      );
    } else {
      alert('✅ Employee updated successfully.');
    }

    ['newEmpId', 'newEmpName', 'newIdNo', 'newMobile', 'newEmail'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('newSalary').value = '6500';

    loadEmployees();
  } catch (error) {
    console.error(error);
    alert('Network error adding employee');
  }
}

function editEmployee(empId) {
  window.location.href = `index.html?empId=${empId}`;
}

async function deleteEmployee(empId) {
  if (!confirm(`Delete employee ${empId} and all their records?`)) return;
  try {
    const res = await apiFetch(`${API}/delete-employee/${empId}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      alert('Delete failed: ' + (data.error || 'Unknown'));
      return;
    }
    loadEmployees();
  } catch (error) {
    alert('Delete failed');
  }
}

async function resetPassword(empId) {
  if (!confirm(`Reset login password for ${empId}? A new random 6-digit password will be generated.`)) return;

  try {
    const res = await apiFetch(`${API}/reset-employee-password/${empId}`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      alert('Reset failed: ' + (data.error || 'Unknown'));
      return;
    }
    alert(
      `🔑 New password for ${empId}:\n\n` +
      `   ${data.password}\n\n` +
      `Give this to the employee. They will need to log in again.`
    );
  } catch (e) {
    alert('Network error');
  }
}