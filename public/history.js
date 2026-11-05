const API = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : '/api';

let historyData = [];
let filteredData = [];
let currentPage = 1;
const rowsPerPage = 15;
let sortColumn = 'month';
let sortDirection = 'desc';

document.addEventListener('DOMContentLoaded', () => {
    loadEmployees();
    loadHistory();
});

async function loadEmployees() {
    try {
        const res = await fetch(`${API}/all-employees`);
        const employees = await res.json();
        const select = document.getElementById('empFilter');
        employees.forEach(emp => {
            const option = document.createElement('option');
            option.value = emp.empId;
            option.textContent = `${emp.empId} - ${emp.name || 'Unnamed'}`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load employees:', error);
    }
}

async function loadHistory() {
    try {
        const empId = document.getElementById('empFilter').value;
        const month = document.getElementById('monthFilter').value;
        
        let url = `${API}/all-slips`;
        const params = new URLSearchParams();
        if (empId) params.append('empId', empId);
        if (month) params.append('month', month);
        if (params.toString()) url += '?' + params.toString();
        
        const res = await fetch(url);
        const slips = await res.json();
        
        // Enrich with detailed data
        historyData = await enrichSlipData(slips);
        filteredData = [...historyData];
        
        // Apply search filter
        applySearchFilter();
        
        // Update stats
        updateStats();
        
        // Render table
        renderTable();
        
    } catch (error) {
        console.error('Failed to load history:', error);
        showError('Failed to load history. Please check server connection.');
    }
}

async function enrichSlipData(slips) {
    const enriched = [];
    
    for (const slip of slips) {
        try {
            // Get full slip data for calculation
            const res = await fetch(`${API}/get-slip/${slip.empId}/${slip.month}`);
            if (res.ok) {
                const fullSlip = await res.json();
                
                // Calculate attendance
                let present = 0, absent = 0, paid = 0, na = 0;
                if (fullSlip.calendar) {
                    fullSlip.calendar.forEach(day => {
                        if (day.status === 'Present') present++;
                        else if (day.status === 'Absent') absent++;
                        else if (day.status === 'Paid') paid++;
                        else if (day.status === 'NA') na++;
                    });
                }
                
                const daysInMonth = fullSlip.calendar ? fullSlip.calendar.length : 30;
                const baseSalary = parseFloat(fullSlip.baseSalary) || 0;
                const dailyRate = baseSalary / daysInMonth;
                const deduction = (absent + na) * dailyRate;
                
                // Calculate bonuses
                let totalBonus = 0;
                if (fullSlip.bonusData && Array.isArray(fullSlip.bonusData)) {
                    fullSlip.bonusData.forEach(b => {
                        totalBonus += parseFloat(b.amount) || 0;
                    });
                }
                
                const netSalary = baseSalary - deduction + totalBonus;
                
                enriched.push({
                    ...slip,
                    present,
                    absent,
                    paid,
                    na,
                    daysInMonth,
                    deduction: Math.round(deduction * 100) / 100,
                    bonus: Math.round(totalBonus * 100) / 100,
                    netSalary: Math.round(netSalary * 100) / 100,
                    baseSalary: baseSalary,
                    fullSlip: fullSlip
                });
            } else {
                // Fallback: use basic data
                enriched.push({
                    ...slip,
                    present: 0,
                    absent: 0,
                    paid: 0,
                    na: 0,
                    daysInMonth: 30,
                    deduction: 0,
                    bonus: 0,
                    netSalary: parseFloat(slip.baseSalary) || 0
                });
            }
        } catch (error) {
            console.error(`Error enriching slip ${slip.empId}/${slip.month}:`, error);
            enriched.push({
                ...slip,
                present: 0,
                absent: 0,
                paid: 0,
                na: 0,
                daysInMonth: 30,
                deduction: 0,
                bonus: 0,
                netSalary: parseFloat(slip.baseSalary) || 0
            });
        }
    }
    
    return enriched;
}

function applySearchFilter() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    
    if (!searchTerm) {
        filteredData = [...historyData];
    } else {
        filteredData = historyData.filter(item => {
            const name = (item.employeeName || '').toLowerCase();
            const id = (item.empId || '').toLowerCase();
            return name.includes(searchTerm) || id.includes(searchTerm);
        });
    }
    
    // Apply sorting
    applySorting();
}

function applySorting() {
    filteredData.sort((a, b) => {
        let aVal = a[sortColumn] || '';
        let bVal = b[sortColumn] || '';
        
        // Handle numeric values
        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }
        
        // Handle string values
        if (typeof aVal === 'string') {
            aVal = aVal.toLowerCase();
            bVal = bVal.toLowerCase();
        }
        
        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
}

function sortTable(column) {
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'asc';
    }
    
    applySearchFilter();
    currentPage = 1;
    renderTable();
}

function filterTable() {
    currentPage = 1;
    applySearchFilter();
    renderTable();
}

function clearFilters() {
    document.getElementById('empFilter').value = '';
    document.getElementById('monthFilter').value = '';
    document.getElementById('searchInput').value = '';
    currentPage = 1;
    loadHistory();
}

function updateStats() {
    const totalSlips = historyData.length;
    const totalSalary = historyData.reduce((sum, item) => sum + (item.netSalary || 0), 0);
    const avgSalary = totalSlips > 0 ? totalSalary / totalSlips : 0;
    const totalDeduction = historyData.reduce((sum, item) => sum + (item.deduction || 0), 0);
    
    document.getElementById('totalSlips').textContent = totalSlips;
    document.getElementById('totalSalary').textContent = '₹' + totalSalary.toFixed(2);
    document.getElementById('avgSalary').textContent = '₹' + avgSalary.toFixed(2);
    document.getElementById('totalDeduction').textContent = '₹' + totalDeduction.toFixed(2);
}

function renderTable() {
    const tbody = document.getElementById('historyBody');
    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    
    if (currentPage > totalPages) currentPage = Math.max(1, totalPages);
    if (currentPage < 1) currentPage = 1;
    
    const start = (currentPage - 1) * rowsPerPage;
    const end = Math.min(start + rowsPerPage, filteredData.length);
    const pageData = filteredData.slice(start, end);
    
    if (pageData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align:center;padding:60px 20px;color:#718096;">
                    <div class="history-empty">
                        <div class="empty-icon">${filteredData.length === 0 && historyData.length > 0 ? '🔍' : '📭'}</div>
                        <h3>${filteredData.length === 0 && historyData.length > 0 ? 'No matches found' : 'No salary slips found'}</h3>
                        <p>${filteredData.length === 0 && historyData.length > 0 ? 'Try adjusting your search filters' : 'Start generating salary slips from the main page'}</p>
                    </div>
                </td>
            </tr>
        `;
    } else {
        let html = '';
        pageData.forEach(item => {
            const monthDisplay = formatMonthDisplay(item.month);
            const isNegativeDeduction = item.deduction > 0;
            
            html += `
                <tr>
                    <td><span class="emp-id-badge">${item.empId}</span></td>
                    <td class="employee-cell">${item.employeeName || 'N/A'}</td>
                    <td class="month-cell">${monthDisplay}</td>
                    <td>₹${item.baseSalary.toFixed(2)}</td>
                    <td class="amount-cell ${isNegativeDeduction ? 'negative' : ''}">
                        ${isNegativeDeduction ? '- ₹' + item.deduction.toFixed(2) : '₹0.00'}
                    </td>
                    <td class="amount-cell positive">${item.bonus > 0 ? '+ ₹' + item.bonus.toFixed(2) : '₹0.00'}</td>
                    <td class="amount-cell positive" style="font-weight:700;font-size:16px;color:#d97706;">
                        ₹${item.netSalary.toFixed(2)}
                    </td>
                    <td><span class="version-badge">v${item.version || 1}</span></td>
                    <td class="action-cell no-print">
                        <button class="btn-view-slip" onclick="viewSlip('${item.empId}','${item.month}')">
                            👁️ View
                        </button>
                        <button class="btn-view-history" onclick="viewVersions('${item.empId}','${item.month}')">
                            📋 History
                        </button>
                        <button class="btn-delete-history" onclick="deleteSlip('${item.empId}','${item.month}')">
                            🗑️ Delete
                        </button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    }
    
    // Update pagination
    document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages || 1}`;
    document.getElementById('prevPage').disabled = currentPage <= 1;
    document.getElementById('nextPage').disabled = currentPage >= totalPages;
}

function changePage(direction) {
    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    if (direction === 'prev' && currentPage > 1) {
        currentPage--;
    } else if (direction === 'next' && currentPage < totalPages) {
        currentPage++;
    }
    renderTable();
}

function formatMonthDisplay(monthStr) {
    if (!monthStr) return 'N/A';
    const [year, month] = monthStr.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(month)-1]} ${year}`;
}

