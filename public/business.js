const API = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : '/api';

// Global variables for import
let importData = [];
let importType = '';
let importSuccessCount = 0;

// ============ HELPER: Convert Excel Serial Date to Date String ============
function excelSerialToDate(serial) {
    if (!serial) return '';
    if (typeof serial === 'string' && serial.match(/^\d{4}-\d{2}-\d{2}/)) {
        return serial;
    }
    if (typeof serial === 'number') {
        const utc_days = Math.floor(serial - 25569);
        const utc_value = utc_days * 86400;
        const date_info = new Date(utc_value * 1000);
        const year = date_info.getFullYear();
        const month = String(date_info.getMonth() + 1).padStart(2, '0');
        const day = String(date_info.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    if (typeof serial === 'string') {
        try {
            const d = new Date(serial);
            if (!isNaN(d.getTime())) {
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            }
        } catch (e) {}
    }
    return String(serial);
}

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', () => {
    // Set default dates
    const today = new Date();
    const currentMonth = today.toISOString().slice(0, 7);
    
    document.getElementById('saleDate').value = today.toISOString().split('T')[0];
    document.getElementById('expenseDate').value = today.toISOString().split('T')[0];
    document.getElementById('reportMonth').value = currentMonth;
    document.getElementById('overviewMonth').value = currentMonth;
    
    // Load all data
    loadAllData();
    loadMonthFilter();
    loadYearFilter();
    loadMonthlySummary();
    loadMonthlyOverview();
    
    // Tab switching
    document.querySelectorAll('.business-tabs button').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.business-tabs button').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.getElementById('tab-' + this.dataset.tab).classList.add('active');
            
            if (this.dataset.tab === 'reports') {
                generateReport();
                loadYTDSummary();
            }
            if (this.dataset.tab === 'monthly') {
                loadMonthlySummary();
            }
        });
    });
    
    // Excel file input handlers
    document.getElementById('salesExcelInput').addEventListener('change', function(e) {
        if (this.files.length > 0) {
            importSalesExcel();
        }
    });
    
    document.getElementById('expensesExcelInput').addEventListener('change', function(e) {
        if (this.files.length > 0) {
            importExpensesExcel();
        }
    });
    
    document.getElementById('productsExcelInput').addEventListener('change', function(e) {
        if (this.files.length > 0) {
            importProductsExcel();
        }
    });
    
    // Add event listener for overview month change
    document.getElementById('overviewMonth').addEventListener('change', loadMonthlyOverview);
});

// ============ LOAD ALL DATA ============
async function loadAllData() {
    await loadDashboard();
    await loadSales();
    await loadExpenses();
    await loadProducts();
    await loadCategoryFilter();
    await loadProductSelect();
    await loadMonthlyOverview();
}

// ============ MONTHLY OVERVIEW (NEW FEATURE) ============
async function loadMonthlyOverview() {
    const month = document.getElementById('overviewMonth').value;
    if (!month) {
        showNotification('Please select a month', 'error');
        return;
    }
    
    try {
        // Show loading state
        document.getElementById('overviewRevenue').textContent = 'Loading...';
        document.getElementById('overviewExpenses').textContent = 'Loading...';
        document.getElementById('overviewSalary').textContent = 'Loading...';
        document.getElementById('overviewNetProfit').textContent = 'Loading...';
        
        // Fetch business report data
        const businessRes = await fetch(`${API}/business/reports?month=${month}`);
        if (!businessRes.ok) {
            throw new Error('Failed to fetch business reports');
        }
        const businessData = await businessRes.json();
        
        // Fetch all salary slips for the month
        const slipsRes = await fetch(`${API}/all-slips?month=${month}`);
        if (!slipsRes.ok) {
            throw new Error('Failed to fetch salary slips');
        }
        const slips = await slipsRes.json();
        
        // Calculate employee salaries
        let totalSalary = 0;
        const employeeSalaries = [];
        
        for (const slip of slips) {
            try {
                const slipDetailRes = await fetch(`${API}/get-slip/${slip.empId}/${slip.month}`);
                if (slipDetailRes.ok) {
                    const slipDetail = await slipDetailRes.json();
                    
                    // Calculate salary from attendance
                    const baseSalary = parseFloat(slipDetail.baseSalary) || 0;
                    const daysInMonth = slipDetail.calendar ? slipDetail.calendar.length : 30;
                    const dailyRate = baseSalary / daysInMonth;
                    
                    let absentDays = 0;
                    let halfDays = 0;
                    
                    if (slipDetail.calendar) {
                        slipDetail.calendar.forEach(day => {
                            if (day.status === 'Absent' || day.status === 'NA') absentDays++;
                            else if (day.status === 'HalfDay') halfDays += 0.5;
                        });
                    }
                    
                    const deduction = (absentDays + halfDays) * dailyRate;
                    
                    // Calculate bonuses
                    let totalBonus = 0;
                    if (slipDetail.bonusData && Array.isArray(slipDetail.bonusData)) {
                        slipDetail.bonusData.forEach(b => {
                            totalBonus += parseFloat(b.amount) || 0;
                        });
                    }
                    
                    const netSalary = baseSalary - deduction + totalBonus;
                    totalSalary += netSalary;
                    
                    employeeSalaries.push({
                        empId: slip.empId,
                        name: slip.employeeName || slip.empId,
                        baseSalary: baseSalary,
                        deduction: deduction,
                        bonus: totalBonus,
                        netSalary: netSalary
                    });
                }
            } catch (error) {
                console.error(`Error fetching slip for ${slip.empId}:`, error);
            }
        }
        
        // Get business metrics
        const totalSales = businessData.totalSales || 0;
        const totalProfit = businessData.totalProfit || 0;
        const businessTotalExpenses = businessData.totalExpenses || 0;
        const salaryExpensesFromBusiness = businessData.salaryExpenses || 0;
        const otherExpenses = businessTotalExpenses - salaryExpensesFromBusiness;
        
        // Use the higher of salary from slips or salary expenses from business data
        const finalSalary = Math.max(totalSalary, salaryExpensesFromBusiness);
        
        // Calculate final profit
        const finalProfit = totalProfit - otherExpenses - finalSalary;
        const profitMargin = totalSales > 0 ? (finalProfit / totalSales) * 100 : 0;
        
        // Count sales and expenses
        const salesCount = businessData.transactions ? 
            businessData.transactions.filter(t => t.type === 'sale').length : 0;
        const expenseCount = businessData.transactions ? 
            businessData.transactions.filter(t => t.type === 'expense' && t.category !== 'Salary').length : 0;
        
        // Update overview stats
        document.getElementById('overviewRevenue').textContent = '₹' + totalSales.toFixed(2);
        document.getElementById('overviewSalesCount').textContent = salesCount + ' sales';
        
        document.getElementById('overviewExpenses').textContent = '₹' + otherExpenses.toFixed(2);
        document.getElementById('overviewExpenseCount').textContent = expenseCount + ' expenses';
        
        document.getElementById('overviewSalary').textContent = '₹' + finalSalary.toFixed(2);
        document.getElementById('overviewEmployeeCount').textContent = employeeSalaries.length + ' employees';
        
        document.getElementById('overviewNetProfit').textContent = '₹' + finalProfit.toFixed(2);
        document.getElementById('overviewProfitMargin').textContent = profitMargin.toFixed(1) + '% margin';
        
        // Update profit flow
        document.getElementById('flowGrossProfit').textContent = '₹' + totalProfit.toFixed(2);
        document.getElementById('flowExpenses').textContent = '₹' + otherExpenses.toFixed(2);
        document.getElementById('flowSalary').textContent = '₹' + finalSalary.toFixed(2);
        document.getElementById('flowFinalProfit').textContent = '₹' + finalProfit.toFixed(2);
        
        // Update salary breakdown
        const salaryGrid = document.getElementById('salaryBreakdownGrid');
        if (employeeSalaries.length > 0) {
            salaryGrid.innerHTML = employeeSalaries.map(emp => `
                <div class="salary-item">
                    <div class="employee-info">
                        <span class="employee-name">${emp.name}</span>
                        <span class="employee-id">${emp.empId}</span>
                        <div style="font-size: 11px; opacity: 0.8; margin-top: 4px;">
                            Base: ₹${emp.baseSalary.toFixed(2)}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div class="salary-amount">₹${emp.netSalary.toFixed(2)}</div>
                        <div style="font-size: 11px; opacity: 0.8;">
                            ${emp.deduction > 0 ? 'Ded: -₹' + emp.deduction.toFixed(2) : 'No deductions'}
                            ${emp.bonus > 0 ? '<br>Bonus: +₹' + emp.bonus.toFixed(2) : ''}
                        </div>
                    </div>
                </div>
            `).join('');
        } else {
            salaryGrid.innerHTML = '<p style="color: rgba(255,255,255,0.8);">No salary slips found for this month</p>';
        }
        
        // Color code the profit
        const profitElement = document.getElementById('overviewNetProfit');
        const flowProfitElement = document.getElementById('flowFinalProfit');
        
        if (finalProfit >= 0) {
            profitElement.style.color = '#c6f6d5';
            flowProfitElement.style.color = '#c6f6d5';
        } else {
            profitElement.style.color = '#fed7d7';
            flowProfitElement.style.color = '#fed7d7';
        }
        
        // Update month display
        const monthDisplay = formatMonthDisplay(month);
        document.querySelector('.monthly-overview-header h3').textContent = `📊 Monthly Overview - ${monthDisplay}`;
        
    } catch (error) {
        console.error('Failed to load monthly overview:', error);
        showNotification('Failed to load monthly overview: ' + error.message, 'error');
    }
}

