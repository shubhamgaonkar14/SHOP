const API = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : '/api';

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errorBox = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');

  errorBox.style.display = 'none';
  btn.disabled = true;
  btn.textContent = '⏳ Logging in...';

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      errorBox.textContent = data.error || 'Login failed';
      errorBox.style.display = 'block';
      btn.disabled = false;
      btn.textContent = '🔐 Login';
      return;
    }

    // Fetch full permissions to decide landing page
    try {
      const meRes = await fetch(`${API}/auth/me`, { credentials: 'include' });
      const me = await meRes.json();
      const perms = me.permissions || {};

      if (me.role === 'admin') {
        window.location.href = 'business.html';
      } else if (perms.canManageBusiness) {
        window.location.href = 'business.html';
      } else if (perms.canViewAllSlips) {
        window.location.href = 'history.html';
      } else if (perms.canManageEmployees) {
        window.location.href = 'employees.html';
      } else {
        window.location.href = 'my-slips.html';
      }
    } catch {
      // fallback
      window.location.href = data.role === 'admin' ? 'business.html' : 'my-slips.html';
    }
  } catch (err) {
    errorBox.textContent = 'Network error. Please try again.';
    errorBox.style.display = 'block';
    btn.disabled = false;
    btn.textContent = '🔐 Login';
  }
});