// ============ ONE-TIME ADMIN SEED SCRIPT ============
// Usage:
//   node scripts/seedAdmin.js <username> <password>
// Example:
//   node scripts/seedAdmin.js admin MyStr0ngP@ss!

require('dotenv').config();
const mongoose = require('mongoose');
const readline = require('readline');
const User = require('../models/User');

async function main() {
  const [, , argUser, argPass] = process.argv;

  let username = argUser;
  let password = argPass;

  if (!username || !password) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    username = await new Promise(r => rl.question('Admin username: ', r));
    password = await new Promise(r => rl.question('Admin password (min 8 chars): ', r));
    rl.close();
  }

  if (!username || !password) {
    console.error('❌ Username and password required');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('❌ Password must be at least 8 characters');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ MongoDB connected');

  const lower = username.toLowerCase().trim();
  const existing = await User.findOne({ username: lower });

  if (existing) {
    existing.password = password;
    existing.role = 'admin';
    existing.active = true;
    await existing.save();
    console.log(`♻️  Admin "${lower}" already existed — password reset.`);
  } else {
    await User.create({
      username: lower,
      password,
      role: 'admin',
      name: 'Administrator'
    });
    console.log(`✅ Admin "${lower}" created.`);
  }

  await mongoose.disconnect();
  console.log('✅ Done.');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});