// ============ DASHBOARD ============
async function loadDashboard() {
    try {
        const res = await fetch(`${API}/business/dashboard`);
        const data = await res.json();
        
        document.getElementById('todaySales').textContent = '₹' + (data.todaySales || 0).toFixed(2);
        document.getElementById('todayProfit').textContent = '₹' + (data.todayProfit || 0).toFixed(2);
        document.getElementById('todayCash').textContent = '₹' + (data.todayCash || 0).toFixed(2);
        document.getElementById('todayUPI').textContent = '₹' + (data.todayUPI || 0).toFixed(2);
        document.getElementById('todayExpenses').textContent = '₹' + (data.todayExpenses || 0).toFixed(2);
    } catch (error) {
        console.error('Failed to load dashboard:', error);
    }
}

// ============ SALES ============
async function addSale() {
    const date = document.getElementById('saleDate').value;
    const total = parseFloat(document.getElementById('saleAmount').value) || 0;
    const cash = parseFloat(document.getElementById('saleCash').value) || 0;
    const upi = parseFloat(document.getElementById('saleUPI').value) || 0;
    const product = document.getElementById('saleProduct').value;
    const customer = document.getElementById('saleCustomer').value;
    const note = document.getElementById('saleNote').value;
    
    if (!date || total <= 0) {
        alert('Please enter date and total sale amount');
        return;
    }
    
    if (cash + upi !== total) {
        alert(`Total (₹${total}) should equal Cash (₹${cash}) + UPI (₹${upi}) = ₹${cash + upi}`);
        return;
    }
    
    const profit = total * 0.20;
    
    const saleData = { date, total, cash, upi, profit, product, customer, note };
    
    try {
        const res = await fetch(`${API}/business/sales`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(saleData)
        });
        
        if (res.ok) {
            showNotification('✅ Sale added successfully!', 'success');
            resetSaleForm();
            await loadAllData();
        } else {
            const error = await res.json();
            showNotification('❌ Failed to add sale: ' + (error.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        showNotification('❌ Error adding sale', 'error');
    }
}

async function loadSales() {
    try {
        const date = document.getElementById('filterDate').value || '';
        const month = document.getElementById('filterMonth').value || '';
        let url = `${API}/business/sales?`;
        if (date) url += `date=${date}&`;
        if (month) url += `month=${month}`;
        
        const res = await fetch(url);
        const sales = await res.json();
        
        const tbody = document.getElementById('salesBody');
        if (!sales || sales.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align:center;padding:40px;color:#718096;">
                        <span style="font-size:24px;display:block;margin-bottom:10px;">📭</span>
                        No sales recorded yet
                    </td>
                </tr>
            `;
            return;
        }
        
        // Reset selection when re-rendering
        selectedSales.clear();
        updateSalesBulkBar();

        let html = '';
        let totalSales = 0;
        let totalProfit = 0;
        let totalCash = 0;
        let totalUPI = 0;
        
        sales.forEach(sale => {
            const dateStr = excelSerialToDate(sale.date);
            totalSales += sale.total || 0;
            totalProfit += sale.profit || 0;
            totalCash += sale.cash || 0;
            totalUPI += sale.upi || 0;
            
            html += `
                <tr>
                    <td class="bulk-checkbox-col">
                        <input type="checkbox" class="bulk-checkbox sale-checkbox" 
                               data-id="${sale._id}"
                               onchange="toggleSaleSelect('${sale._id}', this)">
                    </td>
                    <td>${formatDate(dateStr)}</td>
                    <td>${sale.product || 'General'}</td>
                    <td class="amount positive">₹${parseFloat(sale.total || 0).toFixed(2)}</td>
                    <td class="amount">₹${parseFloat(sale.cash || 0).toFixed(2)}</td>
                    <td class="amount">₹${parseFloat(sale.upi || 0).toFixed(2)}</td>
                    <td class="amount positive">₹${parseFloat(sale.profit || 0).toFixed(2)}</td>
                    <td>${sale.customer || '-'}</td>
                    <td>
                        <button onclick="editSale('${sale._id}')" class="btn-info" style="padding:4px 10px;font-size:11px;">✏️</button>
                        <button onclick="deleteSale('${sale._id}')" class="btn-danger" style="padding:4px 10px;font-size:11px;">🗑️</button>
                    </td>
                </tr>
            `;
        });
        
        // Add summary row
        html += `
            <tr style="background:#f0f4f8;font-weight:700;">
                <td colspan="3" style="text-align:right;">TOTAL:</td>
                <td class="amount positive">₹${totalSales.toFixed(2)}</td>
                <td class="amount">₹${totalCash.toFixed(2)}</td>
                <td class="amount">₹${totalUPI.toFixed(2)}</td>
                <td class="amount positive">₹${totalProfit.toFixed(2)}</td>
                <td colspan="2"></td>
            </tr>
        `;
        
        tbody.innerHTML = html;
    } catch (error) {
        console.error('Failed to load sales:', error);
        showNotification('Failed to load sales', 'error');
    }
}

async function editSale(id) {
    try {
        const res = await fetch(`${API}/business/sales`);
        const sales = await res.json();
        const sale = sales.find(s => s._id === id);
        
        if (!sale) {
            showNotification('❌ Sale not found', 'error');
            return;
        }
        
        openEditModal('sale', sale);
    } catch (error) {
        showNotification('❌ Error loading sale', 'error');
    }
}

async function deleteSale(id) {
    if (!confirm('Delete this sale record?')) return;
    
    try {
        const res = await fetch(`${API}/business/sales/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showNotification('✅ Sale deleted', 'success');
            await loadAllData();
        } else {
            showNotification('❌ Delete failed', 'error');
        }
    } catch (error) {
        showNotification('❌ Delete failed', 'error');
    }
}

function resetSaleForm() {
    document.getElementById('saleAmount').value = '';
    document.getElementById('saleCash').value = '';
    document.getElementById('saleUPI').value = '';
    document.getElementById('saleProduct').value = '';
    document.getElementById('saleCustomer').value = '';
    document.getElementById('saleNote').value = '';
    document.getElementById('saleDate').value = new Date().toISOString().split('T')[0];
}

function clearSalesFilter() {
    document.getElementById('filterDate').value = '';
    document.getElementById('filterMonth').value = '';
    loadSales();
}

// ============ EXPENSES ============
async function addExpense() {
    const date = document.getElementById('expenseDate').value;
    const amount = parseFloat(document.getElementById('expenseAmount').value) || 0;
    const category = document.getElementById('expenseCategory').value;
    const description = document.getElementById('expenseDescription').value;
    const paymentMode = document.getElementById('expensePaymentMode').value;
    
    if (!date || amount <= 0 || !category) {
        alert('Please fill all required fields');
        return;
    }
    
    const expenseData = { date, amount, category, description, paymentMode };
    
    try {
        const res = await fetch(`${API}/business/expenses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(expenseData)
        });
        
        if (res.ok) {
            showNotification('✅ Expense added successfully!', 'success');
            resetExpenseForm();
            await loadAllData();
        } else {
            showNotification('❌ Failed to add expense', 'error');
        }
    } catch (error) {
        showNotification('❌ Error adding expense', 'error');
    }
}

async function loadExpenses() {
    try {
        const date = document.getElementById('expenseFilterDate').value || '';
        const category = document.getElementById('expenseCategoryFilter').value || '';
        let url = `${API}/business/expenses?`;
        if (date) url += `date=${date}&`;
        if (category) url += `category=${category}`;
        
        const res = await fetch(url);
        const expenses = await res.json();
        
        const tbody = document.getElementById('expensesBody');
        if (!expenses || expenses.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center;padding:40px;color:#718096;">
                        <span style="font-size:24px;display:block;margin-bottom:10px;">📭</span>
                        No expenses recorded yet
                    </td>
                </tr>
            `;
            return;
        }
        
        selectedExpenses.clear();
        updateExpensesBulkBar();

        let html = '';
        let totalExpenses = 0;
        
        expenses.forEach(exp => {
            const dateStr = excelSerialToDate(exp.date);
            totalExpenses += exp.amount || 0;
            
            html += `
                <tr>
                    <td class="bulk-checkbox-col">
                        <input type="checkbox" class="bulk-checkbox expense-checkbox" 
                               data-id="${exp._id}"
                               onchange="toggleExpenseSelect('${exp._id}', this)">
                    </td>
                    <td>${formatDate(dateStr)}</td>
                    <td><span style="background:#edf2f7;padding:2px 10px;border-radius:12px;font-size:12px;">${exp.category}</span></td>
                    <td>${exp.description || '-'}</td>
                    <td class="amount negative">₹${parseFloat(exp.amount || 0).toFixed(2)}</td>
                    <td>${exp.paymentMode || 'Cash'}</td>
                    <td>
                        <button onclick="editExpense('${exp._id}')" class="btn-info" style="padding:4px 10px;font-size:11px;">✏️</button>
                        <button onclick="deleteExpense('${exp._id}')" class="btn-danger" style="padding:4px 10px;font-size:11px;">🗑️</button>
                    </td>
                </tr>
            `;
        });
        
        // Add summary row
        html += `
            <tr style="background:#f0f4f8;font-weight:700;">
                <td colspan="4" style="text-align:right;">TOTAL:</td>
                <td class="amount negative">₹${totalExpenses.toFixed(2)}</td>
                <td colspan="2"></td>
            </tr>
        `;
        
        tbody.innerHTML = html;
    } catch (error) {
        console.error('Failed to load expenses:', error);
        showNotification('Failed to load expenses', 'error');
    }
}

async function editExpense(id) {
    try {
        const res = await fetch(`${API}/business/expenses`);
        const expenses = await res.json();
        const expense = expenses.find(e => e._id === id);
        
        if (!expense) {
            showNotification('❌ Expense not found', 'error');
            return;
        }
        
        openEditModal('expense', expense);
    } catch (error) {
        showNotification('❌ Error loading expense', 'error');
    }
}

async function deleteExpense(id) {
    if (!confirm('Delete this expense record?')) return;
    
    try {
        const res = await fetch(`${API}/business/expenses/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showNotification('✅ Expense deleted', 'success');
            await loadAllData();
        } else {
            showNotification('❌ Delete failed', 'error');
        }
    } catch (error) {
        showNotification('❌ Delete failed', 'error');
    }
}

function setExpenseCategory(category) {
    document.getElementById('expenseCategory').value = category;
    document.querySelectorAll('.expense-category-btn').forEach(btn => {
        btn.classList.remove('selected');
        if (btn.textContent.trim() === category) {
            btn.classList.add('selected');
        }
    });
}

function resetExpenseForm() {
    document.getElementById('expenseAmount').value = '';
    document.getElementById('expenseCategory').value = '';
    document.getElementById('expenseDescription').value = '';
    document.getElementById('expensePaymentMode').value = 'Cash';
    document.getElementById('expenseDate').value = new Date().toISOString().split('T')[0];
    document.querySelectorAll('.expense-category-btn').forEach(btn => btn.classList.remove('selected'));
}

function clearExpenseFilter() {
    document.getElementById('expenseFilterDate').value = '';
    document.getElementById('expenseCategoryFilter').value = '';
    loadExpenses();
}

async function loadCategoryFilter() {
    try {
        const res = await fetch(`${API}/business/expense-categories`);
        const categories = await res.json();
        const select = document.getElementById('expenseCategoryFilter');
        select.innerHTML = '<option value="">All Categories</option>';
        if (categories && categories.length > 0) {
            categories.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat;
                option.textContent = cat;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Failed to load categories:', error);
    }
}

// ============ PRODUCTS ============
async function addProduct() {
    const name = document.getElementById('productName').value.trim();
    const price = parseFloat(document.getElementById('productPrice').value) || 0;
    const cost = parseFloat(document.getElementById('productCost').value) || 0;
    const stock = parseInt(document.getElementById('productStock').value) || 0;
    
    if (!name || price <= 0) {
        alert('Please enter product name and price');
        return;
    }
    
    const productData = { name, price, cost, stock };
    
    try {
        const res = await fetch(`${API}/business/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productData)
        });
        
        if (res.ok) {
            showNotification('✅ Product added successfully!', 'success');
            resetProductForm();
            await loadAllData();
        } else {
            showNotification('❌ Failed to add product', 'error');
        }
    } catch (error) {
        showNotification('❌ Error adding product', 'error');
    }
}

