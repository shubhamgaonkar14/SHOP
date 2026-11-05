const API = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : '/api';

let selectedVersions = new Set();

document.addEventListener('DOMContentLoaded', () => {
    loadEmployees();
    
    // Check URL parameters for direct navigation
    const urlParams = new URLSearchParams(window.location.search);
    const urlEmpId = urlParams.get('empId');
    const urlMonth = urlParams.get('month');
    
    if (urlEmpId && urlMonth) {
        // Load employees first, then set values
        setTimeout(() => {
            document.getElementById('empSelect').value = urlEmpId;
            loadEmployeeMonths().then(() => {
                setTimeout(() => {
                    document.getElementById('monthSelect').value = urlMonth;
                    loadVersions();
                }, 500);
            });
        }, 500);
    }
    
    document.getElementById('empSelect').addEventListener('change', loadEmployeeMonths);
    document.getElementById('monthSelect').addEventListener('change', loadVersions);
});

// Load employees into dropdown
async function loadEmployees() {
    try {
        const res = await fetch(`${API}/all-employees`);
        const employees = await res.json();
        const select = document.getElementById('empSelect');
        select.innerHTML = '<option value="">Select Employee</option>';
        
        if (employees && employees.length > 0) {
            employees.forEach(emp => {
                select.innerHTML += `<option value="${emp.empId}">${emp.empId} - ${emp.name || 'Unnamed'}</option>`;
            });
        }
    } catch (error) {
        console.error('Failed to load employees:', error);
        showErrorMessage('Failed to load employees. Please check if server is running.');
    }
}

// Load available months for selected employee
async function loadEmployeeMonths() {
    const empId = document.getElementById('empSelect').value;
    const monthSelect = document.getElementById('monthSelect');
    const contentDiv = document.getElementById('versionsContent');
    
    if (!empId) {
        monthSelect.innerHTML = '<option value="">Select Month</option>';
        contentDiv.innerHTML = '<p style="text-align:center;color:#718096;padding:40px;">👆 Select an employee to view versions</p>';
        return;
    }
    
    monthSelect.innerHTML = '<option value="">Loading months...</option>';
    contentDiv.innerHTML = '<p style="text-align:center;padding:20px;">⏳ Loading available months...</p>';
    
    try {
        const res = await fetch(`${API}/get-employee-months/${empId}`);
        const months = await res.json();
        
        monthSelect.innerHTML = '<option value="">Select Month</option>';
        
        if (months && months.length > 0) {
            months.forEach(month => {
                monthSelect.innerHTML += `<option value="${month}">${formatMonthDisplay(month)}</option>`;
            });
            contentDiv.innerHTML = '<p style="text-align:center;color:#718096;padding:40px;">👆 Select a month to view versions</p>';
        } else {
            // Show recent months as fallback
            const currentYear = new Date().getFullYear();
            for (let year = currentYear; year >= currentYear - 1; year--) {
                for (let month = 12; month >= 1; month--) {
                    const value = `${year}-${String(month).padStart(2, '0')}`;
                    monthSelect.innerHTML += `<option value="${value}">${formatMonthDisplay(value)}</option>`;
                }
            }
            contentDiv.innerHTML = '<p style="text-align:center;color:#718096;padding:40px;">📭 No versions found. Select a month to get started.</p>';
        }
    } catch (error) {
        console.error('Failed to load months:', error);
        monthSelect.innerHTML = '<option value="">Error loading months</option>';
        contentDiv.innerHTML = '<p style="text-align:center;color:#e53e3e;padding:40px;">❌ Failed to load available months</p>';
    }
}

