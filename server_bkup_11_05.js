const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Data folders
const DATA_DIR = path.join(__dirname, 'data');
const EMPLOYEES_DIR = path.join(DATA_DIR, 'employees');
const SLIPS_DIR = path.join(DATA_DIR, 'slips');
const VERSIONS_DIR = path.join(DATA_DIR, 'versions');

// ============ BUSINESS DATA FOLDERS ============
const BUSINESS_DIR = path.join(DATA_DIR, 'business');
const SALES_FILE = path.join(BUSINESS_DIR, 'sales.json');
const EXPENSES_FILE = path.join(BUSINESS_DIR, 'expenses.json');
const PRODUCTS_FILE = path.join(BUSINESS_DIR, 'products.json');

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
async function init() {
    try {
        // Employee data folders
        await fs.mkdir(EMPLOYEES_DIR, { recursive: true });
        await fs.mkdir(SLIPS_DIR, { recursive: true });
        await fs.mkdir(VERSIONS_DIR, { recursive: true });
        
        // Business data folders
        await fs.mkdir(BUSINESS_DIR, { recursive: true });
        
        // Initialize business data files if they don't exist
        for (const file of [SALES_FILE, EXPENSES_FILE, PRODUCTS_FILE]) {
            try {
                await fs.access(file);
            } catch (e) {
                await fs.writeFile(file, JSON.stringify([], null, 2));
            }
        }
        
        console.log('✅ All data folders ready');
    } catch (error) {
        console.error('Error creating directories:', error);
    }
}