async function loadProducts() {
    try {
        const res = await fetch(`${API}/business/products`);
        const products = await res.json();
        
        const grid = document.getElementById('productGrid');
        if (!products || products.length === 0) {
            grid.innerHTML = `
                <p style="color:#718096;text-align:center;padding:40px;width:100%;">
                    <span style="font-size:24px;display:block;margin-bottom:10px;">📦</span>
                    No products added yet
                </p>
            `;
            selectedProducts.clear();
            updateProductsBulkBar();
            return;
        }

        // Reset selection when re-rendering
        selectedProducts.clear();
        updateProductsBulkBar();

        let html = '';
        products.forEach(product => {
            const profit = (product.price || 0) - (product.cost || 0);
            const profitMargin = (product.cost || 0) > 0 ? ((profit / (product.cost || 1)) * 100).toFixed(1) : 0;
            html += `
                <div class="product-card" style="position:relative;">
                    <input type="checkbox" class="bulk-checkbox product-checkbox" 
                           data-id="${product._id}"
                           onchange="toggleProductSelect('${product._id}', this)"
                           style="position:absolute;top:10px;right:10px;">
                    <div class="product-name">${product.name}</div>
                    <div class="product-price">₹${parseFloat(product.price || 0).toFixed(2)}</div>
                    <div class="product-stock">Stock: ${product.stock || 0} units</div>
                    <div style="font-size:12px;color:#718096;margin-top:5px;">
                        Cost: ₹${parseFloat(product.cost || 0).toFixed(2)} | Margin: ${profitMargin}%
                    </div>
                    <div style="margin-top:8px;">
                        <button onclick="editProduct('${product._id}')" class="btn-info" style="padding:4px 12px;font-size:11px;">✏️</button>
                        <button onclick="deleteProduct('${product._id}')" class="btn-danger" style="padding:4px 12px;font-size:11px;">🗑️</button>
                    </div>
                </div>
            `;
        });
        grid.innerHTML = html;
    } catch (error) {
        console.error('Failed to load products:', error);
        showNotification('Failed to load products', 'error');
    }
}

async function editProduct(id) {
    try {
        const res = await fetch(`${API}/business/products`);
        const products = await res.json();
        const product = products.find(p => p._id === id);
        
        if (!product) {
            showNotification('❌ Product not found', 'error');
            return;
        }
        
        openEditModal('product', product);
    } catch (error) {
        showNotification('❌ Error loading product', 'error');
    }
}