// Load and display versions
async function loadVersions() {
    const empId = document.getElementById('empSelect').value;
    const month = document.getElementById('monthSelect').value;
    const contentDiv = document.getElementById('versionsContent');
    
    if (!empId || !month) {
        contentDiv.innerHTML = '<p style="text-align:center;color:#718096;padding:40px;">👆 Please select both employee and month</p>';
        return;
    }
    
    contentDiv.innerHTML = '<p style="text-align:center;padding:20px;">⏳ Loading versions...</p>';
    selectedVersions.clear();
    
    try {
        const res = await fetch(`${API}/get-versions/${empId}/${month}`);
        
        if (!res.ok) {
            throw new Error('Failed to fetch versions');
        }
        
        const versions = await res.json();
        
        if (!versions || versions.length === 0) {
            contentDiv.innerHTML = `
                <div style="text-align:center;padding:40px;">
                    <p style="font-size:48px;margin-bottom:20px;">📭</p>
                    <h3 style="color:#718096;">No Versions Found</h3>
                    <p style="color:#a0aec0;">No salary slips have been saved for ${formatMonthDisplay(month)}</p>
                    <button onclick="window.location.href='index.html'" style="margin-top:20px;background:#2c5282;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;">
                        📝 Generate Salary Slip
                    </button>
                </div>`;
            return;
        }
        
        displayVersions(versions, empId, month);
        
    } catch (error) {
        console.error('Error loading versions:', error);
        contentDiv.innerHTML = `
            <div style="text-align:center;padding:40px;">
                <p style="font-size:48px;margin-bottom:20px;">❌</p>
                <h3 style="color:#e53e3e;">Failed to Load Versions</h3>
                <p style="color:#718096;">Please check if the server is running and try again.</p>
                <button onclick="loadVersions()" style="margin-top:20px;background:#3182ce;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;">
                    🔄 Try Again
                </button>
            </div>`;
    }
}

