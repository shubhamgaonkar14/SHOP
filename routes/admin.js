// ============ ADMIN: USER MANAGEMENT ============

const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const Employee = require('../models/Employee');

const router = express.Router();

// Middleware — must be logged in as admin
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Please login first' });
  }
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Admin permission required' });
  }
  next();
}

router.use(requireAdmin);

// ============ LIST ALL USERS ============
router.get('/users', async (req, res) => {
  try {
    const users = await User.find()
      .select('username name role empId active permissions createdAt')
      .sort({ role: 1, username: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ RESET SOMEONE ELSE'S PASSWORD ============
router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.role === 'admin' && user._id.toString() === req.session.userId) {
      return res.status(400).json({ error: 'Use "Change My Password" for your own account' });
    }

    const newPassword = String(crypto.randomInt(100000, 1000000));
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      username: user.username,
      password: newPassword
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ SET CUSTOM PASSWORD ============
router.post('/users/:id/set-password', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.password = password;
    await user.save();

    res.json({ success: true, username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ TOGGLE ACTIVE ============
router.patch('/users/:id/active', async (req, res) => {
  try {
    const { active } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user._id.toString() === req.session.userId) {
      return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }

    user.active = !!active;
    await user.save();

    res.json({ success: true, active: user.active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ UPDATE PERMISSIONS ============
router.patch('/users/:id/permissions', async (req, res) => {
  try {
    const { permissions } = req.body;
    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({ error: 'permissions object required' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Merge only known keys
    const allowed = ['canViewOwnSlip', 'canViewAllSlips', 'canManageEmployees', 'canManageBusiness', 'canManageUsers'];
    allowed.forEach(key => {
      if (typeof permissions[key] === 'boolean') {
        user.permissions[key] = permissions[key];
      }
    });

    await user.save();
    res.json({ success: true, permissions: user.permissions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ DELETE USER ============
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user._id.toString() === req.session.userId) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    if (user.role === 'employee' && user.empId) {
      await Employee.deleteOne({ empId: user.empId });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;