// ============ AUTH MIDDLEWARE ============

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    if (req.xhr || req.headers.accept?.includes('json') || req.path.startsWith('/api')) {
      return res.status(401).json({ error: 'Please login first' });
    }
    return res.redirect('/login.html');
  }
  req.user = {
    id: req.session.userId,
    role: req.session.role,
    empId: req.session.empId,
    username: req.session.username,
    permissions: req.session.permissions || {}
  };
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Please login first' });
  }
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Admin permission required' });
  }
  req.user = {
    id: req.session.userId,
    role: req.session.role,
    empId: req.session.empId,
    username: req.session.username,
    permissions: req.session.permissions || {}
  };
  next();
}

// Check a specific permission key — admins always pass
function requirePermission(permKey) {
  return function (req, res, next) {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Please login first' });
    }
    if (req.session.role === 'admin') {
      req.user = {
        id: req.session.userId,
        role: req.session.role,
        empId: req.session.empId,
        username: req.session.username,
        permissions: req.session.permissions || {}
      };
      return next();
    }
    const perms = req.session.permissions || {};
    if (!perms[permKey]) {
      return res.status(403).json({ error: 'You do not have permission for this action' });
    }
    req.user = {
      id: req.session.userId,
      role: req.session.role,
      empId: req.session.empId,
      username: req.session.username,
      permissions: perms
    };
    next();
  };
}

module.exports = { requireAuth, requireAdmin, requirePermission };