// Display versions in the UI
function displayVersions(versions, empId, month) {
    const contentDiv = document.getElementById('versionsContent');
    
    // Header with actions
    let html = `
        <div style="background:white;border-radius:10px;padding:20px;margin-bottom:20px;border:1px solid #e2e8f0;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:15px;">
                <div>
                    <h2 style="margin:0;color:#2d3748;">📋 Version History</h2>
                    <p style="margin:5px 0 0;color:#718096;">
                        Employee: <strong>${empId}</strong> | Month: <strong>${formatMonthDisplay(month)}</strong>
                    </p>
                    <p style="margin:5px 0 0;color:#718096;">
                        Total Versions: <strong>${versions.length}</strong>
                    </p>
                </div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    <button onclick="toggleSelectAll()" id="selectAllBtn" style="background:#718096;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-weight:600;">
                        ☑️ Select All
                    </button>
                    <button onclick="deleteSelectedVersions()" id="deleteSelectedBtn" style="background:#e53e3e;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-weight:600;">
                        🗑️ Delete Selected
                    </button>
                </div>
            </div>
        </div>
        <div class="version-list">`;
    
    // Display each version
    versions.forEach((version, index) => {
        const date = version.savedAt ? new Date(version.savedAt).toLocaleString('en-IN', {
            year: 'numeric', 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        }) : 'N/A';
        
        const isLatest = index === 0;
        
        // Calculate salary details
        const baseSalary = parseFloat(version.baseSalary) || 0;
        const daysInMonth = version.calendar ? version.calendar.length : 30;
        const dailyRate = baseSalary / daysInMonth;
        const absentDays = (version.attendanceSummary?.absent || 0) + (version.attendanceSummary?.na || 0);
        const deduction = absentDays * dailyRate;
        
        let totalBonus = 0;
        if (version.bonusData && Array.isArray(version.bonusData)) {
            version.bonusData.forEach(b => {
                totalBonus += parseFloat(b.amount) || 0;
            });
        }
        
        const netSalary = baseSalary - deduction + totalBonus;
        
        // Count changes from previous version
        let changesHtml = '';
        if (index < versions.length - 1) {
            const prevVersion = versions[index + 1];
            const changes = compareAttendance(version, prevVersion);
            if (changes.length > 0) {
                changesHtml = `
                    <div style="margin-top:10px;padding:10px;background:#fffbeb;border-left:3px solid #d97706;border-radius:4px;">
                        <strong style="color:#92400e;">📝 Changes from v${prevVersion.version}:</strong>
                        <ul style="margin:5px 0 0 20px;font-size:13px;color:#92400e;">
                            ${changes.map(change => `<li>${change}</li>`).join('')}
                        </ul>
                    </div>`;
            }
        }
        
        html += `
            <div class="version-card" id="version-${version.version}">
                <div class="version-header">
                    <div style="display:flex;align-items:center;gap:15px;flex-wrap:wrap;">
                        <input type="checkbox" 
                               class="version-checkbox" 
                               onchange="toggleVersionSelection(${version.version}, this)"
                               style="width:20px;height:20px;cursor:pointer;accent-color:#2c5282;">
                        <div>
                            <h3 style="margin:0;display:flex;align-items:center;gap:10px;">
                                Version ${version.version}
                                ${isLatest ? '<span style="background:#38a169;color:white;padding:3px 10px;border-radius:20px;font-size:11px;">LATEST</span>' : ''}
                                ${!isLatest ? '<span style="background:#718096;color:white;padding:3px 10px;border-radius:20px;font-size:11px;">OLD</span>' : ''}
                            </h3>
                            <small style="color:#718096;">Saved: ${date}</small>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                        <span class="version-badge">v${version.version}</span>
                        <button onclick="viewVersionDetails('${empId}','${month}',${version.version})" class="btn-view">👁️ View</button>
                        <button onclick="deleteSingleVersion('${empId}','${month}',${version.version})" class="btn-delete">🗑️ Delete</button>
                    </div>
                </div>
                
                ${changesHtml}
                
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:15px 0;">
                    <div>
                        <h4 style="margin-bottom:10px;color:#2d3748;">📊 Attendance Summary</h4>
                        <div class="attendance-summary">
                            <div class="summary-item" style="background:#c6f6d5;">
                                <div style="font-size:24px;font-weight:700;color:#276749;">${version.attendanceSummary?.present || 0}</div>
                                <div style="font-size:12px;color:#276749;">Present</div>
                            </div>
                            <div class="summary-item" style="background:#fed7d7;">
                                <div style="font-size:24px;font-weight:700;color:#9b2c2c;">${version.attendanceSummary?.absent || 0}</div>
                                <div style="font-size:12px;color:#9b2c2c;">Absent</div>
                            </div>
                            <div class="summary-item" style="background:#feebc8;">
                                <div style="font-size:24px;font-weight:700;color:#92400e;">${version.attendanceSummary?.paid || 0}</div>
                                <div style="font-size:12px;color:#92400e;">Paid Leave</div>
                            </div>
                            <div class="summary-item" style="background:#e2e8f0;">
                                <div style="font-size:24px;font-weight:700;color:#4a5568;">${version.attendanceSummary?.na || 0}</div>
                                <div style="font-size:12px;color:#4a5568;">NA</div>
                            </div>
                        </div>
                    </div>
                    <div>
                        <h4 style="margin-bottom:10px;color:#2d3748;">💰 Salary Calculation</h4>
                        <div style="background:white;padding:15px;border-radius:8px;border:1px solid #e2e8f0;">
                            <div style="margin-bottom:8px;">
                                <span style="color:#718096;">Base Salary:</span>
                                <strong style="float:right;">₹${baseSalary.toLocaleString()}</strong>
                            </div>
                            <div style="margin-bottom:8px;">
                                <span style="color:#718096;">Deduction (${absentDays} days):</span>
                                <strong style="float:right;color:#e53e3e;">- ₹${deduction.toFixed(2)}</strong>
                            </div>
                            ${totalBonus > 0 ? `
                                <div style="margin-bottom:8px;">
                                    <span style="color:#718096;">Bonuses:</span>
                                    <strong style="float:right;color:#38a169;">+ ₹${totalBonus.toFixed(2)}</strong>
                                </div>
                            ` : ''}
                            <hr style="margin:10px 0;">
                            <div>
                                <span style="font-weight:700;">Net Salary:</span>
                                <strong style="float:right;color:#d97706;font-size:18px;">₹${netSalary.toFixed(2)}</strong>
                            </div>
                        </div>
                    </div>
                </div>
                
                ${version.calendar && version.calendar.length > 0 ? `
                    <details>
                        <summary style="cursor:pointer;color:#2c5282;font-weight:600;padding:10px;background:#f7fafc;border-radius:6px;">
                            📅 View Attendance Calendar (${version.calendar.length} days)
                        </summary>
                        <div style="margin-top:10px;max-height:300px;overflow-y:auto;">
                            <div class="attendance-grid">
                                ${version.calendar.map(day => `
                                    <div class="attendance-day ${(day.status || '').toLowerCase()}" 
                                         title="Day ${day.date}: ${day.status}">
                                        <small>${day.date}</small><br>
                                        <strong>${
                                            day.status === 'Present' ? '✓' : 
                                            day.status === 'Absent' ? '✗' : 
                                            day.status === 'Paid' ? 'P' : 'NA'
                                        }</strong>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </details>
                ` : ''}
                
                ${version.bonusData && version.bonusData.length > 0 ? `
                    <details>
                        <summary style="cursor:pointer;color:#2c5282;font-weight:600;padding:10px;background:#f7fafc;border-radius:6px;margin-top:10px;">
                            ✨ Bonuses & Incentives (${version.bonusData.length})
                        </summary>
                        <div style="margin-top:10px;padding:10px;background:white;border-radius:6px;">
                            ${version.bonusData.map(b => `
                                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #e2e8f0;">
                                    <span>➕ ${b.name || 'Bonus'} ${b.comment ? `<small style="color:#718096;">(${b.comment})</small>` : ''}</span>
                                    <strong style="color:#38a169;">₹${parseFloat(b.amount || 0).toFixed(2)}</strong>
                                </div>
                            `).join('')}
                        </div>
                    </details>
                ` : ''}
                
                ${version.notes ? `
                    <details>
                        <summary style="cursor:pointer;color:#2c5282;font-weight:600;padding:10px;background:#f7fafc;border-radius:6px;margin-top:10px;">
                            📌 Notes
                        </summary>
                        <div style="margin-top:10px;padding:10px;background:white;border-radius:6px;font-size:13px;line-height:1.6;">
                            ${version.notes}
                        </div>
                    </details>
                ` : ''}
            </div>`;
    });
    
    html += '</div>';
    contentDiv.innerHTML = html;
}

// Compare two versions and return changes
function compareAttendance(current, previous) {
    const changes = [];
    
    if (!current.calendar || !previous.calendar) return changes;
    
    current.calendar.forEach((currentDay, index) => {
        const previousDay = previous.calendar[index];
        if (previousDay && currentDay.status !== previousDay.status) {
            changes.push(`Day ${currentDay.date}: ${previousDay.status} → ${currentDay.status}`);
        }
    });
    
    return changes;
}

// Toggle individual version selection
function toggleVersionSelection(version, checkbox) {
    if (checkbox.checked) {
        selectedVersions.add(version);
    } else {
        selectedVersions.delete(version);
    }
    updateButtonStates();
    highlightSelectedCards();
}

// Toggle select all versions
function toggleSelectAll() {
    const checkboxes = document.querySelectorAll('.version-checkbox');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    
    checkboxes.forEach(cb => {
        cb.checked = !allChecked;
        const cardId = cb.closest('.version-card').id;
        const version = parseInt(cardId.replace('version-', ''));
        
        if (!allChecked) {
            selectedVersions.add(version);
        } else {
            selectedVersions.delete(version);
        }
    });
    
    updateButtonStates();
    highlightSelectedCards();
}

// Update button states based on selection
function updateButtonStates() {
    const selectAllBtn = document.getElementById('selectAllBtn');
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    const checkboxes = document.querySelectorAll('.version-checkbox');
    const allChecked = checkboxes.length > 0 && Array.from(checkboxes).every(cb => cb.checked);
    
    if (selectAllBtn) {
        selectAllBtn.textContent = allChecked ? '☐ Deselect All' : '☑️ Select All';
        selectAllBtn.style.background = allChecked ? '#4a5568' : '#718096';
    }
    
    if (deleteBtn) {
        if (selectedVersions.size > 0) {
            deleteBtn.textContent = `🗑️ Delete Selected (${selectedVersions.size})`;
            deleteBtn.style.background = '#c53030';
            deleteBtn.disabled = false;
        } else {
            deleteBtn.textContent = '🗑️ Delete Selected';
            deleteBtn.style.background = '#e53e3e';
            deleteBtn.disabled = false;
        }
    }
}

// Highlight selected version cards
function highlightSelectedCards() {
    document.querySelectorAll('.version-card').forEach(card => {
        const versionId = parseInt(card.id.replace('version-', ''));
        if (selectedVersions.has(versionId)) {
            card.style.border = '2px solid #2c5282';
            card.style.background = '#ebf8ff';
        } else {
            card.style.border = '1px solid #e2e8f0';
            card.style.background = '#f7fafc';
        }
    });
}

// Delete single version
async function deleteSingleVersion(empId, month, version) {
    if (!confirm(`⚠️ Delete Version ${version}?\n\nMonth: ${formatMonthDisplay(month)}\n\nThis action CANNOT be undone!`)) {
        return;
    }
    
    try {
        const res = await fetch(`${API}/delete-version/${empId}/${month}/${version}`, {
            method: 'DELETE'
        });
        
        if (res.ok) {
            showNotification(`✅ Version ${version} deleted successfully!`, 'success');
            selectedVersions.delete(version);
            // Reload versions after a short delay
            setTimeout(() => loadVersions(), 500);
        } else {
            const error = await res.json();
            showNotification(`❌ ${error.error || 'Failed to delete version'}`, 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showNotification('❌ Delete failed. Please check server connection.', 'error');
    }
}

// Delete multiple selected versions
async function deleteSelectedVersions() {
    if (selectedVersions.size === 0) {
        showNotification('⚠️ Please select at least one version to delete', 'error');
        return;
    }
    
    const empId = document.getElementById('empSelect').value;
    const month = document.getElementById('monthSelect').value;
    const versionsToDelete = Array.from(selectedVersions);
    
    if (!confirm(`⚠️ Delete ${versionsToDelete.length} version(s)?\n\nMonth: ${formatMonthDisplay(month)}\nVersions: ${versionsToDelete.join(', ')}\n\nThis action CANNOT be undone!`)) {
        return;
    }
    
    try {
        const res = await fetch(`${API}/delete-multiple-versions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                empId, 
                month, 
                versions: versionsToDelete 
            })
        });
        
        const result = await res.json();
        
        if (res.ok) {
            showNotification(`✅ ${result.deletedCount} version(s) deleted successfully!`, 'success');
            selectedVersions.clear();
            setTimeout(() => loadVersions(), 500);
        } else {
            showNotification('❌ Failed to delete versions', 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showNotification('❌ Delete failed. Please check server connection.', 'error');
    }
}