// ============ BUSINESS READ/WRITE HELPERS ============
async function readSales() {
    try {
        const data = await fs.readFile(SALES_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

async function writeSales(sales) {
    await fs.writeFile(SALES_FILE, JSON.stringify(sales, null, 2));
}

async function readExpenses() {
    try {
        const data = await fs.readFile(EXPENSES_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

async function writeExpenses(expenses) {
    await fs.writeFile(EXPENSES_FILE, JSON.stringify(expenses, null, 2));
}

async function readProducts() {
    try {
        const data = await fs.readFile(PRODUCTS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

async function writeProducts(products) {
    await fs.writeFile(PRODUCTS_FILE, JSON.stringify(products, null, 2));
}

// ============ EMPLOYEE ROUTES ============

app.post('/api/save-employee', async (req, res) => {
    try {
        const employee = req.body;
        if (!employee.empId) {
            return res.status(400).json({ error: 'Employee ID is required' });
        }
        const filePath = path.join(EMPLOYEES_DIR, `${employee.empId}.json`);
        await fs.writeFile(filePath, JSON.stringify(employee, null, 2));
        console.log(`💾 Employee saved: ${employee.empId}`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/get-employee/:empId', async (req, res) => {
    try {
        const filePath = path.join(EMPLOYEES_DIR, `${req.params.empId}.json`);
        const data = await fs.readFile(filePath, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        res.json(null);
    }
});

app.get('/api/all-employees', async (req, res) => {
    try {
        const files = await fs.readdir(EMPLOYEES_DIR);
        const employees = [];
        for (const file of files) {
            if (file.endsWith('.json')) {
                const data = await fs.readFile(path.join(EMPLOYEES_DIR, file), 'utf8');
                employees.push(JSON.parse(data));
            }
        }
        res.json(employees);
    } catch (error) {
        res.json([]);
    }
});

app.delete('/api/delete-employee/:empId', async (req, res) => {
    try {
        const empId = req.params.empId;
        
        try {
            await fs.unlink(path.join(EMPLOYEES_DIR, `${empId}.json`));
        } catch (e) {
            console.log('Employee file not found');
        }
        
        try {
            await fs.rm(path.join(SLIPS_DIR, empId), { recursive: true, force: true });
        } catch (e) {
            console.log('Slips directory not found');
        }
        
        try {
            await fs.rm(path.join(VERSIONS_DIR, empId), { recursive: true, force: true });
        } catch (e) {
            console.log('Versions directory not found');
        }
        
        console.log(`🗑️ Employee deleted: ${empId}`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ SALARY SLIP ROUTES ============

app.post('/api/save-slip', async (req, res) => {
    try {
        const { empId, month, slipData } = req.body;
        
        if (!empId || !month) {
            return res.status(400).json({ error: 'Employee ID and month are required' });
        }
        
        const slipDir = path.join(SLIPS_DIR, empId);
        const versionDir = path.join(VERSIONS_DIR, empId, month);
        await fs.mkdir(slipDir, { recursive: true });
        await fs.mkdir(versionDir, { recursive: true });
        
        let version = 1;
        try {
            const files = await fs.readdir(versionDir);
            const versions = files
                .filter(f => f.startsWith('v') && f.endsWith('.json'))
                .map(f => parseInt(f.replace('v', '').replace('.json', '')))
                .filter(v => !isNaN(v));
            
            if (versions.length > 0) {
                version = Math.max(...versions) + 1;
            }
        } catch (error) {
            version = 1;
        }
        
        slipData.version = version;
        slipData.savedAt = new Date().toISOString();
        slipData.empId = empId;
        slipData.month = month;
        
        const slipPath = path.join(slipDir, `${month}.json`);
        await fs.writeFile(slipPath, JSON.stringify(slipData, null, 2));
        
        const versionPath = path.join(versionDir, `v${version}.json`);
        const versionData = {
            version: version,
            month: month,
            empId: empId,
            employeeName: slipData.employeeName || '',
            baseSalary: slipData.baseSalary,
            calendar: slipData.calendar || [],
            bonusEnabled: slipData.bonusEnabled || false,
            bonusData: slipData.bonusData || [],
            notes: slipData.notes || '',
            attendanceSummary: calculateAttendanceSummary(slipData.calendar),
            savedAt: slipData.savedAt
        };
        
        await fs.writeFile(versionPath, JSON.stringify(versionData, null, 2));
        
        console.log(`💾 Slip saved: ${empId}/${month} v${version}`);
        res.json({ 
            success: true, 
            version: version,
            message: `Saved as version ${version}` 
        });
    } catch (error) {
        console.error('Error saving slip:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/get-slip/:empId/:month', async (req, res) => {
    try {
        const { empId, month } = req.params;
        const filePath = path.join(SLIPS_DIR, empId, `${month}.json`);
        const data = await fs.readFile(filePath, 'utf8');
        console.log(`📖 Loaded slip: ${empId}/${month}`);
        res.json(JSON.parse(data));
    } catch (error) {
        console.log(`❌ Slip not found: ${empId}/${month}`);
        res.status(404).json({ error: 'Slip not found' });
    }
});

app.get('/api/get-versions/:empId/:month', async (req, res) => {
    try {
        const { empId, month } = req.params;
        const versionDir = path.join(VERSIONS_DIR, empId, month);
        
        const files = await fs.readdir(versionDir);
        const versions = [];
        
        for (const file of files) {
            if (file.startsWith('v') && file.endsWith('.json')) {
                const data = await fs.readFile(path.join(versionDir, file), 'utf8');
                const version = JSON.parse(data);
                version.version = parseInt(file.replace('v', '').replace('.json', ''));
                versions.push(version);
            }
        }
        
        versions.sort((a, b) => b.version - a.version);
        console.log(`📋 Found ${versions.length} versions for ${empId}/${month}`);
        res.json(versions);
    } catch (error) {
        res.json([]);
    }
});

app.get('/api/get-version/:empId/:month/:version', async (req, res) => {
    try {
        const { empId, month, version } = req.params;
        const filePath = path.join(VERSIONS_DIR, empId, month, `v${version}.json`);
        const data = await fs.readFile(filePath, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(404).json({ error: 'Version not found' });
    }
});

app.get('/api/get-employee-months/:empId', async (req, res) => {
    try {
        const { empId } = req.params;
        const months = new Set();
        
        try {
            const slipDir = path.join(SLIPS_DIR, empId);
            const slipFiles = await fs.readdir(slipDir);
            slipFiles.forEach(f => {
                if (f.endsWith('.json')) {
                    months.add(f.replace('.json', ''));
                }
            });
        } catch (e) {}

        try {
            const versionBaseDir = path.join(VERSIONS_DIR, empId);
            const monthDirs = await fs.readdir(versionBaseDir);
            monthDirs.forEach(m => months.add(m));
        } catch (e) {}
        
        res.json(Array.from(months).sort().reverse());
    } catch (error) {
        res.json([]);
    }
});

app.get('/api/all-slips', async (req, res) => {
    try {
        const allSlips = [];
        
        try {
            const empDirs = await fs.readdir(SLIPS_DIR);
            
            for (const empId of empDirs) {
                const empDir = path.join(SLIPS_DIR, empId);
                const stat = await fs.stat(empDir);
                
                if (stat.isDirectory()) {
                    const files = await fs.readdir(empDir);
                    
                    for (const file of files) {
                        if (file.endsWith('.json')) {
                            try {
                                const data = await fs.readFile(path.join(empDir, file), 'utf8');
                                const slipData = JSON.parse(data);
                                
                                let employeeName = slipData.employeeName || '';
                                if (!employeeName) {
                                    try {
                                        const empData = await fs.readFile(
                                            path.join(EMPLOYEES_DIR, `${empId}.json`), 'utf8'
                                        );
                                        employeeName = JSON.parse(empData).name || '';
                                    } catch (e) {}
                                }
                                
                                allSlips.push({
                                    empId: empId,
                                    employeeName: employeeName,
                                    month: slipData.month,
                                    baseSalary: slipData.baseSalary,
                                    version: slipData.version || 1,
                                    savedAt: slipData.savedAt
                                });
                            } catch (e) {
                                console.error(`Error reading slip: ${empId}/${file}`);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.log('No slips directory');
        }
        
        const { empId, month } = req.query;
        let filteredSlips = allSlips;
        
        if (empId) {
            filteredSlips = filteredSlips.filter(s => s.empId === empId);
        }
        if (month) {
            filteredSlips = filteredSlips.filter(s => s.month === month);
        }
        
        filteredSlips.sort((a, b) => b.month.localeCompare(a.month));
        res.json(filteredSlips);
    } catch (error) {
        console.error('Error in all-slips:', error);
        res.json([]);
    }
});

app.delete('/api/delete-slip/:empId/:month', async (req, res) => {
    try {
        const { empId, month } = req.params;
        
        try {
            await fs.unlink(path.join(SLIPS_DIR, empId, `${month}.json`));
        } catch (e) {
            console.log('Slip file not found');
        }
        
        try {
            await fs.rm(path.join(VERSIONS_DIR, empId, month), { recursive: true, force: true });
        } catch (e) {
            console.log('Versions directory not found');
        }
        
        console.log(`🗑️ Deleted slip and versions: ${empId}/${month}`);
        res.json({ success: true, message: 'Slip and all versions deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/delete-version/:empId/:month/:version', async (req, res) => {
    try {
        const { empId, month, version } = req.params;
        const versionPath = path.join(VERSIONS_DIR, empId, month, `v${version}.json`);
        
        await fs.unlink(versionPath);
        console.log(`🗑️ Deleted version: ${empId}/${month}/v${version}`);
        res.json({ success: true, message: `Version ${version} deleted` });
    } catch (error) {
        console.error('Error deleting version:', error);
        res.status(404).json({ error: 'Version not found' });
    }
});

app.post('/api/delete-multiple-versions', async (req, res) => {
    try {
        const { empId, month, versions } = req.body;
        
        if (!empId || !month || !versions || !Array.isArray(versions)) {
            return res.status(400).json({ error: 'Invalid request' });
        }
        
        let deletedCount = 0;
        
        for (const version of versions) {
            try {
                const versionPath = path.join(VERSIONS_DIR, empId, month, `v${version}.json`);
                await fs.unlink(versionPath);
                deletedCount++;
            } catch (e) {
                console.log(`Version ${version} not found`);
            }
        }
        
        console.log(`🗑️ Deleted ${deletedCount} versions for ${empId}/${month}`);
        res.json({ 
            success: true, 
            deletedCount,
            message: `${deletedCount} version(s) deleted` 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ BUSINESS API ROUTES ============

// Dashboard
app.get('/api/business/dashboard', async (req, res) => {
    try {
        const sales = await readSales();
        const expenses = await readExpenses();
        const today = new Date().toISOString().split('T')[0];
        const currentMonth = today.substring(0, 7);
        
        // Today's data
        const todaySales = sales.filter(s => {
            let dateStr = s.date;
            if (typeof dateStr === 'number') {
                dateStr = excelSerialToDate(dateStr);
            }
            return dateStr === today;
        });
        
        const todayExpenses = expenses.filter(e => {
            let dateStr = e.date;
            if (typeof dateStr === 'number') {
                dateStr = excelSerialToDate(dateStr);
            }
            return dateStr === today;
        });
        
        const totalSales = todaySales.reduce((sum, s) => sum + (s.total || 0), 0);
        const totalProfit = todaySales.reduce((sum, s) => sum + (s.profit || 0), 0);
        const totalCash = todaySales.reduce((sum, s) => sum + (s.cash || 0), 0);
        const totalUPI = todaySales.reduce((sum, s) => sum + (s.upi || 0), 0);
        const totalExpenses = todayExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
        
        // Monthly salary expenses
        const salaryExpenses = expenses
            .filter(e => {
                let dateStr = e.date;
                if (typeof dateStr === 'number') {
                    dateStr = excelSerialToDate(dateStr);
                }
                return dateStr && dateStr.startsWith(currentMonth) && e.category === 'Salary';
            })
            .reduce((sum, e) => sum + (e.amount || 0), 0);
        
        const netProfit = totalProfit - totalExpenses;
        
        res.json({
            todaySales: totalSales,
            todayProfit: totalProfit,
            todayCash: totalCash,
            todayUPI: totalUPI,
            todayExpenses: totalExpenses,
            monthlySalary: salaryExpenses,
            netProfit: netProfit
        });
    } catch (error) {
        console.error('Error in dashboard:', error);
        res.status(500).json({ error: error.message });
    }
});

// Sales routes
app.post('/api/business/sales', async (req, res) => {
    try {
        const sales = await readSales();
        const newSale = {
            _id: Date.now().toString(),
            ...req.body,
            createdAt: new Date().toISOString()
        };
        sales.push(newSale);
        await writeSales(sales);
        res.json({ success: true, sale: newSale });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/business/sales', async (req, res) => {
    try {
        let sales = await readSales();
        const { date, month } = req.query;
        
        if (date) {
            sales = sales.filter(s => {
                let dateStr = s.date;
                if (typeof dateStr === 'number') {
                    dateStr = excelSerialToDate(dateStr);
                }
                return dateStr === date;
            });
        }
        if (month) {
            sales = sales.filter(s => {
                let dateStr = s.date;
                if (typeof dateStr === 'number') {
                    dateStr = excelSerialToDate(dateStr);
                }
                return dateStr && dateStr.startsWith(month);
            });
        }
        
        sales.sort((a, b) => {
            let dateA = a.date;
            let dateB = b.date;
            if (typeof dateA === 'number') dateA = excelSerialToDate(dateA);
            if (typeof dateB === 'number') dateB = excelSerialToDate(dateB);
            return dateB.localeCompare(dateA) || b.createdAt.localeCompare(a.createdAt);
        });
        
        res.json(sales);
    } catch (error) {
        console.error('Error in sales GET:', error);
        res.json([]);
    }
});

app.put('/api/business/sales/:id', async (req, res) => {
    try {
        let sales = await readSales();
        const index = sales.findIndex(s => s._id === req.params.id);
        
        if (index === -1) {
            return res.status(404).json({ error: 'Sale not found' });
        }
        
        sales[index] = { ...sales[index], ...req.body, updatedAt: new Date().toISOString() };
        await writeSales(sales);
        res.json({ success: true, sale: sales[index] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/business/sales/:id', async (req, res) => {
    try {
        let sales = await readSales();
        sales = sales.filter(s => s._id !== req.params.id);
        await writeSales(sales);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Expense routes
app.post('/api/business/expenses', async (req, res) => {
    try {
        const expenses = await readExpenses();
        const newExpense = {
            _id: Date.now().toString(),
            ...req.body,
            createdAt: new Date().toISOString()
        };
        expenses.push(newExpense);
        await writeExpenses(expenses);
        res.json({ success: true, expense: newExpense });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/business/expenses', async (req, res) => {
    try {
        let expenses = await readExpenses();
        const { date, category } = req.query;
        
        if (date) {
            expenses = expenses.filter(e => {
                let dateStr = e.date;
                if (typeof dateStr === 'number') {
                    dateStr = excelSerialToDate(dateStr);
                }
                return dateStr === date;
            });
        }
        if (category) {
            expenses = expenses.filter(e => e.category === category);
        }
        
        expenses.sort((a, b) => {
            let dateA = a.date;
            let dateB = b.date;
            if (typeof dateA === 'number') dateA = excelSerialToDate(dateA);
            if (typeof dateB === 'number') dateB = excelSerialToDate(dateB);
            return dateB.localeCompare(dateA) || b.createdAt.localeCompare(a.createdAt);
        });
        
        res.json(expenses);
    } catch (error) {
        console.error('Error in expenses GET:', error);
        res.json([]);
    }
});

app.put('/api/business/expenses/:id', async (req, res) => {
    try {
        let expenses = await readExpenses();
        const index = expenses.findIndex(e => e._id === req.params.id);
        
        if (index === -1) {
            return res.status(404).json({ error: 'Expense not found' });
        }
        
        expenses[index] = { ...expenses[index], ...req.body, updatedAt: new Date().toISOString() };
        await writeExpenses(expenses);
        res.json({ success: true, expense: expenses[index] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/business/expenses/:id', async (req, res) => {
    try {
        let expenses = await readExpenses();
        expenses = expenses.filter(e => e._id !== req.params.id);
        await writeExpenses(expenses);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/business/expense-categories', async (req, res) => {
    try {
        const expenses = await readExpenses();
        const categories = [...new Set(expenses.map(e => e.category).filter(Boolean))];
        res.json(categories);
    } catch (error) {
        res.json([]);
    }
});

// Product routes
app.post('/api/business/products', async (req, res) => {
    try {
        const products = await readProducts();
        const newProduct = {
            _id: Date.now().toString(),
            ...req.body,
            createdAt: new Date().toISOString()
        };
        products.push(newProduct);
        await writeProducts(products);
        res.json({ success: true, product: newProduct });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/business/products', async (req, res) => {
    try {
        const products = await readProducts();
        res.json(products);
    } catch (error) {
        res.json([]);
    }
});

app.put('/api/business/products/:id', async (req, res) => {
    try {
        let products = await readProducts();
        const index = products.findIndex(p => p._id === req.params.id);
        
        if (index === -1) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        products[index] = { ...products[index], ...req.body, updatedAt: new Date().toISOString() };
        await writeProducts(products);
        res.json({ success: true, product: products[index] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/business/products/:id', async (req, res) => {
    try {
        let products = await readProducts();
        products = products.filter(p => p._id !== req.params.id);
        await writeProducts(products);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ MONTH DETAIL ROUTE ============

app.get('/api/business/month-detail', async (req, res) => {
    try {
        const { month } = req.query;
        if (!month) {
            return res.status(400).json({ error: 'Month parameter is required' });
        }
        
        const sales = await readSales();
        const expenses = await readExpenses();
        
        // Filter sales for the month
        const monthSales = sales.filter(s => {
            let dateStr = s.date;
            if (typeof dateStr === 'number') {
                dateStr = excelSerialToDate(dateStr);
            }
            return dateStr && dateStr.startsWith(month);
        });
        
        // Filter expenses for the month
        const monthExpenses = expenses.filter(e => {
            let dateStr = e.date;
            if (typeof dateStr === 'number') {
                dateStr = excelSerialToDate(dateStr);
            }
            return dateStr && dateStr.startsWith(month);
        });
        
        const totalSales = monthSales.reduce((sum, s) => sum + (s.total || 0), 0);
        const totalProfit = monthSales.reduce((sum, s) => sum + (s.profit || 0), 0);
        const totalExpenses = monthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
        
        // Calculate salary expenses
        const salaryExpenses = monthExpenses
            .filter(e => e.category === 'Salary')
            .reduce((sum, e) => sum + (e.amount || 0), 0);
        
        res.json({
            month,
            sales: monthSales,
            expenses: monthExpenses,
            totalSales,
            totalProfit,
            totalExpenses,
            salaryExpenses,
            netProfit: totalProfit - totalExpenses
        });
    } catch (error) {
        console.error('Error in month-detail:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ MONTHLY SUMMARY ROUTE ============

app.get('/api/business/monthly-summary', async (req, res) => {
    try {
        const { year } = req.query;
        const sales = await readSales();
        const expenses = await readExpenses();
        
        const monthlyData = {};
        
        // Process sales
        sales.forEach(sale => {
            let dateStr = sale.date;
            if (typeof dateStr === 'number') {
                dateStr = excelSerialToDate(dateStr);
            }
            if (typeof dateStr === 'string' && dateStr.includes('-')) {
                const month = dateStr.substring(0, 7);
                if (year && !month.startsWith(year)) return;
                
                if (!monthlyData[month]) {
                    monthlyData[month] = {
                        month: month,
                        totalSales: 0,
                        totalProfit: 0,
                        totalExpenses: 0,
                        saleCount: 0,
                        expenseCount: 0,
                        netProfit: 0
                    };
                }
                monthlyData[month].totalSales += sale.total || 0;
                monthlyData[month].totalProfit += sale.profit || 0;
                monthlyData[month].saleCount++;
            }
        });
        
        // Process expenses
        expenses.forEach(expense => {
            let dateStr = expense.date;
            if (typeof dateStr === 'number') {
                dateStr = excelSerialToDate(dateStr);
            }
            if (typeof dateStr === 'string' && dateStr.includes('-')) {
                const month = dateStr.substring(0, 7);
                if (year && !month.startsWith(year)) return;
                
                if (!monthlyData[month]) {
                    monthlyData[month] = {
                        month: month,
                        totalSales: 0,
                        totalProfit: 0,
                        totalExpenses: 0,
                        saleCount: 0,
                        expenseCount: 0,
                        netProfit: 0
                    };
                }
                monthlyData[month].totalExpenses += expense.amount || 0;
                monthlyData[month].expenseCount++;
            }
        });
        
        // Convert to array and sort
        const result = Object.values(monthlyData);
        result.sort((a, b) => a.month.localeCompare(b.month));
        
        // Add net profit calculation
        result.forEach(month => {
            month.netProfit = (month.totalProfit || 0) - (month.totalExpenses || 0);
        });
        
        res.json(result);
    } catch (error) {
        console.error('Error in monthly-summary:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ YEAR TO DATE SUMMARY ROUTE ============

app.get('/api/business/ytd-summary', async (req, res) => {
    try {
        const sales = await readSales();
        const expenses = await readExpenses();
        
        const currentYear = new Date().getFullYear();
        
        const yearSales = sales.filter(s => {
            let dateStr = s.date;
            if (typeof dateStr === 'number') {
                dateStr = excelSerialToDate(dateStr);
            }
            return dateStr && dateStr.startsWith(currentYear.toString());
        });
        
        const yearExpenses = expenses.filter(e => {
            let dateStr = e.date;
            if (typeof dateStr === 'number') {
                dateStr = excelSerialToDate(dateStr);
            }
            return dateStr && dateStr.startsWith(currentYear.toString());
        });
        
        const totalSales = yearSales.reduce((sum, s) => sum + (s.total || 0), 0);
        const totalProfit = yearSales.reduce((sum, s) => sum + (s.profit || 0), 0);
        const totalExpenses = yearExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
        const totalTransactions = yearSales.length + yearExpenses.length;
        
        res.json({
            totalSales,
            totalProfit,
            totalExpenses,
            netProfit: totalProfit - totalExpenses,
            totalTransactions,
            profitMargin: totalSales > 0 ? ((totalProfit - totalExpenses) / totalSales * 100) : 0
        });
    } catch (error) {
        console.error('Error in ytd-summary:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ REPORTS WITH SALARY DEDUCTION ============

app.get('/api/business/reports', async (req, res) => {
    try {
        const { month } = req.query;
        const sales = await readSales();
        const expenses = await readExpenses();
        
        const monthSales = sales.filter(s => {
            let dateStr = s.date;
            if (typeof dateStr === 'number') {
                dateStr = excelSerialToDate(dateStr);
            }
            return dateStr && dateStr.startsWith(month);
        });
        
        const monthExpenses = expenses.filter(e => {
            let dateStr = e.date;
            if (typeof dateStr === 'number') {
                dateStr = excelSerialToDate(dateStr);
            }
            return dateStr && dateStr.startsWith(month);
        });
        
        const totalSales = monthSales.reduce((sum, s) => sum + (s.total || 0), 0);
        const totalProfit = monthSales.reduce((sum, s) => sum + (s.profit || 0), 0);
        const totalExpenses = monthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
        
        // Separate salary expenses
        const salaryExpenses = monthExpenses
            .filter(e => e.category === 'Salary')
            .reduce((sum, e) => sum + (e.amount || 0), 0);
        
        const otherExpenses = totalExpenses - salaryExpenses;
        
        // Net profit after salary deduction
        const netProfit = totalProfit - totalExpenses;
        
        // Category-wise expenses
        const categoryExpenses = {};
        monthExpenses.forEach(e => {
            categoryExpenses[e.category] = (categoryExpenses[e.category] || 0) + (e.amount || 0);
        });
        
        // Transactions
        const transactions = [
            ...monthSales.map(s => ({
                type: 'sale',
                date: s.date,
                product: s.product || 'General',
                customer: s.customer || '',
                amount: s.total || 0,
                category: 'Sale'
            })),
            ...monthExpenses.map(e => ({
                type: 'expense',
                date: e.date,
                category: e.category || '',
                description: e.description || '',
                amount: e.amount || 0
            }))
        ];
        transactions.sort((a, b) => {
            let dateA = a.date;
            let dateB = b.date;
            if (typeof dateA === 'number') dateA = excelSerialToDate(dateA);
            if (typeof dateB === 'number') dateB = excelSerialToDate(dateB);
            return dateA.localeCompare(dateB);
        });
        
        res.json({
            totalSales,
            totalProfit,
            totalExpenses,
            salaryExpenses,
            otherExpenses,
            netProfit,
            categoryExpenses,
            transactions,
            month,
            profitMargin: totalSales > 0 ? ((netProfit / totalSales) * 100) : 0
        });
    } catch (error) {
        console.error('Error in reports:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ HELPER FUNCTION ============

function calculateAttendanceSummary(calendar) {
    const summary = { present: 0, absent: 0, paid: 0, na: 0 };
    
    if (calendar && Array.isArray(calendar)) {
        calendar.forEach(day => {
            if (day.status === 'Present') summary.present++;
            else if (day.status === 'Absent') summary.absent++;
            else if (day.status === 'Paid') summary.paid++;
            else if (day.status === 'NA') summary.na++;
        });
    }
    
    return summary;
}

// ============ START SERVER ============

init().then(() => {
    app.listen(PORT, () => {
        console.log('========================================');
        console.log('🚀 Mangokatta Salary App Running!');
        console.log(`📍 http://localhost:${PORT}`);
        console.log('========================================');
        console.log('📊 Business Management Module Active');
        console.log('   - Monthly Summary');
        console.log('   - Year to Date Summary');
        console.log('   - Salary Deduction in Reports');
        console.log('   - CSV Export Ready');
        console.log('👥 Employee Management Module Active');
        console.log('📝 Salary Slip Generation Active');
        console.log('========================================');
    });
});