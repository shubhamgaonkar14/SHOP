// ============ AUTH GUARD ============
// Wrapped in IIFE so no global `const API` collision with page scripts.

(function () {
  const API = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : '/api';

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  // Page → required permission mapping
  // Admins bypass all. Employees/custom users must match at least one.
  const PAGE_ACCESS = {
    'index.html':        ['canViewOwnSlip', 'canManageEmployees'],
    'history.html':      ['canViewAllSlips'],
    'versions.html':     ['canViewAllSlips'],
    'employees.html':    ['canManageEmployees'],
    'business.html':     ['canManageBusiness'],
    'my-slips.html':     ['canViewOwnSlip']
  };

  // Navbar link → permission (null = always visible)
  const NAV_ACCESS = {
    'index.html':     ['canManageEmployees'],
    'my-slips.html':  ['canViewOwnSlip'],
    'history.html':   ['canViewAllSlips'],
    'versions.html':  ['canViewAllSlips'],
    'employees.html': ['canManageEmployees'],
    'business.html':  ['canManageBusiness']
  };

  function canAccess(user, permList) {
    if (!permList) return true;
    if (user.role === 'admin') return true;
    const perms = user.permissions || {};
    return permList.some(p => perms[p] === true);
  }

  // Pick the landing page for a user based on permissions
  function landingPage(user) {
    if (user.role === 'admin') return 'business.html';
    if (canAccess(user, ['canManageBusiness'])) return 'business.html';
    if (canAccess(user, ['canViewAllSlips'])) return 'history.html';
    if (canAccess(user, ['canManageEmployees'])) return 'employees.html';
    if (canAccess(user, ['canViewOwnSlip'])) return 'my-slips.html';
    return 'my-slips.html';
  }

  // ============ AUTH PROMISE ============
  // Exposed so page scripts can `await window.__authReady` before using
  // window.__currentUser. Resolves with the user object, rejects on failure.
  window.__authReady = (async function checkAuth() {
    try {
      const res = await fetch(`${API}/auth/me`, { credentials: 'include' });
      if (!res.ok) {
        window.location.href = 'login.html';
        throw new Error('Not authenticated');
      }
      const user = await res.json();
      window.__currentUser = user;

      const currentPage = window.location.pathname.split('/').pop() || 'index.html';
      const required = PAGE_ACCESS[currentPage];

      // Block access to pages user shouldn't see
      if (required && !canAccess(user, required)) {
        alert('You do not have permission to view this page.');
        window.location.href = landingPage(user);
        throw new Error('Forbidden');
      }

      onReady(() => {
        // ---------- Filter navbar ----------
        const navLinks = document.querySelector('.nav-links');
        if (navLinks) {
          navLinks.querySelectorAll('a').forEach(a => {
            const href = (a.getAttribute('href') || '').split('?')[0];
            const perms = NAV_ACCESS[href];
            if (perms && !canAccess(user, perms)) {
              a.style.display = 'none';
            }
          });
        }

        if (!navLinks) return;
        if (navLinks.querySelector('.user-chip')) return;

        const roleLabel = user.role === 'admin' ? 'Admin' : 'Employee';
        const displayName = user.empId || user.username || 'user';

        // ---------- Username chip as dropdown toggle ----------
        const chipWrap = document.createElement('div');
        chipWrap.className = 'user-chip-wrap';
        chipWrap.style.cssText = 'position:relative;display:inline-flex;align-items:center;';

        const chip = document.createElement('button');
        chip.className = 'user-chip';
        chip.type = 'button';
        chip.innerHTML = `👤 <strong>${displayName}</strong> &nbsp;<span style="opacity:0.7;font-size:11px;">(${roleLabel})</span> &nbsp;<span style="font-size:10px;opacity:0.8;">▼</span>`;
        chip.style.cssText = `
          background: transparent;
          border: 1px solid rgba(255,255,255,0.15);
          color: #cbd5e1;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 500;
          border-radius: 20px;
          cursor: pointer;
          margin-left: 10px;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          transition: background 0.2s;
        `;

        // ---------- Dropdown menu ----------
        const menu = document.createElement('div');
        menu.className = 'user-dropdown-menu';
        menu.style.cssText = `
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          background: white;
          border-radius: 10px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.25);
          min-width: 240px;
          padding: 6px;
          display: none;
          z-index: 10000;
          border: 1px solid #e2e8f0;
        `;

        let menuHtml = `
          <div style="padding:10px 12px 6px;font-size:11px;color:#a0aec0;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;">
            ${user.role === 'admin' ? 'Admin Menu' : 'My Account'}
          </div>
          <a href="#" data-action="change-password" class="user-menu-item">
            🔑 Change My Password
          </a>
        `;

        if (user.role === 'admin') {
          menuHtml += `
            <a href="#" data-action="manage-users" class="user-menu-item">
              👥 Manage Users & Permissions
            </a>
          `;
        }

        menuHtml += `
          <div style="height:1px;background:#e2e8f0;margin:6px 0;"></div>
          <a href="#" data-action="logout" class="user-menu-item" style="color:#e53e3e;">
            🚪 Logout
          </a>
        `;

        menu.innerHTML = menuHtml;

        if (!document.getElementById('user-dropdown-styles')) {
          const st = document.createElement('style');
          st.id = 'user-dropdown-styles';
          st.textContent = `
            .user-menu-item {
              display: block;
              padding: 10px 12px;
              color: #2d3748;
              text-decoration: none;
              border-radius: 6px;
              font-size: 13px;
              font-weight: 500;
              transition: background 0.15s;
            }
            .user-menu-item:hover {
              background: #f0f4f8;
            }
            .user-chip:hover {
              background: rgba(255,255,255,0.08) !important;
            }
          `;
          document.head.appendChild(st);
        }

        chipWrap.appendChild(chip);
        chipWrap.appendChild(menu);
        navLinks.appendChild(chipWrap);

        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
        });

        document.addEventListener('click', (e) => {
          if (!chipWrap.contains(e.target)) menu.style.display = 'none';
        });

        menu.addEventListener('click', async (e) => {
          const link = e.target.closest('[data-action]');
          if (!link) return;
          e.preventDefault();
          menu.style.display = 'none';

          const action = link.dataset.action;
          if (action === 'change-password') {
            openChangePasswordModal();
          } else if (action === 'manage-users') {
            openManageUsersModal();
          } else if (action === 'logout') {
            await window.logout();
          }
        });
      });

      return user;
    } catch (err) {
      // Redirect failures are already handled; just rethrow
      throw err;
    }
  })();

  // ============ CHANGE PASSWORD MODAL ============
  function openChangePasswordModal() {
    document.getElementById('changePwModal')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'changePwModal';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    `;

    overlay.innerHTML = `
      <div style="background:white;border-radius:12px;padding:30px;width:90%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <h3 style="margin:0 0 20px;color:#2d3748;font-size:18px;">🔑 Change My Password</h3>

        <div id="changePwError" style="display:none;background:#fed7d7;color:#9b2c2c;border:1px solid #feb2b2;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:15px;"></div>
        <div id="changePwSuccess" style="display:none;background:#c6f6d5;color:#276749;border:1px solid #9ae6b4;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:15px;"></div>

        <form id="changePwForm">
          <div style="margin-bottom:15px;">
            <label style="display:block;font-size:12px;font-weight:600;color:#4a5568;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Current Password</label>
            <input type="password" id="cpCurrent" required autocomplete="current-password"
                   style="width:100%;padding:11px 13px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;box-sizing:border-box;">
          </div>
          <div style="margin-bottom:15px;">
            <label style="display:block;font-size:12px;font-weight:600;color:#4a5568;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">New Password</label>
            <input type="password" id="cpNew" required minlength="6" autocomplete="new-password"
                   style="width:100%;padding:11px 13px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;box-sizing:border-box;">
            <small style="color:#718096;font-size:11px;">Minimum 6 characters</small>
          </div>
          <div style="margin-bottom:20px;">
            <label style="display:block;font-size:12px;font-weight:600;color:#4a5568;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Confirm New Password</label>
            <input type="password" id="cpConfirm" required autocomplete="new-password"
                   style="width:100%;padding:11px 13px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;box-sizing:border-box;">
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button type="button" id="cpCancel" style="padding:10px 20px;background:#e2e8f0;color:#4a5568;border:none;border-radius:8px;font-weight:600;cursor:pointer;">Cancel</button>
            <button type="submit" id="cpSubmit" style="padding:10px 20px;background:#2c5282;color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;">💾 Save</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);
    setTimeout(() => document.getElementById('cpCurrent')?.focus(), 50);

    const close = () => overlay.remove();
    document.getElementById('cpCancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    document.getElementById('changePwForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const currentPassword = document.getElementById('cpCurrent').value;
      const newPassword = document.getElementById('cpNew').value;
      const confirmPassword = document.getElementById('cpConfirm').value;
      const errorBox = document.getElementById('changePwError');
      const successBox = document.getElementById('changePwSuccess');
      const submitBtn = document.getElementById('cpSubmit');

      errorBox.style.display = 'none';
      successBox.style.display = 'none';

      if (newPassword !== confirmPassword) {
        errorBox.textContent = 'New passwords do not match';
        errorBox.style.display = 'block';
        return;
      }
      if (newPassword.length < 6) {
        errorBox.textContent = 'New password must be at least 6 characters';
        errorBox.style.display = 'block';
        return;
      }
      if (currentPassword === newPassword) {
        errorBox.textContent = 'New password must be different from current';
        errorBox.style.display = 'block';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ Saving...';

      try {
        const res = await fetch(`${API}/auth/change-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ currentPassword, newPassword })
        });
        const data = await res.json();

        if (!res.ok) {
          errorBox.textContent = data.error || 'Failed to change password';
          errorBox.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = '💾 Save';
          return;
        }

        successBox.textContent = '✅ Password changed successfully!';
        successBox.style.display = 'block';
        document.getElementById('changePwForm').reset();
        submitBtn.disabled = false;
        submitBtn.textContent = '💾 Save';

        setTimeout(() => close(), 2000);
      } catch (err) {
        errorBox.textContent = 'Network error. Please try again.';
        errorBox.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = '💾 Save';
      }
    });
  }

  // ============ MANAGE USERS MODAL ============
  async function openManageUsersModal() {
    document.getElementById('manageUsersModal')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'manageUsersModal';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      z-index: 9999;
      padding: 30px 15px;
      overflow-y: auto;
    `;

    overlay.innerHTML = `
      <div style="background:white;border-radius:12px;padding:25px;width:100%;max-width:900px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <h3 style="margin:0;color:#2d3748;font-size:18px;">👥 Manage Users & Permissions</h3>
          <button id="muClose" style="background:#e2e8f0;color:#4a5568;border:none;border-radius:8px;padding:8px 16px;font-weight:600;cursor:pointer;">✕ Close</button>
        </div>
        <div id="muError" style="display:none;background:#fed7d7;color:#9b2c2c;border:1px solid #feb2b2;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:15px;"></div>
        <div id="muList" style="max-height:70vh;overflow-y:auto;">
          <p style="text-align:center;color:#718096;padding:30px;">⏳ Loading users...</p>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.getElementById('muClose').addEventListener('click', () => overlay.remove());

    try {
      const res = await fetch(`${API}/admin/users`, { credentials: 'include' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch users');
      }
      const users = await res.json();
      renderUsersList(users);
    } catch (err) {
      document.getElementById('muError').textContent = err.message;
      document.getElementById('muError').style.display = 'block';
    }
  }

  function renderUsersList(users) {
    const list = document.getElementById('muList');
    if (!list) return;

    if (!users || users.length === 0) {
      list.innerHTML = '<p style="text-align:center;color:#718096;padding:30px;">No users found.</p>';
      return;
    }

    let html = '';
    users.forEach(u => {
      const isMe = u.username === (window.__currentUser?.username);
      const roleBadge = u.role === 'admin'
        ? '<span style="background:#2c5282;color:white;padding:2px 10px;border-radius:12px;font-size:11px;">ADMIN</span>'
        : '<span style="background:#718096;color:white;padding:2px 10px;border-radius:12px;font-size:11px;">EMPLOYEE</span>';
      const activeBadge = u.active
        ? '<span style="color:#38a169;font-size:12px;">● Active</span>'
        : '<span style="color:#e53e3e;font-size:12px;">● Inactive</span>';

      html += `
        <div style="border:1px solid #e2e8f0;border-radius:10px;padding:15px;margin-bottom:12px;background:#f7fafc;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <div>
              <div style="font-weight:700;color:#2d3748;font-size:15px;">
                ${u.name || u.username}
                <span style="color:#718096;font-weight:500;">(@${u.username})</span>
              </div>
              <div style="font-size:12px;color:#718096;margin-top:4px;">
                ${roleBadge} &nbsp; ${activeBadge}
                ${u.empId ? ` &nbsp; EMP ID: <strong>${u.empId}</strong>` : ''}
              </div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button data-uid="${u._id}" data-action="reset" class="btn-user-action" style="background:#d97706;color:white;border:none;padding:7px 12px;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;">🔑 Reset Password</button>
              <button data-uid="${u._id}" data-action="setpw" class="btn-user-action" style="background:#805ad5;color:white;border:none;padding:7px 12px;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;">✏️ Set Password</button>
              ${!isMe ? `
                <button data-uid="${u._id}" data-action="toggle" data-active="${u.active}" class="btn-user-action" style="background:${u.active ? '#e53e3e' : '#38a169'};color:white;border:none;padding:7px 12px;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;">
                  ${u.active ? '🚫 Deactivate' : '✅ Activate'}
                </button>
                <button data-uid="${u._id}" data-action="delete" class="btn-user-action" style="background:#4a5568;color:white;border:none;padding:7px 12px;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;">🗑️ Delete</button>
              ` : '<span style="color:#718096;font-size:12px;font-style:italic;">(you)</span>'}
            </div>
          </div>

          ${u.role !== 'admin' ? `
            <div style="margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0;">
              <div style="font-size:11px;color:#718096;text-transform:uppercase;font-weight:600;margin-bottom:8px;">Permissions</div>
              <div style="display:flex;flex-wrap:wrap;gap:10px;">
                ${[
                  ['canViewOwnSlip', '👁️ View Own Slip'],
                  ['canViewAllSlips', '📊 View All Slips'],
                  ['canManageEmployees', '👥 Manage Employees'],
                  ['canManageBusiness', '💼 Manage Business'],
                  ['canManageUsers', '🔐 Manage Users']
                ].map(([key, label]) => `
                  <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#4a5568;cursor:pointer;">
                    <input type="checkbox"
                           data-uid="${u._id}"
                           data-perm="${key}"
                           class="perm-checkbox"
                           ${u.permissions && u.permissions[key] ? 'checked' : ''}>
                    ${label}
                  </label>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      `;
    });

    list.innerHTML = html;
    attachUserActionHandlers();
  }

  function attachUserActionHandlers() {
    const list = document.getElementById('muList');
    if (!list) return;

    list.querySelectorAll('.btn-user-action').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uid = btn.dataset.uid;
        const action = btn.dataset.action;

        if (action === 'reset') {
          if (!confirm('Generate a new random 6-digit password for this user?')) return;
          const res = await fetch(`${API}/admin/users/${uid}/reset-password`, {
            method: 'POST',
            credentials: 'include'
          });
          const data = await res.json();
          if (!res.ok) return alert('Error: ' + (data.error || 'Failed'));
          alert(`✅ New password for ${data.username}:\n\n   ${data.password}\n\nGive this to the user.`);
        } else if (action === 'setpw') {
          const pw = prompt('Enter new password (min 6 chars):');
          if (!pw) return;
          if (pw.length < 6) return alert('Password must be at least 6 characters');
          const res = await fetch(`${API}/admin/users/${uid}/set-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ password: pw })
          });
          const data = await res.json();
          if (!res.ok) return alert('Error: ' + (data.error || 'Failed'));
          alert(`✅ Password updated for ${data.username}`);
        } else if (action === 'toggle') {
          const newActive = btn.dataset.active !== 'true';
          const res = await fetch(`${API}/admin/users/${uid}/active`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ active: newActive })
          });
          if (!res.ok) {
            const data = await res.json();
            return alert('Error: ' + (data.error || 'Failed'));
          }
          reloadUsersList();
        } else if (action === 'delete') {
          if (!confirm('⚠️ Delete this user permanently? This also removes their employee record and slips.')) return;
          const res = await fetch(`${API}/admin/users/${uid}`, {
            method: 'DELETE',
            credentials: 'include'
          });
          if (!res.ok) {
            const data = await res.json();
            return alert('Error: ' + (data.error || 'Failed'));
          }
          reloadUsersList();
        }
      });
    });

    list.querySelectorAll('.perm-checkbox').forEach(cb => {
      cb.addEventListener('change', async () => {
        const uid = cb.dataset.uid;
        const perm = cb.dataset.perm;
        const checked = cb.checked;

        const body = { permissions: {} };
        body.permissions[perm] = checked;

        const res = await fetch(`${API}/admin/users/${uid}/permissions`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          cb.checked = !checked;
          const data = await res.json();
          alert('Error saving permission: ' + (data.error || 'Failed'));
        }
      });
    });
  }

  async function reloadUsersList() {
    try {
      const res = await fetch(`${API}/admin/users`, { credentials: 'include' });
      const users = await res.json();
      renderUsersList(users);
    } catch (e) {}
  }

  window.openChangePasswordModal = openChangePasswordModal;
  window.openManageUsersModal = openManageUsersModal;

  // ============ API FETCH WRAPPER ============
  window.apiFetch = async function (url, options = {}) {
    const res = await fetch(url, { credentials: 'include', ...options });
    if (res.status === 401) {
      window.location.href = 'login.html';
    }
    return res;
  };

  // ============ LOGOUT ============
  window.logout = async function () {
    try {
      await fetch(`${API}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (e) {}
    window.location.href = 'login.html';
  };
})();