// View version details in new tab
function viewVersionDetails(empId, month, version) {
    window.open(`view-slip.html?empId=${empId}&month=${month}&version=${version}`, '_blank');
}

// Format month for display
function formatMonthDisplay(monthStr) {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(month)-1]} ${year}`;
}

// Show notification toast
function showNotification(message, type = 'success') {
    // Remove existing notifications
    const existing = document.querySelector('.notification-toast');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = 'notification-toast';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        border-radius: 8px;
        color: white;
        font-weight: 600;
        z-index: 1000;
        animation: slideIn 0.3s ease;
        background: ${type === 'success' ? '#38a169' : '#e53e3e'};
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        max-width: 450px;
        font-size: 14px;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}

// Show error message in content area
function showErrorMessage(message) {
    const contentDiv = document.getElementById('versionsContent');
    if (contentDiv) {
        contentDiv.innerHTML = `
            <div style="text-align:center;padding:40px;">
                <p style="font-size:48px;margin-bottom:20px;">⚠️</p>
                <h3 style="color:#e53e3e;">Error</h3>
                <p style="color:#718096;">${message}</p>
                <button onclick="location.reload()" style="margin-top:20px;background:#3182ce;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;">
                    🔄 Reload Page
                </button>
            </div>`;
    }
}

// Handle keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl+A to select all
    if (e.ctrlKey && e.key === 'a') {
        // Only if we're on the versions page
        const versionsContent = document.getElementById('versionsContent');
        if (versionsContent && versionsContent.querySelector('.version-checkbox')) {
            e.preventDefault();
            toggleSelectAll();
        }
    }
    
    // Delete key to delete selected
    if (e.key === 'Delete' && selectedVersions.size > 0) {
        const versionsContent = document.getElementById('versionsContent');
        if (versionsContent && versionsContent.querySelector('.version-checkbox')) {
            e.preventDefault();
            deleteSelectedVersions();
        }
    }
});