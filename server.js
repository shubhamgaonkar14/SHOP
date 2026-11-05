// ============ MANGOKATTA SERVER — MONGODB + AUTH ============

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

const User = require('./models/User');
const Employee = require('./models/Employee');
const Slip = require('./models/Slip');
const Sale = require('./models/Sale');
const Expense = require('./models/Expense');
const Product = require('./models/Product');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const { requireAuth, requireAdmin, requirePermission } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Log crashes (helps debug on Render)
process.on('unhandledRejection', (reason, p) => {
  console.error('❌ Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

app.set('trust proxy', 1);

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// ============ SESSION ============
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    touchAfter: 24 * 3600
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// ============ ROUTES: AUTH (public) ============
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// ============ STATIC ============
app.use(express.static('public'));

// ============ EMPLOYEE ROUTES ============

app.post('/api/save-employee', requireAdmin, async (req, res) => {
  try {
    const emp = req.body;
    if (!emp.empId) return res.status(400).json({ error: 'Employee ID required' });

    const saved = await Employee.findOneAndUpdate(
      { empId: emp.empId },
      emp,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const existingUser = await User.findOne({ username: emp.empId.toLowerCase() });

    if (!existingUser) {
      const generatedPassword = String(crypto.randomInt(100000, 1000000));

      await User.create({
        username: emp.empId.toLowerCase(),
        password: generatedPassword,
        role: 'employee',
        empId: emp.empId,
        name: emp.name || ''
      });

      return res.json({
        success: true,
        employee: saved,
        credentials: {
          username: emp.empId.toLowerCase(),
          password: generatedPassword
        },
        note: 'Employee user created. Save this password — it will not be shown again.'
      });
    }

    // Keep the user's empId/name in sync in case the Employee record was edited
    let userChanged = false;
    if (existingUser.empId !== emp.empId) {
      existingUser.empId = emp.empId;
      userChanged = true;
    }
    if (emp.name && existingUser.name !== emp.name) {
      existingUser.name = emp.name;
      userChanged = true;
    }
    if (userChanged) await existingUser.save();

    res.json({ success: true, employee: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reset-employee-password/:empId', requireAdmin, async (req, res) => {
  try {
    const empId = req.params.empId;
    const user = await User.findOne({ username: empId.toLowerCase() });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const newPassword = String(crypto.randomInt(100000, 1000000));
    user.password = newPassword;
    await user.save();

    res.json({ success: true, password: newPassword });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/get-employee/:empId', requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'employee' && req.user.empId !== req.params.empId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const emp = await Employee.findOne({ empId: req.params.empId });
    res.json(emp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/all-employees', requireAdmin, async (req, res) => {
  try {
    const emps = await Employee.find().sort({ empId: 1 });
    res.json(emps);
  } catch (err) {
    res.json([]);
  }
});

app.delete('/api/delete-employee/:empId', requireAdmin, async (req, res) => {
  try {
    const { empId } = req.params;
    await Promise.all([
      Employee.deleteOne({ empId }),
      Slip.deleteMany({ empId }),
      User.deleteOne({ username: empId.toLowerCase(), role: 'employee' })
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ SLIP ROUTES ============

function calculateAttendanceSummary(calendar) {
  const s = { present: 0, absent: 0, paid: 0, na: 0 };
  (calendar || []).forEach(d => {
    if (d.status === 'Present') s.present++;
    else if (d.status === 'Absent') s.absent++;
    else if (d.status === 'Paid') s.paid++;
    else if (d.status === 'NA') s.na++;
  });
  return s;
}

app.post('/api/save-slip', requireAuth, async (req, res) => {
  try {
    const { empId, month, slipData } = req.body;
    if (!empId || !month) return res.status(400).json({ error: 'Missing fields' });

    if (req.user.role === 'employee' && req.user.empId !== empId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const last = await Slip.findOne({ empId, month }).sort({ version: -1 });
    const nextVersion = last ? last.version + 1 : 1;

    await Slip.updateMany({ empId, month }, { isLatest: false });

    const newSlip = await Slip.create({
      ...slipData,
      empId,
      month,
      version: nextVersion,
      isLatest: true,
      attendanceSummary: calculateAttendanceSummary(slipData.calendar)
    });

    res.json({ success: true, version: nextVersion, slip: newSlip });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/get-slip/:empId/:month', requireAuth, async (req, res) => {
  try {
    const { empId, month } = req.params;
    if (req.user.role === 'employee' && req.user.empId !== empId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const slip = await Slip.findOne({ empId, month, isLatest: true });
    if (!slip) return res.status(404).json({ error: 'Not found' });
    res.json(slip);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/get-versions/:empId/:month', requireAdmin, async (req, res) => {
  try {
    const versions = await Slip.find({
      empId: req.params.empId,
      month: req.params.month
    }).sort({ version: -1 });
    res.json(versions);
  } catch (err) {
    res.json([]);
  }
});

app.get('/api/get-version/:empId/:month/:version', requireAdmin, async (req, res) => {
  try {
    const v = await Slip.findOne({
      empId: req.params.empId,
      month: req.params.month,
      version: parseInt(req.params.version)
    });
    if (!v) return res.status(404).json({ error: 'Not found' });
    res.json(v);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/get-employee-months/:empId', requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'employee' && req.user.empId !== req.params.empId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const months = await Slip.distinct('month', { empId: req.params.empId });
    res.json(months.sort().reverse());
  } catch (err) {
    res.json([]);
  }
});

app.get('/api/all-slips', requireAdmin, async (req, res) => {
  try {
    const filter = { isLatest: true };
    if (req.query.empId) filter.empId = req.query.empId;
    if (req.query.month) filter.month = req.query.month;
    const slips = await Slip.find(filter).sort({ month: -1 });
    res.json(slips);
  } catch (err) {
    res.json([]);
  }
});

// ============ MY SLIPS (employee self-service) ============
app.get('/api/my-slips', requireAuth, async (req, res) => {
  try {
    // Primary: session empId (set at login)
    let empId = req.user.empId;

    // Fallback: look it up from the User document (fixes older data
    // where User.empId was missing or the session went stale)
    if (!empId) {
      const u = await User.findById(req.user.id).select('empId username').lean();
      empId = u?.empId;

      // Last resort: match by username === empId.toLowerCase()
      if (!empId && u?.username) {
        const emp = await Employee.findOne({
          empId: new RegExp(`^${u.username}$`, 'i')
        }).select('empId').lean();
        if (emp) empId = emp.empId;
      }

      // Keep session in sync so future requests are fast
      if (empId && req.session) req.session.empId = empId;
    }

    if (!empId) {
      // Admin without empId, or employee with no linked record → empty list
      return res.json([]);
    }

    const slips = await Slip.find({ empId, isLatest: true })
      .sort({ month: -1 });
    res.json(slips);
  } catch (err) {
    console.error('my-slips error:', err);
    res.json([]);
  }
});

app.delete('/api/delete-slip/:empId/:month', requireAdmin, async (req, res) => {
  try {
    await Slip.deleteMany({ empId: req.params.empId, month: req.params.month });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/delete-version/:empId/:month/:version', requireAdmin, async (req, res) => {
  try {
    await Slip.deleteOne({
      empId: req.params.empId,
      month: req.params.month,
      version: parseInt(req.params.version)
    });
    res.json({ success: true });
  } catch (err) {
    res.status(404).json({ error: 'Not found' });
  }
});

app.post('/api/delete-multiple-versions', requireAdmin, async (req, res) => {
  try {
    const { empId, month, versions } = req.body;
    if (!empId || !month || !Array.isArray(versions)) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    const result = await Slip.deleteMany({
      empId, month, version: { $in: versions.map(Number) }
    });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ BUSINESS ROUTES (admin only) ============
app.use('/api/business', requirePermission('canManageBusiness'));

app.get('/api/business/dashboard', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = today.substring(0, 7);

    const todaySales = await Sale.find({ date: today });
    const todayExpenses = await Expense.find({ date: today });
    const monthSalaryExpenses = await Expense.find({
      date: { $regex: `^${currentMonth}` },
      category: 'Salary'
    });

    const totalSales = todaySales.reduce((s, x) => s + (x.total || 0), 0);
    const totalProfit = todaySales.reduce((s, x) => s + (x.profit || 0), 0);
    const totalCash = todaySales.reduce((s, x) => s + (x.cash || 0), 0);
    const totalUPI = todaySales.reduce((s, x) => s + (x.upi || 0), 0);
    const totalExpenses = todayExpenses.reduce((s, x) => s + (x.amount || 0), 0);
    const monthlySalary = monthSalaryExpenses.reduce((s, x) => s + (x.amount || 0), 0);

    res.json({
      todaySales: totalSales, todayProfit: totalProfit,
      todayCash: totalCash, todayUPI: totalUPI,
      todayExpenses: totalExpenses, monthlySalary,
      netProfit: totalProfit - totalExpenses
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/business/sales', async (req, res) => {
  try {
    const sale = await Sale.create(req.body);
    res.json({ success: true, sale });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/business/sales', async (req, res) => {
  try {
    const filter = {};
    if (req.query.date) filter.date = req.query.date;
    if (req.query.month) filter.date = { $regex: `^${req.query.month}` };
    const sales = await Sale.find(filter).sort({ date: -1, createdAt: -1 });
    res.json(sales);
  } catch (err) {
    res.json([]);
  }
});

app.put('/api/business/sales/:id', async (req, res) => {
  try {
    const s = await Sale.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!s) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, sale: s });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/business/sales/:id', async (req, res) => {
  try {
    await Sale.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/business/expenses', async (req, res) => {
  try {
    const exp = await Expense.create(req.body);
    res.json({ success: true, expense: exp });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/business/expenses', async (req, res) => {
  try {
    const filter = {};
    if (req.query.date) filter.date = req.query.date;
    if (req.query.category) filter.category = req.query.category;
    const exps = await Expense.find(filter).sort({ date: -1, createdAt: -1 });
    res.json(exps);
  } catch (err) {
    res.json([]);
  }
});

app.put('/api/business/expenses/:id', async (req, res) => {
  try {
    const e = await Expense.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!e) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, expense: e });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/business/expenses/:id', async (req, res) => {
  try {
    await Expense.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/business/expense-categories', async (req, res) => {
  try {
    const cats = await Expense.distinct('category');
    res.json(cats.filter(Boolean));
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/business/products', async (req, res) => {
  try {
    const p = await Product.create(req.body);
    res.json({ success: true, product: p });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/business/products', async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.json([]);
  }
});

app.put('/api/business/products/:id', async (req, res) => {
  try {
    const p = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, product: p });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/business/products/:id', async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ BULK DELETE (SALES / EXPENSES / PRODUCTS) ============

app.post('/api/business/sales/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array required' });
    }
    const result = await Sale.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/business/expenses/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array required' });
    }
    const result = await Expense.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/business/products/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array required' });
    }
    const result = await Product.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/business/month-detail', async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) return res.status(400).json({ error: 'Month required' });

    const sales = await Sale.find({ date: { $regex: `^${month}` } });
    const expenses = await Expense.find({ date: { $regex: `^${month}` } });
    const slips = await Slip.find({ month, isLatest: true }).lean();

    const totalSales = sales.reduce((s, x) => s + (x.total || 0), 0);
    const totalProfit = sales.reduce((s, x) => s + (x.profit || 0), 0);
    const totalExpenses = expenses.reduce((s, x) => s + (x.amount || 0), 0);
    const manualSalaryExpenses = expenses
      .filter(e => e.category === 'Salary')
      .reduce((s, x) => s + (x.amount || 0), 0);

    // Slip-based salary calc
    let slipSalaryTotal = 0;
    const employeeSalaries = [];
    for (const slip of slips) {
      const baseSalary = parseFloat(slip.baseSalary) || 0;
      const daysInMonth = slip.calendar ? slip.calendar.length : 30;
      const dailyRate = daysInMonth > 0 ? baseSalary / daysInMonth : 0;

      let absentDays = 0, halfDays = 0;
      (slip.calendar || []).forEach(day => {
        if (day.status === 'Absent' || day.status === 'NA') absentDays++;
        else if (day.status === 'HalfDay') halfDays += 0.5;
      });

      const deduction = (absentDays + halfDays) * dailyRate;
      let bonus = 0;
      (slip.bonusData || []).forEach(b => bonus += parseFloat(b.amount) || 0);

      const net = baseSalary - deduction + bonus;
      slipSalaryTotal += net;
      employeeSalaries.push({
        empId: slip.empId,
        name: slip.employeeName,
        baseSalary,
        deduction,
        bonus,
        netSalary: net
      });
    }

    const finalSalary = Math.max(slipSalaryTotal, manualSalaryExpenses);
    const otherExpenses = totalExpenses - manualSalaryExpenses;
    const netProfit = totalProfit - otherExpenses - finalSalary;

    res.json({
      month, sales, expenses,
      totalSales, totalProfit, totalExpenses,
      salaryExpenses: manualSalaryExpenses,
      slipSalary: slipSalaryTotal,
      finalSalary, otherExpenses,
      employeeSalaries,
      netProfit
    });
  } catch (err) {
    console.error('month-detail error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/business/monthly-summary', async (req, res) => {
  try {
    const { year } = req.query;
    const dateMatch = year ? { $regex: `^${year}` } : { $exists: true };

    // 1. Sales aggregation
    const salesAgg = await Sale.aggregate([
      { $match: { date: dateMatch } },
      { $group: {
        _id: { $substr: ['$date', 0, 7] },
        totalSales: { $sum: '$total' },
        totalProfit: { $sum: '$profit' },
        saleCount: { $sum: 1 }
      }}
    ]);

    // 2. Expenses — split salary vs other
    const expAgg = await Expense.aggregate([
      { $match: { date: dateMatch } },
      { $group: {
        _id: { $substr: ['$date', 0, 7] },
        totalExpenses: { $sum: '$amount' },
        salaryExpenses: {
          $sum: { $cond: [{ $eq: ['$category', 'Salary'] }, '$amount', 0] }
        },
        expenseCount: { $sum: 1 }
      }}
    ]);

    // 3. Slip-based salary per month
    const slipFilter = { isLatest: true };
    if (year) slipFilter.month = { $regex: `^${year}` };
    const slips = await Slip.find(slipFilter).lean();

    const slipSalaryByMonth = {};
    const empCountByMonth = {};

    for (const slip of slips) {
      const month = slip.month;
      if (!month) continue;

      const baseSalary = parseFloat(slip.baseSalary) || 0;
      const daysInMonth = slip.calendar ? slip.calendar.length : 30;
      const dailyRate = daysInMonth > 0 ? baseSalary / daysInMonth : 0;

      let absentDays = 0, halfDays = 0;
      (slip.calendar || []).forEach(day => {
        if (day.status === 'Absent' || day.status === 'NA') absentDays++;
        else if (day.status === 'HalfDay') halfDays += 0.5;
      });

      const deduction = (absentDays + halfDays) * dailyRate;

      let bonus = 0;
      (slip.bonusData || []).forEach(b => bonus += parseFloat(b.amount) || 0);

      const netSalary = baseSalary - deduction + bonus;

      slipSalaryByMonth[month] = (slipSalaryByMonth[month] || 0) + netSalary;
      empCountByMonth[month] = (empCountByMonth[month] || 0) + 1;
    }

    // 4. Merge
    const map = {};
    const ensure = m => map[m] ||= {
      month: m,
      totalSales: 0, totalProfit: 0,
      totalExpenses: 0, salaryExpenses: 0, otherExpenses: 0,
      slipSalary: 0, finalSalary: 0, employeeCount: 0,
      saleCount: 0, expenseCount: 0, netProfit: 0
    };

    salesAgg.forEach(s => {
      const m = ensure(s._id);
      m.totalSales = s.totalSales;
      m.totalProfit = s.totalProfit;
      m.saleCount = s.saleCount;
    });

    expAgg.forEach(e => {
      const m = ensure(e._id);
      m.totalExpenses = e.totalExpenses;
      m.salaryExpenses = e.salaryExpenses || 0;
      m.otherExpenses = (e.totalExpenses || 0) - (e.salaryExpenses || 0);
      m.expenseCount = e.expenseCount;
    });

    Object.keys(slipSalaryByMonth).forEach(m => {
      const e = ensure(m);
      e.slipSalary = slipSalaryByMonth[m];
      e.employeeCount = empCountByMonth[m] || 0;
    });

    // 5. Compute final salary + net profit
    const result = Object.values(map).map(m => {
      const finalSalary = Math.max(m.slipSalary || 0, m.salaryExpenses || 0);
      const netProfit = (m.totalProfit || 0) - (m.otherExpenses || 0) - finalSalary;
      return { ...m, finalSalary, netProfit };
    });

    result.sort((a, b) => a.month.localeCompare(b.month));
    res.json(result);
  } catch (err) {
    console.error('monthly-summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/business/ytd-summary', async (req, res) => {
  try {
    const currentYear = new Date().getFullYear().toString();
    const sales = await Sale.find({ date: { $regex: `^${currentYear}` } });
    const expenses = await Expense.find({ date: { $regex: `^${currentYear}` } });

    const totalSales = sales.reduce((s, x) => s + (x.total || 0), 0);
    const totalProfit = sales.reduce((s, x) => s + (x.profit || 0), 0);
    const totalExpenses = expenses.reduce((s, x) => s + (x.amount || 0), 0);

    res.json({
      totalSales, totalProfit, totalExpenses,
      netProfit: totalProfit - totalExpenses,
      totalTransactions: sales.length + expenses.length,
      profitMargin: totalSales > 0 ? ((totalProfit - totalExpenses) / totalSales * 100) : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/business/reports', async (req, res) => {
  try {
    const { month } = req.query;
    const sales = await Sale.find({ date: { $regex: `^${month}` } });
    const expenses = await Expense.find({ date: { $regex: `^${month}` } });

    const totalSales = sales.reduce((s, x) => s + (x.total || 0), 0);
    const totalProfit = sales.reduce((s, x) => s + (x.profit || 0), 0);
    const totalExpenses = expenses.reduce((s, x) => s + (x.amount || 0), 0);
    const salaryExpenses = expenses
      .filter(e => e.category === 'Salary')
      .reduce((s, x) => s + (x.amount || 0), 0);
    const otherExpenses = totalExpenses - salaryExpenses;
    const netProfit = totalProfit - totalExpenses;

    const categoryExpenses = {};
    expenses.forEach(e => {
      categoryExpenses[e.category] = (categoryExpenses[e.category] || 0) + (e.amount || 0);
    });

    const transactions = [
      ...sales.map(s => ({
        type: 'sale', date: s.date, product: s.product || 'General',
        customer: s.customer || '', amount: s.total || 0, category: 'Sale'
      })),
      ...expenses.map(e => ({
        type: 'expense', date: e.date, category: e.category || '',
        description: e.description || '', amount: e.amount || 0
      }))
    ].sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      totalSales, totalProfit, totalExpenses, salaryExpenses,
      otherExpenses, netProfit, categoryExpenses, transactions,
      month, profitMargin: totalSales > 0 ? ((netProfit / totalSales) * 100) : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ START ============
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => {
      console.log('========================================');
      console.log(`🚀 Mangokatta running on port ${PORT}`);
      console.log(`📍 http://localhost:${PORT}/login.html`);
      console.log('========================================');
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err);
    process.exit(1);
  });