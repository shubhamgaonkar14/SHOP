const express = require('express');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = await User.findOne({ username: username.toLowerCase().trim() });

    if (!user || !user.active) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regenerate error:', err);
        return res.status(500).json({ error: 'Session error' });
      }

      req.session.userId = user._id.toString();
      req.session.role = user.role;
      req.session.empId = user.empId;
      req.session.username = user.username;
      req.session.permissions = user.permissions || {};

      res.json({
        success: true,
        role: user.role,
        username: user.username,
        empId: user.empId,
        name: user.name
      });
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

router.get('/me', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  // Refresh permissions from DB in case admin changed them mid-session
  try {
    const user = await User.findById(req.session.userId).select('role permissions name empId username active');
    if (!user || !user.active) {
      return req.session.destroy(() => res.status(401).json({ error: 'Session expired' }));
    }
    req.session.role = user.role;
    req.session.permissions = user.permissions || {};
    req.session.empId = user.empId;

    res.json({
      userId: req.session.userId,
      role: user.role,
      empId: user.empId,
      username: user.username,
      name: user.name,
      permissions: user.permissions || {}
    });
  } catch (err) {
    console.error('/me error:', err);
    res.status(500).json({ error: 'Failed to load session' });
  }
});

// ============ CHANGE OWN PASSWORD ============
router.post('/change-password', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Not logged in' });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'New password must be different from current' });
    }

    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const valid = await user.comparePassword(currentPassword);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;