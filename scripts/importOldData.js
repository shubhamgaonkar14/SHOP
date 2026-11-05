// ============ IMPORT OLD FILE-BASED DATA INTO MONGODB ============
// Usage:
//   node scripts/importOldData.js              ← DRY RUN (preview only)
//   node scripts/importOldData.js --apply      ← actually imports
//   node scripts/importOldData.js --apply --no-users   ← skip creating logins
//
// Reads from: ./data/  (old JSON files)
// Writes to:  MongoDB via MONGO_URI

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const Employee = require('../models/Employee');
const Slip = require('../models/Slip');
const Sale = require('../models/Sale');
const Expense = require('../models/Expense');
const Product = require('../models/Product');
const User = require('../models/User');

const DRY_RUN = !process.argv.includes('--apply');
const SKIP_USERS = process.argv.includes('--no-users');

const DATA_DIR = path.join(__dirname, '..', 'data');

// ---------- helpers ----------
async function readJson(filePath, fallback = []) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function listJsonFiles(dir) {
  try {
    const files = await fs.readdir(dir);
    return files.filter(f => f.endsWith('.json'));
  } catch {
    return [];
  }
}

async function listSubdirs(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
}

function shortId() {
  return crypto.randomBytes(3).toString('hex');
}

// ---------- main import ----------
async function run() {
  console.log('========================================');
  console.log(DRY_RUN ? '🧪 DRY RUN — no writes to DB' : '🚀 APPLYING CHANGES');
  console.log(`📂 Source: ${DATA_DIR}`);
  console.log('========================================\n');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ MongoDB connected\n');

  const stats = {
    employees: { found: 0, inserted: 0, skipped: 0 },
    slips: { found: 0, inserted: 0, skipped: 0 },
    sales: { found: 0, inserted: 0, skipped: 0 },
    expenses: { found: 0, inserted: 0, skipped: 0 },
    products: { found: 0, inserted: 0, skipped: 0 },
    users: { created: [], existing: [], skipped: [] }
  };

  // ============ 1. EMPLOYEES ============
  console.log('👥 Importing employees...');
  const employeeFiles = await listJsonFiles(path.join(DATA_DIR, 'employees'));

  const createdCredentials = []; // { empId, name, username, password }

  for (const file of employeeFiles) {
    const data = await readJson(path.join(DATA_DIR, 'employees', file), null);
    if (!data || !data.empId) continue;
    stats.employees.found++;

    const exists = await Employee.findOne({ empId: data.empId });
    if (exists) {
      stats.employees.skipped++;
      console.log(`  ⏭️  Skip employee ${data.empId} (already exists)`);
    } else {
      if (!DRY_RUN) {
        await Employee.create(data);
      }
      stats.employees.inserted++;
      console.log(`  ✅ ${DRY_RUN ? 'Would insert' : 'Inserted'} employee ${data.empId} - ${data.name || ''}`);
    }

    // --- Create login account (skip if users disabled) ---
    if (!SKIP_USERS) {
      const username = data.empId.toLowerCase();
      const existingUser = await User.findOne({ username });

      if (existingUser) {
        stats.users.existing.push({ empId: data.empId, username });
        console.log(`     👤 User ${username} already exists — keeping current password`);
      } else {
        const password = String(crypto.randomInt(100000, 1000000));

        if (!DRY_RUN) {
          await User.create({
            username,
            password,
            role: 'employee',
            empId: data.empId,
            name: data.name || '',
            active: true
          });
        }
        createdCredentials.push({
          empId: data.empId,
          name: data.name || '',
          username,
          password
        });
        console.log(`     🔑 ${DRY_RUN ? 'Would create' : 'Created'} login: ${username} / ${password}`);
      }
    }
  }

  console.log(`\n   Result: ${stats.employees.inserted} inserted, ${stats.employees.skipped} skipped, ${stats.employees.found} total\n`);

  // ============ 2. SLIPS + VERSIONS ============
  console.log('📝 Importing salary slips...');
  const slipEmployeeDirs = await listSubdirs(path.join(DATA_DIR, 'slips'));

  for (const empId of slipEmployeeDirs) {
    const slipFiles = await listJsonFiles(path.join(DATA_DIR, 'slips', empId));

    for (const file of slipFiles) {
      const month = file.replace('.json', '');
      const slipData = await readJson(path.join(DATA_DIR, 'slips', empId, file), null);
      if (!slipData) continue;
      stats.slips.found++;

      const alreadyExists = await Slip.findOne({ empId, month, isLatest: true });
      if (alreadyExists) {
        stats.slips.skipped++;
        console.log(`  ⏭️  Skip slip ${empId}/${month} (already exists)`);
        continue;
      }

      // Try to load version snapshots for richer data
      let versions = [];
      try {
        const versionDir = path.join(DATA_DIR, 'versions', empId, month);
        const versionFiles = await listJsonFiles(versionDir);
        for (const vf of versionFiles) {
          const v = await readJson(path.join(versionDir, vf), null);
          if (v) versions.push(v);
        }
      } catch {}

      const attendanceSummary = calcSummary(slipData.calendar);

      if (versions.length > 0) {
        // Insert every version, mark the last one as latest
        const maxV = Math.max(...versions.map(v => v.version || 1));
        for (const v of versions) {
          if (!DRY_RUN) {
            await Slip.create({
              empId,
              month,
              employeeName: v.employeeName || slipData.employeeName || '',
              baseSalary: v.baseSalary || slipData.baseSalary,
              calendar: v.calendar || slipData.calendar || [],
              bonusEnabled: v.bonusEnabled || false,
              bonusData: v.bonusData || [],
              notes: v.notes || '',
              version: v.version || 1,
              isLatest: (v.version || 1) === maxV,
              attendanceSummary: v.attendanceSummary || attendanceSummary
            });
          }
        }
        stats.slips.inserted++;
        console.log(`  ✅ ${DRY_RUN ? 'Would insert' : 'Inserted'} slip ${empId}/${month} (${versions.length} versions)`);
      } else {
        // Only one version
        if (!DRY_RUN) {
          await Slip.create({
            ...slipData,
            empId,
            month,
            version: 1,
            isLatest: true,
            attendanceSummary
          });
        }
        stats.slips.inserted++;
        console.log(`  ✅ ${DRY_RUN ? 'Would insert' : 'Inserted'} slip ${empId}/${month} (v1)`);
      }
    }
  }

  console.log(`\n   Result: ${stats.slips.inserted} inserted, ${stats.slips.skipped} skipped, ${stats.slips.found} total\n`);

  // ============ 3. SALES ============
  console.log('💰 Importing sales...');
  const sales = await readJson(path.join(DATA_DIR, 'business', 'sales.json'), []);
  for (const s of sales) {
    stats.sales.found++;
    const exists = await Sale.findOne({ date: s.date, total: s.total, createdAt: s.createdAt });
    if (exists) {
      stats.sales.skipped++;
      continue;
    }
    if (!DRY_RUN) {
      const { _id, ...rest } = s;
      await Sale.create(rest);
    }
    stats.sales.inserted++;
  }
  console.log(`   Result: ${stats.sales.inserted} inserted, ${stats.sales.skipped} skipped, ${stats.sales.found} total\n`);

  // ============ 4. EXPENSES ============
  console.log('💸 Importing expenses...');
  const expenses = await readJson(path.join(DATA_DIR, 'business', 'expenses.json'), []);
  for (const e of expenses) {
    stats.expenses.found++;
    const exists = await Expense.findOne({ date: e.date, amount: e.amount, category: e.category });
    if (exists) {
      stats.expenses.skipped++;
      continue;
    }
    if (!DRY_RUN) {
      const { _id, ...rest } = e;
      await Expense.create(rest);
    }
    stats.expenses.inserted++;
  }
  console.log(`   Result: ${stats.expenses.inserted} inserted, ${stats.expenses.skipped} skipped, ${stats.expenses.found} total\n`);

  // ============ 5. PRODUCTS ============
  console.log('📦 Importing products...');
  const products = await readJson(path.join(DATA_DIR, 'business', 'products.json'), []);
  for (const p of products) {
    stats.products.found++;
    const exists = await Product.findOne({ name: p.name, price: p.price });
    if (exists) {
      stats.products.skipped++;
      continue;
    }
    if (!DRY_RUN) {
      const { _id, ...rest } = p;
      await Product.create(rest);
    }
    stats.products.inserted++;
  }
  console.log(`   Result: ${stats.products.inserted} inserted, ${stats.products.skipped} skipped, ${stats.products.found} total\n`);

  // ============ SUMMARY ============
  console.log('========================================');
  console.log(DRY_RUN ? '🧪 DRY RUN COMPLETE — no changes saved' : '✅ IMPORT COMPLETE');
  console.log('========================================');
  console.log(`Employees: ${stats.employees.inserted} inserted, ${stats.employees.skipped} skipped`);
  console.log(`Slips:     ${stats.slips.inserted} inserted, ${stats.slips.skipped} skipped`);
  console.log(`Sales:     ${stats.sales.inserted} inserted, ${stats.sales.skipped} skipped`);
  console.log(`Expenses:  ${stats.expenses.inserted} inserted, ${stats.expenses.skipped} skipped`);
  console.log(`Products:  ${stats.products.inserted} inserted, ${stats.products.skipped} skipped`);

  if (createdCredentials.length > 0) {
    console.log('\n========================================');
    console.log('🔐 NEW LOGIN CREDENTIALS — SAVE THIS!');
    console.log('========================================');
    console.log('EMP ID       | NAME                 | USERNAME     | PASSWORD');
    console.log('---------------------------------------------------------------');
    createdCredentials.forEach(c => {
      const name = (c.name || '-').padEnd(20).slice(0, 20);
      console.log(`${c.empId.padEnd(12)} | ${name} | ${c.username.padEnd(12)} | ${c.password}`);
    });

    // Also write to a file for safekeeping
    if (!DRY_RUN) {
      const credPath = path.join(__dirname, '..', `imported-credentials-${Date.now()}.txt`);
      const lines = createdCredentials.map(c =>
        `${c.empId} | ${c.name} | ${c.username} | ${c.password}`
      ).join('\n');
      await fs.writeFile(credPath, 
        `Import Date: ${new Date().toISOString()}\n\nEMP ID | NAME | USERNAME | PASSWORD\n${lines}\n`
      );
      console.log(`\n📄 Credentials also saved to: ${credPath}`);
      console.log('   ⚠️  Keep this file safe. Delete after handing out passwords.');
    }
  } else if (!SKIP_USERS) {
    console.log('\n👤 No new user accounts created (all existed already).');
  }

  if (stats.users.existing.length > 0) {
    console.log(`\nℹ️  ${stats.users.existing.length} employee(s) already had login accounts — passwords were NOT changed.`);
  }

  await mongoose.disconnect();
  console.log('\n✅ Done.\n');
  process.exit(0);
}

function calcSummary(calendar) {
  const s = { present: 0, absent: 0, paid: 0, na: 0 };
  (calendar || []).forEach(d => {
    if (d.status === 'Present') s.present++;
    else if (d.status === 'Absent') s.absent++;
    else if (d.status === 'Paid') s.paid++;
    else if (d.status === 'NA') s.na++;
  });
  return s;
}

run().catch(err => {
  console.error('❌ Import failed:', err);
  process.exit(1);
});