function viewSlip(empId, month) {
    window.open(`view-slip.html?empId=${empId}&month=${month}`, '_blank');
}

function viewVersions(empId, month) {
    window.open(`versions.html?empId=${empId}&month=${month}`, '_blank');
}

async function deleteSlip(empId, month) {
    const monthDisplay = formatMonthDisplay(month);
    if (!confirm(`⚠️ Delete salary slip for ${empId} - ${monthDisplay}?\n\nThis will remove ALL versions! This action CANNOT be undone.`)) {
        return;
    }
    
    try {
        const res = await fetch(`${API}/delete-slip/${empId}/${month}`, { method: 'DELETE' });
        if (res.ok) {
            showNotification(`✅ Deleted slip for ${empId} - ${monthDisplay}`, 'success');
            loadHistory();
        } else {
            showNotification('❌ Failed to delete slip', 'error');
        }
    } catch (error) {
        showNotification('❌ Delete failed. Check server connection.', 'error');
    }
}

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
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}

function showError(message) {
    const tbody = document.getElementById('historyBody');
    tbody.innerHTML = `
        <tr>
            <td colspan="9" style="text-align:center;padding:60px 20px;">
                <div style="font-size:48px;margin-bottom:15px;">⚠️</div>
                <h3 style="color:#e53e3e;">Error</h3>
                <p style="color:#718096;">${message}</p>
                <button onclick="loadHistory()" style="margin-top:15px;background:#3182ce;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;">
                    🔄 Retry
                </button>
            </td>
        </tr>
    `;
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl+F to focus search
    if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        document.getElementById('searchInput').focus();
    }
    
    // Escape to clear search
    if (e.key === 'Escape') {
        const searchInput = document.getElementById('searchInput');
        if (document.activeElement === searchInput) {
            searchInput.value = '';
            filterTable();
        }
    }
});