async function deleteProduct(id) {
    if (!confirm('Delete this product?')) return;
    
    try {
        const res = await fetch(`${API}/business/products/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showNotification('✅ Product deleted', 'success');
            await loadAllData();
        } else {
            showNotification('❌ Delete failed', 'error');
        }
    } catch (error) {
        showNotification('❌ Delete failed', 'error');
    }
}

async function loadProductSelect() {
    try {
        const res = await fetch(`${API}/business/products`);
        const products = await res.json();
        const select = document.getElementById('saleProduct');
        select.innerHTML = '<option value="">Select Product (Optional)</option>';
        if (products && products.length > 0) {
            products.forEach(product => {
                const option = document.createElement('option');
                option.value = product.name;
                option.textContent = `${product.name} (₹${parseFloat(product.price || 0).toFixed(2)})`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Failed to load products:', error);
    }
}

function resetProductForm() {
    document.getElementById('productName').value = '';
    document.getElementById('productPrice').value = '';
    document.getElementById('productCost').value = '';
    document.getElementById('productStock').value = '';
}

// ============ MONTHLY SUMMARY ============
async function loadMonthFilter() {
    try {
        const res = await fetch(`${API}/business/sales`);
        const sales = await res.json();
        const months = new Set();
        
        sales.forEach(sale => {
            const dateStr = excelSerialToDate(sale.date);
            if (dateStr) {
                months.add(dateStr.substring(0, 7));
            }
        });
        
        const select = document.getElementById('filterMonth');
        select.innerHTML = '<option value="">All Months</option>';
        const sortedMonths = Array.from(months).sort().reverse();
        sortedMonths.forEach(month => {
            const option = document.createElement('option');
            option.value = month;
            option.textContent = formatMonthDisplay(month);
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load month filter:', error);
    }
}

async function loadYearFilter() {
    try {
        const res = await fetch(`${API}/business/sales`);
        const sales = await res.json();
        const years = new Set();
        
        sales.forEach(sale => {
            const dateStr = excelSerialToDate(sale.date);
            if (dateStr) {
                years.add(dateStr.substring(0, 4));
            }
        });
        
        const select = document.getElementById('monthlyYearFilter');
        select.innerHTML = '<option value="">All Years</option>';
        const sortedYears = Array.from(years).sort().reverse();
        sortedYears.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load year filter:', error);
    }
}

async function loadMonthlySummary() {
    try {
        const year = document.getElementById('monthlyYearFilter').value || '';
        let url = `${API}/business/monthly-summary`;
        if (year) url += `?year=${year}`;
        
        const res = await fetch(url);
        const data = await res.json();
        
        const grid = document.getElementById('monthlySummaryGrid');
        if (!data || data.length === 0) {
            grid.innerHTML = `
                <p style="color:#718096;text-align:center;padding:40px;width:100%;">
                    <span style="font-size:24px;display:block;margin-bottom:10px;">📊</span>
                    No monthly data available. Start adding sales and expenses.
                </p>
            `;
            return;
        }
        
        let html = '';
        data.forEach(month => {
            const netProfit = month.netProfit || 0;
            const netClass = netProfit >= 0 ? 'positive' : 'negative';
            const finalSalary = month.finalSalary || 0;
            const otherExpenses = month.otherExpenses || 0;
            
            html += `
                <div class="monthly-card" onclick="showMonthDetail('${month.month}')">
                    <div class="month-header">
                        <span class="month-name">${formatMonthDisplay(month.month)}</span>
                        <span class="month-year">${month.month.split('-')[0]}</span>
                    </div>
                    <div class="stat-row">
                        <span class="label">💰 Total Sales</span>
                        <span class="value positive">₹${(month.totalSales || 0).toFixed(2)}</span>
                    </div>
                    <div class="stat-row">
                        <span class="label">📈 Gross Profit</span>
                        <span class="value positive">₹${(month.totalProfit || 0).toFixed(2)}</span>
                    </div>
                    <div class="stat-row">
                        <span class="label">📉 Other Expenses</span>
                        <span class="value negative">₹${otherExpenses.toFixed(2)}</span>
                    </div>
                    <div class="stat-row">
                        <span class="label">👥 Salary (${month.employeeCount || 0} emp)</span>
                        <span class="value negative">₹${finalSalary.toFixed(2)}</span>
                    </div>
                    <div class="net-profit ${netClass}">
                        ${netProfit >= 0 ? '✅' : '❌'} Net Profit: ₹${netProfit.toFixed(2)}
                    </div>
                    <div style="font-size:12px;color:#718096;text-align:center;margin-top:8px;">
                        📊 ${month.saleCount || 0} sales | ${month.expenseCount || 0} expenses
                    </div>
                    <div style="font-size:11px;color:#a0aec0;text-align:center;margin-top:5px;">
                        Click to view details
                    </div>
                </div>
            `;
        });
        grid.innerHTML = html;
    } catch (error) {
        console.error('Failed to load monthly summary:', error);
        document.getElementById('monthlySummaryGrid').innerHTML = `
            <p style="color:#e53e3e;text-align:center;padding:40px;width:100%;">
                ❌ Failed to load monthly data. Error: ${error.message}
            </p>
        `;
        showNotification('❌ Failed to load monthly data: ' + error.message, 'error');
    }
}

// ============ MONTH DETAIL VIEW ============
async function showMonthDetail(month) {
    try {
        const res = await fetch(`${API}/business/month-detail?month=${month}`);
        const data = await res.json();
        
        const container = document.getElementById('monthDetailContainer');
        
        if (!data || !data.sales || data.sales.length === 0) {
            container.innerHTML = `
                <div class="month-detail-view">
                    <p style="color:#718096;text-align:center;padding:20px;">No details available for this month</p>
                </div>
            `;
            return;
        }
        
        const netProfit = data.netProfit || 0;
        const finalSalary = data.finalSalary || 0;
        const otherExpenses = data.otherExpenses || 0;
        
        let html = `
            <div class="month-detail-view">
                <div class="detail-header">
                    <h3>📊 ${formatMonthDisplay(month)} - Detailed View</h3>
                    <button onclick="document.getElementById('monthDetailContainer').innerHTML = ''" class="btn-danger" style="padding:6px 12px;font-size:12px;">✕ Close</button>
                </div>
                
                <div class="detail-grid">
                    <div class="detail-item">
                        <div class="detail-label">💰 Total Sales</div>
                        <div class="detail-value positive">₹${(data.totalSales || 0).toFixed(2)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">📈 Gross Profit</div>
                        <div class="detail-value positive">₹${(data.totalProfit || 0).toFixed(2)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">📉 Other Expenses</div>
                        <div class="detail-value negative">₹${otherExpenses.toFixed(2)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">👥 Salary</div>
                        <div class="detail-value negative">₹${finalSalary.toFixed(2)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">💼 Net Profit</div>
                        <div class="detail-value ${netProfit >= 0 ? 'positive' : 'negative'}">₹${netProfit.toFixed(2)}</div>
                    </div>
                </div>
                
                <h4 style="margin:15px 0 10px;">📋 Sales Transactions</h4>
                <div class="sales-table-wrapper">
                    <table class="sales-table">
                        <thead>
                            <tr>
                                <th class="bulk-checkbox-col">
                                <input type="checkbox" id="salesSelectAll" class="bulk-checkbox" onchange="toggleAllSales(this)">
                                </th>
                                <th>Date</th>
                                <th>Product</th>
                                <th>Total Sale</th>
                                <th>Cash</th>
                                <th>UPI</th>
                                <th>Gross Profit</th>
                                <th>Customer</th>
                                <th>Actions</th>
                            </tr>
                            </thead>
                        <tbody>
        `;
        
        data.sales.forEach(sale => {
            const dateStr = excelSerialToDate(sale.date);
            html += `
                <tr>
                    <td>${formatDate(dateStr)}</td>
                    <td>${sale.product || 'General'}</td>
                    <td class="amount positive">₹${(sale.total || 0).toFixed(2)}</td>
                    <td>₹${(sale.cash || 0).toFixed(2)}</td>
                    <td>₹${(sale.upi || 0).toFixed(2)}</td>
                    <td class="amount positive">₹${(sale.profit || 0).toFixed(2)}</td>
                </tr>
            `;
        });
        
        html += `
                        </tbody>
                    </table>
                </div>
                
                <h4 style="margin:15px 0 10px;">💰 Expenses</h4>
                <div class="sales-table-wrapper">
                    <table class="sales-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Category</th>
                                <th>Description</th>
                                <th>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        if (data.expenses && data.expenses.length > 0) {
            data.expenses.forEach(exp => {
                const dateStr = excelSerialToDate(exp.date);
                const isSalary = exp.category === 'Salary';
                html += `
                    <tr>
                        <td>${formatDate(dateStr)}</td>
                        <td>${isSalary ? '👨‍💼 ' : ''}${exp.category}</td>
                        <td>${exp.description || '-'}</td>
                        <td class="amount negative">₹${(exp.amount || 0).toFixed(2)}</td>
                    </tr>
                `;
            });
        } else {
            html += `
                <tr>
                    <td colspan="4" style="text-align:center;color:#718096;padding:20px;">No expenses recorded</td>
                </tr>
            `;
        }
        
        html += `
                        </tbody>
                    </table>
                </div>
                
                <div style="margin-top:15px;display:flex;gap:10px;">
                    <button onclick="exportMonthCSV('${month}')" class="btn-export">📥 Export Month CSV</button>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
        
        // Scroll to the detail view
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
    } catch (error) {
        console.error('Failed to load month detail:', error);
        showNotification('❌ Failed to load month details', 'error');
    }
}

// ============ EXPORT MONTH CSV ============
async function exportMonthCSV(month) {
    try {
        const res = await fetch(`${API}/business/month-detail?month=${month}`);
        const data = await res.json();
        
        if (!data || !data.sales || data.sales.length === 0) {
            alert('No data to export');
            return;
        }
        
        let csv = `Month: ${formatMonthDisplay(month)}\n\n`;
        csv += '--- SALES ---\n';
        csv += 'Date,Product,Total,Cash,UPI,Profit\n';
        data.sales.forEach(sale => {
            const dateStr = excelSerialToDate(sale.date);
            csv += `${formatDate(dateStr)},${sale.product || 'General'},${sale.total || 0},${sale.cash || 0},${sale.upi || 0},${sale.profit || 0}\n`;
        });
        
        csv += '\n--- EXPENSES ---\n';
        csv += 'Date,Category,Description,Amount\n';
        if (data.expenses && data.expenses.length > 0) {
            data.expenses.forEach(exp => {
                const dateStr = excelSerialToDate(exp.date);
                csv += `${formatDate(dateStr)},${exp.category},${exp.description || ''},${exp.amount || 0}\n`;
            });
        }
        
        csv += '\n--- SUMMARY ---\n';
        csv += `Total Sales,${data.totalSales || 0}\n`;
        csv += `Total Profit,${data.totalProfit || 0}\n`;
        csv += `Total Expenses,${data.totalExpenses || 0}\n`;
        csv += `Net Profit,${(data.totalProfit || 0) - (data.totalExpenses || 0)}\n`;
        
        downloadCSV(csv, `month_${month}.csv`);
        showNotification('✅ Month exported successfully!', 'success');
    } catch (error) {
        showNotification('❌ Export failed', 'error');
    }
}

// ============ REPORTS ============
async function generateReport() {
    const month = document.getElementById('reportMonth').value;
    if (!month) {
        alert('Please select a month');
        return;
    }
    
    try {
        const res = await fetch(`${API}/business/reports?month=${month}`);
        const data = await res.json();
        
        // Monthly Summary
        const monthlyDiv = document.getElementById('monthlySummary');
        monthlyDiv.innerHTML = `
            <div style="padding:10px 0;border-bottom:1px solid #e2e8f0;">
                <strong>Total Sales:</strong> ₹${(data.totalSales || 0).toFixed(2)}
            </div>
            <div style="padding:10px 0;border-bottom:1px solid #e2e8f0;">
                <strong>Gross Profit:</strong> ₹${(data.totalProfit || 0).toFixed(2)}
            </div>
            <div style="padding:10px 0;border-bottom:1px solid #e2e8f0;">
                <strong>Total Expenses:</strong> ₹${(data.totalExpenses || 0).toFixed(2)}
            </div>
            <div style="padding:10px 0;border-bottom:1px solid #e2e8f0;">
                <strong>Salary Expenses:</strong> ₹${(data.salaryExpenses || 0).toFixed(2)}
            </div>
            <div style="padding:10px 0;border-bottom:1px solid #e2e8f0;">
                <strong>Other Expenses:</strong> ₹${(data.otherExpenses || 0).toFixed(2)}
            </div>
            <div style="padding:10px 0;font-size:18px;font-weight:700;color:${(data.netProfit || 0) >= 0 ? '#38a169' : '#e53e3e'};">
                <strong>Net Profit:</strong> ₹${(data.netProfit || 0).toFixed(2)}
            </div>
            <div style="padding:10px 0;font-size:13px;color:#718096;">
                <strong>Profit Margin:</strong> ${data.totalSales > 0 ? ((data.netProfit / data.totalSales) * 100).toFixed(1) : 0}%
            </div>
        `;
        
        // Category Summary
        const categoryDiv = document.getElementById('categorySummary');
        if (data.categoryExpenses && Object.keys(data.categoryExpenses).length > 0) {
            let catHtml = '';
            const sorted = Object.entries(data.categoryExpenses).sort((a, b) => b[1] - a[1]);
            sorted.forEach(([category, amount]) => {
                const percentage = data.totalExpenses > 0 ? ((amount / data.totalExpenses) * 100).toFixed(1) : 0;
                const isSalary = category === 'Salary';
                catHtml += `
                    <div style="padding:8px 0;border-bottom:1px solid #f0f4f8;display:flex;justify-content:space-between;">
                        <span>${isSalary ? '👨‍💼 ' : ''}${category}</span>
                        <span style="color:#e53e3e;">₹${(amount || 0).toFixed(2)} (${percentage}%)</span>
                    </div>
                `;
            });
            categoryDiv.innerHTML = catHtml;
        } else {
            categoryDiv.innerHTML = '<p style="color:#718096;">No expenses for this month</p>';
        }
        
        // Detailed Report
        const reportContent = document.getElementById('reportContent');
        if (data.transactions && data.transactions.length > 0) {
            let reportHtml = `
                <table class="sales-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Category/Product</th>
                            <th>Description</th>
                            <th>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            data.transactions.forEach(trans => {
                const isExpense = trans.type === 'expense';
                const dateStr = excelSerialToDate(trans.date);
                reportHtml += `
                    <tr>
                        <td>${formatDate(dateStr)}</td>
                        <td>${isExpense ? '💰 Expense' : '💵 Sale'}</td>
                        <td>${trans.category || trans.product || '-'}</td>
                        <td>${trans.description || trans.customer || '-'}</td>
                        <td class="amount ${isExpense ? 'negative' : 'positive'}">
                            ${isExpense ? '-' : '+'} ₹${(trans.amount || 0).toFixed(2)}
                        </td>
                    </tr>
                `;
            });
            reportHtml += '</tbody></table>';
            reportContent.innerHTML = reportHtml;
        } else {
            reportContent.innerHTML = '<p style="color:#718096;">No transactions for this month</p>';
        }
    } catch (error) {
        console.error('Failed to generate report:', error);
        showNotification('Failed to generate report', 'error');
    }
}

async function loadYTDSummary() {
    try {
        const res = await fetch(`${API}/business/ytd-summary`);
        const data = await res.json();
        
        const container = document.getElementById('ytdSummary');
        container.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:15px;">
                <div style="text-align:center;padding:15px;background:#f7fafc;border-radius:8px;">
                    <div style="font-size:12px;color:#718096;">Total Sales</div>
                    <div style="font-size:20px;font-weight:700;color:#38a169;">₹${(data.totalSales || 0).toFixed(2)}</div>
                </div>
                <div style="text-align:center;padding:15px;background:#f7fafc;border-radius:8px;">
                    <div style="font-size:12px;color:#718096;">Total Profit</div>
                    <div style="font-size:20px;font-weight:700;color:#38a169;">₹${(data.totalProfit || 0).toFixed(2)}</div>
                </div>
                <div style="text-align:center;padding:15px;background:#f7fafc;border-radius:8px;">
                    <div style="font-size:12px;color:#718096;">Total Expenses</div>
                    <div style="font-size:20px;font-weight:700;color:#e53e3e;">₹${(data.totalExpenses || 0).toFixed(2)}</div>
                </div>
                <div style="text-align:center;padding:15px;background:#f7fafc;border-radius:8px;">
                    <div style="font-size:12px;color:#718096;">Net Profit</div>
                    <div style="font-size:20px;font-weight:700;color:${(data.netProfit || 0) >= 0 ? '#38a169' : '#e53e3e'};">₹${(data.netProfit || 0).toFixed(2)}</div>
                </div>
                <div style="text-align:center;padding:15px;background:#f7fafc;border-radius:8px;">
                    <div style="font-size:12px;color:#718096;">Total Transactions</div>
                    <div style="font-size:20px;font-weight:700;color:#2c5282;">${data.totalTransactions || 0}</div>
                </div>
                <div style="text-align:center;padding:15px;background:#f7fafc;border-radius:8px;">
                    <div style="font-size:12px;color:#718096;">Profit Margin</div>
                    <div style="font-size:20px;font-weight:700;color:#805ad5;">${data.totalSales > 0 ? ((data.netProfit / data.totalSales) * 100).toFixed(1) : 0}%</div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Failed to load YTD summary:', error);
    }
}

// ============ EXPORT FUNCTIONS ============
async function exportOverviewCSV() {
    const month = document.getElementById('overviewMonth').value;
    if (!month) {
        alert('Please select a month');
        return;
    }
    
    try {
        const businessRes = await fetch(`${API}/business/reports?month=${month}`);
        const businessData = await businessRes.json();
        
        const slipsRes = await fetch(`${API}/all-slips?month=${month}`);
        const slips = await slipsRes.json();
        
        let csv = `Monthly Overview - ${formatMonthDisplay(month)}\n\n`;
        csv += 'Metric,Amount\n';
        csv += `Total Sales,${businessData.totalSales || 0}\n`;
        csv += `Gross Profit (20%),${businessData.totalProfit || 0}\n`;
        csv += `Other Expenses,${(businessData.totalExpenses || 0) - (businessData.salaryExpenses || 0)}\n`;
        csv += `Salary Deductions,${businessData.salaryExpenses || 0}\n`;
        csv += `Net Profit,${(businessData.totalProfit || 0) - (businessData.totalExpenses || 0)}\n\n`;
        
        csv += 'Employee Salaries\n';
        csv += 'Employee,Base Salary,Deduction,Bonus,Net Salary\n';
        
        for (const slip of slips) {
            const slipDetailRes = await fetch(`${API}/get-slip/${slip.empId}/${slip.month}`);
            if (slipDetailRes.ok) {
                const slipDetail = await slipDetailRes.json();
                const baseSalary = parseFloat(slipDetail.baseSalary) || 0;
                const daysInMonth = slipDetail.calendar ? slipDetail.calendar.length : 30;
                const dailyRate = baseSalary / daysInMonth;
                
                let absentDays = 0;
                let halfDays = 0;
                slipDetail.calendar.forEach(day => {
                    if (day.status === 'Absent' || day.status === 'NA') absentDays++;
                    else if (day.status === 'HalfDay') halfDays += 0.5;
                });
                
                const deduction = (absentDays + halfDays) * dailyRate;
                let totalBonus = 0;
                if (slipDetail.bonusData) {
                    slipDetail.bonusData.forEach(b => totalBonus += parseFloat(b.amount) || 0);
                }
                
                const netSalary = baseSalary - deduction + totalBonus;
                csv += `${slip.employeeName},${baseSalary},${deduction},${totalBonus},${netSalary}\n`;
            }
        }
        
        downloadCSV(csv, `monthly_overview_${month}.csv`);
        showNotification('✅ Overview exported successfully!', 'success');
    } catch (error) {
        showNotification('❌ Export failed', 'error');
    }
}

async function exportSalesCSV() {
    try {
        const res = await fetch(`${API}/business/sales`);
        const sales = await res.json();
        
        if (!sales || sales.length === 0) {
            alert('No sales data to export');
            return;
        }
        
        let csv = 'Date,Product,Total,Cash,UPI,Profit,Customer,Note\n';
        sales.forEach(sale => {
            const dateStr = excelSerialToDate(sale.date);
            csv += `${formatDate(dateStr)},${sale.product || 'General'},${sale.total || 0},${sale.cash || 0},${sale.upi || 0},${sale.profit || 0},${sale.customer || ''},${sale.note || ''}\n`;
        });
        
        downloadCSV(csv, 'sales_export.csv');
        showNotification('✅ Sales exported successfully!', 'success');
    } catch (error) {
        showNotification('❌ Export failed', 'error');
    }
}

async function exportExpensesCSV() {
    try {
        const res = await fetch(`${API}/business/expenses`);
        const expenses = await res.json();
        
        if (!expenses || expenses.length === 0) {
            alert('No expenses data to export');
            return;
        }
        
        let csv = 'Date,Category,Description,Amount,PaymentMode\n';
        expenses.forEach(exp => {
            const dateStr = excelSerialToDate(exp.date);
            csv += `${formatDate(dateStr)},${exp.category || ''},${exp.description || ''},${exp.amount || 0},${exp.paymentMode || 'Cash'}\n`;
        });
        
        downloadCSV(csv, 'expenses_export.csv');
        showNotification('✅ Expenses exported successfully!', 'success');
    } catch (error) {
        showNotification('❌ Export failed', 'error');
    }
}

async function exportMonthlyCSV() {
    try {
        const year = document.getElementById('monthlyYearFilter').value || '';
        let url = `${API}/business/monthly-summary`;
        if (year) url += `?year=${year}`;
        
        const res = await fetch(url);
        const data = await res.json();
        
        if (!data || data.length === 0) {
            alert('No monthly data to export');
            return;
        }
        
        let csv = 'Month,Sales,Profit,Expenses,Net Profit,Transactions\n';
        data.forEach(month => {
            const netProfit = month.totalProfit - month.totalExpenses;
            csv += `${formatMonthDisplay(month.month)},${month.totalSales || 0},${month.totalProfit || 0},${month.totalExpenses || 0},${netProfit.toFixed(2)},${month.saleCount || 0}\n`;
        });
        
        downloadCSV(csv, 'monthly_summary.csv');
        showNotification('✅ Monthly summary exported!', 'success');
    } catch (error) {
        showNotification('❌ Export failed', 'error');
    }
}

async function exportFullReportCSV() {
    const month = document.getElementById('reportMonth').value;
    if (!month) {
        alert('Please select a month first');
        return;
    }
    
    try {
        const res = await fetch(`${API}/business/reports?month=${month}`);
        const data = await res.json();
        
        if (!data.transactions || data.transactions.length === 0) {
            alert('No data to export');
            return;
        }
        
        let csv = 'Date,Type,Category,Description,Amount\n';
        data.transactions.forEach(trans => {
            const dateStr = excelSerialToDate(trans.date);
            csv += `${formatDate(dateStr)},${trans.type},${trans.category || trans.product || '-'},${trans.description || trans.customer || '-'},${trans.amount || 0}\n`;
        });
        
        csv += '\n\nSUMMARY\n';
        csv += `Total Sales,${data.totalSales || 0}\n`;
        csv += `Total Profit,${data.totalProfit || 0}\n`;
        csv += `Total Expenses,${data.totalExpenses || 0}\n`;
        csv += `Salary Expenses,${data.salaryExpenses || 0}\n`;
        csv += `Other Expenses,${data.otherExpenses || 0}\n`;
        csv += `Net Profit,${data.netProfit || 0}\n`;
        
        downloadCSV(csv, `report_${month}.csv`);
        showNotification('✅ Report exported successfully!', 'success');
    } catch (error) {
        showNotification('❌ Export failed', 'error');
    }
}

function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ============ EDIT MODAL ============
let editType = '';
let editId = '';

function openEditModal(type, data) {
    editType = type;
    editId = data._id;
    
    const modal = document.getElementById('editModal');
    const fields = document.getElementById('editFields');
    
    let html = '';
    
    if (type === 'sale') {
        const dateStr = excelSerialToDate(data.date);
        html = `
            <div class="form-row">
                <input type="date" id="editDate" value="${dateStr}" required>
            </div>
            <div class="form-row">
                <input type="number" id="editTotal" value="${data.total}" placeholder="Total Amount" step="0.01" required>
                <input type="number" id="editCash" value="${data.cash}" placeholder="Cash" step="0.01" required>
                <input type="number" id="editUPI" value="${data.upi}" placeholder="UPI" step="0.01" required>
            </div>
            <div class="form-row">
                <input type="text" id="editProduct" value="${data.product || ''}" placeholder="Product">
                <input type="text" id="editCustomer" value="${data.customer || ''}" placeholder="Customer">
                <input type="text" id="editNote" value="${data.note || ''}" placeholder="Note">
            </div>
            <input type="hidden" id="editProfit" value="${data.profit}">
        `;
    } else if (type === 'expense') {
        const dateStr = excelSerialToDate(data.date);
        html = `
            <div class="form-row">
                <input type="date" id="editDate" value="${dateStr}" required>
            </div>
            <div class="form-row">
                <input type="number" id="editAmount" value="${data.amount}" placeholder="Amount" step="0.01" required>
                <input type="text" id="editCategory" value="${data.category}" placeholder="Category" required>
            </div>
            <div class="form-row">
                <input type="text" id="editDescription" value="${data.description || ''}" placeholder="Description">
                <select id="editPaymentMode">
                    <option value="Cash" ${data.paymentMode === 'Cash' ? 'selected' : ''}>Cash</option>
                    <option value="UPI" ${data.paymentMode === 'UPI' ? 'selected' : ''}>UPI</option>
                    <option value="Bank Transfer" ${data.paymentMode === 'Bank Transfer' ? 'selected' : ''}>Bank Transfer</option>
                </select>
            </div>
        `;
    } else if (type === 'product') {
        html = `
            <div class="form-row">
                <input type="text" id="editName" value="${data.name}" placeholder="Product Name" required>
            </div>
            <div class="form-row">
                <input type="number" id="editPrice" value="${data.price}" placeholder="Selling Price" step="0.01" required>
                <input type="number" id="editCost" value="${data.cost}" placeholder="Cost Price" step="0.01" required>
                <input type="number" id="editStock" value="${data.stock || 0}" placeholder="Stock" step="1">
            </div>
        `;
    }
    
    fields.innerHTML = html;
    modal.classList.add('active');
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
    editType = '';
    editId = '';
}

async function saveEdit() {
    if (!editType || !editId) return;
    
    let data = {};
    
    if (editType === 'sale') {
        const total = parseFloat(document.getElementById('editTotal').value) || 0;
        const cash = parseFloat(document.getElementById('editCash').value) || 0;
        const upi = parseFloat(document.getElementById('editUPI').value) || 0;
        
        if (cash + upi !== total) {
            alert(`Total (₹${total}) should equal Cash (₹${cash}) + UPI (₹${upi})`);
            return;
        }
        
        data = {
            date: document.getElementById('editDate').value,
            total: total,
            cash: cash,
            upi: upi,
            profit: total * 0.20,
            product: document.getElementById('editProduct').value,
            customer: document.getElementById('editCustomer').value,
            note: document.getElementById('editNote').value
        };
    } else if (editType === 'expense') {
        data = {
            date: document.getElementById('editDate').value,
            amount: parseFloat(document.getElementById('editAmount').value) || 0,
            category: document.getElementById('editCategory').value,
            description: document.getElementById('editDescription').value,
            paymentMode: document.getElementById('editPaymentMode').value
        };
    } else if (editType === 'product') {
        data = {
            name: document.getElementById('editName').value,
            price: parseFloat(document.getElementById('editPrice').value) || 0,
            cost: parseFloat(document.getElementById('editCost').value) || 0,
            stock: parseInt(document.getElementById('editStock').value) || 0
        };
    }
    
    try {
        const res = await fetch(`${API}/business/${editType}s/${editId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (res.ok) {
            showNotification('✅ Record updated successfully!', 'success');
            closeEditModal();
            await loadAllData();
        } else {
            const error = await res.json();
            showNotification('❌ Failed to update record: ' + (error.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        showNotification('❌ Error updating record', 'error');
    }
}

// ============ IMPORT FUNCTIONS ============
async function importSalesExcel() {
    const fileInput = document.getElementById('salesExcelInput');
    if (!fileInput.files || !fileInput.files[0]) {
        alert('Please select an Excel file');
        return;
    }
    
    try {
        const file = fileInput.files[0];
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                const data = e.target.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                
                if (!jsonData || jsonData.length === 0) {
                    alert('No data found in Excel file');
                    return;
                }
                
                importType = 'sales';
                importData = jsonData.map(row => {
                    let date = row.Date || row.date || '';
                    if (typeof date === 'number') {
                        date = excelSerialToDate(date);
                    }
                    
                    return {
                        date: date,
                        total: parseFloat(row.Total || row.total || 0),
                        cash: parseFloat(row.Cash || row.cash || 0),
                        upi: parseFloat(row.UPI || row.upi || 0),
                        product: row.Product || row.product || '',
                        customer: row.Customer || row.customer || '',
                        note: row.Note || row.note || ''
                    };
                });
                
                importData = importData.filter(item => item.date && item.total > 0);
                
                if (importData.length === 0) {
                    alert('No valid sales data found. Please check your Excel file.');
                    return;
                }
                
                showImportReview(importData, 'sales');
            } catch (error) {
                alert('Error reading Excel file: ' + error.message);
                console.error(error);
            }
        };
        
        reader.readAsBinaryString(file);
    } catch (error) {
        alert('Error importing file: ' + error.message);
        console.error(error);
    }
}

async function importExpensesExcel() {
    const fileInput = document.getElementById('expensesExcelInput');
    if (!fileInput.files || !fileInput.files[0]) {
        alert('Please select an Excel file');
        return;
    }
    
    try {
        const file = fileInput.files[0];
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                const data = e.target.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                
                if (!jsonData || jsonData.length === 0) {
                    alert('No data found in Excel file');
                    return;
                }
                
                importType = 'expenses';
                importData = jsonData.map(row => {
                    let date = row.Date || row.date || '';
                    if (typeof date === 'number') {
                        date = excelSerialToDate(date);
                    }
                    
                    return {
                        date: date,
                        amount: parseFloat(row.Amount || row.amount || 0),
                        category: row.Category || row.category || '',
                        description: row.Description || row.description || '',
                        paymentMode: row.PaymentMode || row.paymentMode || 'Cash'
                    };
                });
                
                importData = importData.filter(item => item.date && item.amount > 0 && item.category);
                
                if (importData.length === 0) {
                    alert('No valid expense data found. Please check your Excel file.');
                    return;
                }
                
                showImportReview(importData, 'expenses');
            } catch (error) {
                alert('Error reading Excel file: ' + error.message);
                console.error(error);
            }
        };
        
        reader.readAsBinaryString(file);
    } catch (error) {
        alert('Error importing file: ' + error.message);
        console.error(error);
    }
}

async function importProductsExcel() {
    const fileInput = document.getElementById('productsExcelInput');
    if (!fileInput.files || !fileInput.files[0]) {
        alert('Please select an Excel file');
        return;
    }
    
    try {
        const file = fileInput.files[0];
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                const data = e.target.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                
                if (!jsonData || jsonData.length === 0) {
                    alert('No data found in Excel file');
                    return;
                }
                
                importType = 'products';
                importData = jsonData.map(row => ({
                    name: row.Name || row.name || '',
                    price: parseFloat(row.Price || row.price || 0),
                    cost: parseFloat(row.Cost || row.cost || 0),
                    stock: parseInt(row.Stock || row.stock || 0)
                }));
                
                importData = importData.filter(item => item.name && item.price > 0);
                
                if (importData.length === 0) {
                    alert('No valid product data found. Please check your Excel file.');
                    return;
                }
                
                showImportReview(importData, 'products');
            } catch (error) {
                alert('Error reading Excel file: ' + error.message);
                console.error(error);
            }
        };
        
        reader.readAsBinaryString(file);
    } catch (error) {
        alert('Error importing file: ' + error.message);
        console.error(error);
    }
}

function showImportReview(data, type) {
    const modal = document.getElementById('importModal');
    const container = document.getElementById('reviewContainer');
    
    if (!data || data.length === 0) {
        alert('No valid data found to import');
        return;
    }
    
    let html = `<p style="color:#718096;margin-bottom:15px;">Found <strong>${data.length}</strong> records to import</p>`;
    
    data.forEach((item, index) => {
        let details = '';
        if (type === 'sales') {
            details = `Total: ₹${item.total} | Cash: ₹${item.cash} | UPI: ₹${item.upi}`;
        } else if (type === 'expenses') {
            details = `Amount: ₹${item.amount} | Category: ${item.category}`;
        } else if (type === 'products') {
            details = `Price: ₹${item.price} | Cost: ₹${item.cost} | Stock: ${item.stock}`;
        }
        
        html += `
            <div class="review-item">
                <div>
                    <strong>#${index + 1}</strong>
                    <div style="font-size:13px;color:#4a5568;">
                        ${type === 'sales' ? item.date : type === 'expenses' ? item.date : item.name}
                    </div>
                    <div style="font-size:12px;color:#718096;">${details}</div>
                </div>
                <span class="status pending">⏳ Pending</span>
            </div>
        `;
    });
    
    container.innerHTML = html;
    modal.classList.add('active');
}

function closeImportModal() {
    document.getElementById('importModal').classList.remove('active');
    importData = [];
    importType = '';
}

async function confirmImport() {
    if (!importData || importData.length === 0) {
        alert('No data to import');
        return;
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    showNotification(`⏳ Importing ${importData.length} records...`, 'success');
    
    for (const item of importData) {
        try {
            let endpoint = '';
            let data = {};
            
            if (importType === 'sales') {
                endpoint = 'sales';
                data = {
                    ...item,
                    profit: item.total * 0.20
                };
            } else if (importType === 'expenses') {
                endpoint = 'expenses';
                data = item;
            } else if (importType === 'products') {
                endpoint = 'products';
                data = item;
            }
            
            const res = await fetch(`${API}/business/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            if (res.ok) {
                successCount++;
            } else {
                errorCount++;
                console.error('Import failed for item:', item);
            }
        } catch (error) {
            errorCount++;
            console.error('Import error for item:', item, error);
        }
    }
    
    closeImportModal();
    
    if (successCount > 0 && errorCount === 0) {
        showNotification(`✅ All ${successCount} records imported successfully!`, 'success');
    } else if (successCount > 0 && errorCount > 0) {
        showNotification(`⚠️ ${successCount} imported, ${errorCount} failed.`, 'error');
    } else {
        showNotification(`❌ Import failed! ${errorCount} records failed.`, 'error');
    }
    
    setTimeout(async () => {
        await loadAllData();
        await loadMonthlySummary();
        console.log('✅ Data reloaded after import');
    }, 1000);
}

// ============ UTILITY FUNCTIONS ============
function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) {
        return dateStr;
    }
}

function formatMonthDisplay(monthStr) {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(month)-1]} ${year}`;
}

function showNotification(message, type = 'success') {
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
    }, 5000);
}

// Refresh button handlers
async function refreshSales() {
    await loadSales();
    await loadDashboard();
    showNotification('🔄 Sales data refreshed!', 'success');
}

async function refreshExpenses() {
    await loadExpenses();
    await loadDashboard();
    showNotification('🔄 Expenses data refreshed!', 'success');
}

async function refreshProducts() {
    await loadProducts();
    showNotification('🔄 Products data refreshed!', 'success');
}

// ============ BULK DELETE — SALES / EXPENSES / PRODUCTS ============

// --- Selection state ---
const selectedSales = new Set();
const selectedExpenses = new Set();
const selectedProducts = new Set();

// ============ SALES ============
function toggleSaleSelect(id, cb) {
  if (cb.checked) selectedSales.add(id);
  else selectedSales.delete(id);
  updateSalesBulkBar();
}

function toggleAllSales(masterCb) {
  const cbs = document.querySelectorAll('.sale-checkbox');
  selectedSales.clear();
  cbs.forEach(cb => {
    cb.checked = masterCb.checked;
    if (masterCb.checked) selectedSales.add(cb.dataset.id);
  });
  updateSalesBulkBar();
}

function updateSalesBulkBar() {
  const bar = document.getElementById('salesBulkBar');
  const countEl = document.getElementById('salesSelectedCount');
  if (!bar) return;
  if (selectedSales.size > 0) {
    bar.style.display = 'flex';
    countEl.textContent = `${selectedSales.size} selected`;
  } else {
    bar.style.display = 'none';
  }
}

function clearSalesSelection() {
  selectedSales.clear();
  document.querySelectorAll('.sale-checkbox').forEach(cb => cb.checked = false);
  const master = document.getElementById('salesSelectAll');
  if (master) master.checked = false;
  updateSalesBulkBar();
}

async function deleteSelectedSales() {
  if (selectedSales.size === 0) return;
  if (!confirm(`Delete ${selectedSales.size} sale(s)? This cannot be undone.`)) return;

  try {
    const res = await fetch(`${API}/business/sales/bulk-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedSales) })
    });
    const data = await res.json();
    if (!res.ok) return showNotification('❌ ' + (data.error || 'Delete failed'), 'error');
    showNotification(`✅ ${data.deletedCount} sale(s) deleted`, 'success');
    clearSalesSelection();
    await loadAllData();
  } catch (err) {
    showNotification('❌ Delete failed', 'error');
  }
}

// ============ EXPENSES ============
function toggleExpenseSelect(id, cb) {
  if (cb.checked) selectedExpenses.add(id);
  else selectedExpenses.delete(id);
  updateExpensesBulkBar();
}

function toggleAllExpenses(masterCb) {
  const cbs = document.querySelectorAll('.expense-checkbox');
  selectedExpenses.clear();
  cbs.forEach(cb => {
    cb.checked = masterCb.checked;
    if (masterCb.checked) selectedExpenses.add(cb.dataset.id);
  });
  updateExpensesBulkBar();
}

function updateExpensesBulkBar() {
  const bar = document.getElementById('expensesBulkBar');
  const countEl = document.getElementById('expensesSelectedCount');
  if (!bar) return;
  if (selectedExpenses.size > 0) {
    bar.style.display = 'flex';
    countEl.textContent = `${selectedExpenses.size} selected`;
  } else {
    bar.style.display = 'none';
  }
}

function clearExpensesSelection() {
  selectedExpenses.clear();
  document.querySelectorAll('.expense-checkbox').forEach(cb => cb.checked = false);
  const master = document.getElementById('expensesSelectAll');
  if (master) master.checked = false;
  updateExpensesBulkBar();
}

async function deleteSelectedExpenses() {
  if (selectedExpenses.size === 0) return;
  if (!confirm(`Delete ${selectedExpenses.size} expense(s)? This cannot be undone.`)) return;

  try {
    const res = await fetch(`${API}/business/expenses/bulk-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedExpenses) })
    });
    const data = await res.json();
    if (!res.ok) return showNotification('❌ ' + (data.error || 'Delete failed'), 'error');
    showNotification(`✅ ${data.deletedCount} expense(s) deleted`, 'success');
    clearExpensesSelection();
    await loadAllData();
  } catch (err) {
    showNotification('❌ Delete failed', 'error');
  }
}

// ============ PRODUCTS ============
function toggleProductSelect(id, cb) {
  if (cb.checked) selectedProducts.add(id);
  else selectedProducts.delete(id);
  updateProductsBulkBar();
}

function toggleAllProducts(masterCb) {
  const cbs = document.querySelectorAll('.product-checkbox');
  selectedProducts.clear();
  cbs.forEach(cb => {
    cb.checked = masterCb.checked;
    if (masterCb.checked) selectedProducts.add(cb.dataset.id);
  });
  updateProductsBulkBar();
}

function updateProductsBulkBar() {
  const bar = document.getElementById('productsBulkBar');
  const countEl = document.getElementById('productsSelectedCount');
  if (!bar) return;
  if (selectedProducts.size > 0) {
    bar.style.display = 'flex';
    countEl.textContent = `${selectedProducts.size} selected`;
  } else {
    bar.style.display = 'none';
  }
}

function clearProductsSelection() {
  selectedProducts.clear();
  document.querySelectorAll('.product-checkbox').forEach(cb => cb.checked = false);
  const master = document.getElementById('productsSelectAll');
  if (master) master.checked = false;
  updateProductsBulkBar();
}

async function deleteSelectedProducts() {
  if (selectedProducts.size === 0) return;
  if (!confirm(`Delete ${selectedProducts.size} product(s)? This cannot be undone.`)) return;

  try {
    const res = await fetch(`${API}/business/products/bulk-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedProducts) })
    });
    const data = await res.json();
    if (!res.ok) return showNotification('❌ ' + (data.error || 'Delete failed'), 'error');
    showNotification(`✅ ${data.deletedCount} product(s) deleted`, 'success');
    clearProductsSelection();
    await loadAllData();
  } catch (err) {
    showNotification('❌ Delete failed', 'error');
  }
}