'use strict';
var BASE_URL = '', API_KEY = '', pbsList = [], currentOffice = null, officeMap = null;

window.onload = function() {
  var saved = localStorage.getItem('sa_session');
  if (saved) {
    var data = JSON.parse(saved);
    BASE_URL = data.base_url;
    API_KEY = data.api_key;
    startApp();
  }
};

function doLogin() {
  var url = document.getElementById('loginBaseUrl').value.trim().replace(/\/+$/, '');
  var key = document.getElementById('loginApiKey').value.trim();
  var err = document.getElementById('loginError');
  err.textContent = '';
  if (!url || !key) {
    err.textContent = 'Enter URL and API Key';
    return;
  }
  fetch(url + '/api/dev/all-office/101', { headers: { 'X-Api-Key': key } })
    .then(function(res) {
      if (res.status === 403 || res.status === 401) {
        err.textContent = 'Invalid API Key';
        return;
      }
      BASE_URL = url;
      API_KEY = key;
      localStorage.setItem('sa_session', JSON.stringify({ base_url: url, api_key: key }));
      startApp();
    })
    .catch(function(e) {
      err.textContent = 'Connection failed: ' + e.message;
    });
}

function doLogout() {
  localStorage.removeItem('sa_session');
  location.reload();
}

function startApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  var shortKey = API_KEY.length > 20 ? API_KEY.substring(0,8) + '...' + API_KEY.slice(-6) : API_KEY;
  document.getElementById('topApiKey').textContent = shortKey;
  loadPbsList();
}

function api(method, path, body) {
  var opts = {
    method: method,
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY }
  };
  if (body) opts.body = JSON.stringify(body);
  return fetch(BASE_URL + path, opts).then(function(res) {
    return res.json().then(function(data) {
      return { ok: res.ok, status: res.status, data: data };
    });
  });
}

function toast(msg, type) {
  type = type || 'success';
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + type + ' show';
  setTimeout(function() { el.classList.remove('show'); }, 3500);
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
  document.getElementById('page-' + name).classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function safeJson(str) {
  if (!str) return {};
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch(e) { return {}; }
}

function loadPbsList() {
  api('GET', '/api/public/pbs-list')
    .then(function(r) {
      if (!r.ok || !r.data.data) return;
      pbsList = r.data.data;
      ['pbsSelect', 'createOfficePbs'].forEach(function(id) {
        var sel = document.getElementById(id);
        sel.innerHTML = '<option value="">-- Select PBS --</option>';
        pbsList.forEach(function(p) {
          var opt = document.createElement('option');
          opt.value = p.pbs_id;
          opt.textContent = p.pbs_id + ' — ' + p.pbs_name;
          sel.appendChild(opt);
        });
      });
    })
    .catch(function() { toast('Failed to load PBS list', 'error'); });
}

function loadOfficeStatsSummary(officeId) {
  var p1 = api('POST', '/api/meter/all', { office_id: officeId })
    .catch(function() { return { ok: false, data: { data: [] }, error: 'Auth required' }; });
  var p2 = api('POST', '/api/reading/all', { office_id: officeId })
    .catch(function() { return { ok: false, data: { data: [] }, error: 'Auth required' }; });
  return Promise.all([p1, p2]).then(function(res) {
    var hasAuthError = res[0].error === 'Auth required' || res[1].error === 'Auth required';
    return {
      meters: hasAuthError ? 'N/A' : (res[0].ok ? (res[0].data.data || []).length : '?'),
      readings: hasAuthError ? 'N/A' : (res[1].ok ? (res[1].data.data || []).length : '?'),
      _hasAuthError: hasAuthError
    };
  });
}

function loadOffices() {
  var pbsId = document.getElementById('pbsSelect').value;
  if (!pbsId) return;
  var container = document.getElementById('officesContainer');
  container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';
  api('GET', '/api/dev/all-office/' + pbsId)
    .then(function(r) {
      if (!r.ok) {
        container.innerHTML = '<div class="empty-state"><div class="icon">X</div><p>Failed to load</p></div>';
        return;
      }
      var offices = r.data.data || [];
      if (offices.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="icon">#</div><p>No offices in this PBS</p></div>';
        return;
      }
      Promise.all(offices.map(function(o) { return loadOfficeStatsSummary(o.office_id); }))
        .then(function(statsArr) {
          var statsMap = {};
          offices.forEach(function(o, i) { statsMap[o.office_id] = statsArr[i]; });
          container.innerHTML = '';
          var grid = document.createElement('div');
          grid.className = 'offices-grid';
          offices.forEach(function(o) {
            var info = safeJson(o.office_info_json);
            var users = safeJson(o.office_user_json);
            var s = statsMap[o.office_id];
            var card = document.createElement('div');
            card.className = 'office-card';
            var html = '<h4>' + o.office_name + '</h4>';
            html += '<div class="office-id-tag">ID: ' + o.office_id + ' | PBS: ' + o.pbs_id + '</div>';
            if (info.map_tile_url) html += '<div style="font-size:.72rem;color:#0ea5e9;margin-top:3px">&#128506; Map tile configured</div>';
            html += '<div class="office-stats">';
            html += '<div class="office-stat">Meters: <span>' + s.meters + (s._hasAuthError ? '<span style="color:#fca5a5;font-size:.6rem;margin-left:3px">*</span>' : '') + '</span></div>';
            html += '<div class="office-stat">Readings: <span>' + s.readings + (s._hasAuthError ? '<span style="color:#fca5a5;font-size:.6rem;margin-left:3px">*</span>' : '') + '</span></div>';
            html += '</div>';
            html += '<div class="office-stats" style="margin-top:6px">';
            html += '<div class="office-stat">Admin: <span>' + (users.admin_users || []).length + '</span></div>';
            html += '<div class="office-stat">Editor: <span>' + (users.editor_users || []).length + '</span></div>';
            html += '<div class="office-stat">Viewer: <span>' + (users.viewer_users || []).length + '</span></div>';
            if ((users.pending_users || []).length > 0) html += '<div class="office-stat">Pending: <span style="color:#fde68a">' + users.pending_users.length + '</span></div>';
            html += '</div>';
            card.innerHTML = html;
            card.onclick = (function(off, usr, inf, st) {
              return function() { openOfficeDetail(off, usr, inf, st); };
            })(o, users, info, s);
            grid.appendChild(card);
          });
          container.appendChild(grid);
        });
    })
    .catch(function(e) {
      container.innerHTML = '<div class="empty-state"><div class="icon">X</div><p>' + e.message + '</p></div>';
    });
}

function openOfficeDetail(office, users, info, stats) {
  currentOffice = office;
  document.getElementById('officeListView').style.display = 'none';
  document.getElementById('officeDetailView').style.display = 'block';
  var content = document.getElementById('officeDetailContent');
  content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading details...</div>';
  
  // Try to fetch meter and reading data, but handle auth errors gracefully
  var p1 = api('POST', '/api/meter/all', { office_id: office.office_id })
    .catch(function() { return { ok: false, data: { data: [] }, error: 'Auth required' }; });
  var p2 = api('POST', '/api/reading/all', { office_id: office.office_id })
    .catch(function() { return { ok: false, data: { data: [] }, error: 'Auth required' }; });
    
  Promise.all([p1, p2]).then(function(res) {
    var meters = res[0].ok ? (res[0].data.data || []) : [];
    var readings = res[1].ok ? (res[1].data.data || []) : [];
    var tileFolder = info.map_tile_url || '';
    var metersWithGps = meters.filter(function(m) {
      return m.gps_location && m.gps_location.indexOf(',') !== -1;
    });
    
    // Check if we have auth errors
    var hasAuthError = res[0].error === 'Auth required' || res[1].error === 'Auth required';
    
    // Only try to fetch notes if we have meters and no auth error
    var notePromises = [];
    if (meters.length > 0 && !hasAuthError) {
      notePromises = meters.slice(0, 20).map(function(m) {
        return api('POST', '/api/note/all', { account_id: m.account_id })
          .then(function(nr) { return nr.ok ? (nr.data.data || []).length : 0; })
          .catch(function() { return 0; });
      });
    }
    
    var processNotes = notePromises.length > 0 
      ? Promise.all(notePromises).then(function(noteCounts) {
          return noteCounts.reduce(function(a, b) { return a + b; }, 0);
        })
      : Promise.resolve(0);
    
    return processNotes.then(function(totalNotes) {
      var noteDisplay = hasAuthError ? 'N/A (auth required)' : 
                       meters.length > 20 ? totalNotes + '+ (first 20 meters)' : String(totalNotes);
      var adminUsers = users.admin_users || [];
      var editorUsers = users.editor_users || [];
      var viewerUsers = users.viewer_users || [];
      var pendingUsers = users.pending_users || [];
      var html = '';
      
      // Info card
      html += '<div class="card">';
      html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">';
      html += '<div><h3 style="font-size:1.2rem;color:#f1f5f9">' + office.office_name + '</h3>';
      html += '<div style="font-size:.8rem;color:#64748b;margin-top:4px">Office ID: <code style="color:#38bdf8">' + office.office_id + '</code> | PBS: ' + office.pbs_id + '</div></div>';
      html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
      html += '<button class="btn btn-outline btn-sm" onclick="openEditOfficeModal()">Edit</button>';
      html += '<button class="btn btn-sm" onclick="openUserManageModal()">Manage Users</button>';
      html += '</div></div>';
      if (info.contact) {
        html += '<div style="margin-top:12px">';
        html += '<div style="font-size:.85rem;color:#94a3b8">' + info.contact + '</div>';
        html += '</div>';
      }
      html += '</div>';
      
      // Stats with auth error notice
      html += '<div class="stats-grid">';
      html += '<div class="stat-card"><div class="stat-value">' + (hasAuthError ? 'N/A' : meters.length) + '</div><div class="stat-label">Total Meters' + (hasAuthError ? '<br><span style="color:#fca5a5;font-size:.7rem">(auth required)</span>' : '') + '</div></div>';
      html += '<div class="stat-card"><div class="stat-value">' + (hasAuthError ? 'N/A' : readings.length) + '</div><div class="stat-label">Total Readings' + (hasAuthError ? '<br><span style="color:#fca5a5;font-size:.7rem">(auth required)</span>' : '') + '</div></div>';
      html += '<div class="stat-card"><div class="stat-value">' + noteDisplay + '</div><div class="stat-label">Total Notes</div></div>';
      html += '<div class="stat-card"><div class="stat-value">' + (adminUsers.length + editorUsers.length + viewerUsers.length) + '</div><div class="stat-label">Total Members</div></div>';
      html += '</div>';
      
      // Map card — show only if tile URL is set
      if (tileFolder) {
        var neStr = info.ne_point || '';
        var swStr = info.sw_point || '';
        var boundsInfo = (neStr && swStr)
          ? '<span style="font-size:.72rem;color:#64748b;margin-left:8px">NE: ' + neStr + ' | SW: ' + swStr + '</span>'
          : '<span style="font-size:.72rem;color:#f59e0b;margin-left:8px">&#9888; No bounds set</span>';
        html += '<div class="card map-card">';
        html += '<div class="map-header">';
        html += '<div class="card-title">Office Map' + boundsInfo + '</div>';
        html += '<div class="tile-badge" title="' + tileFolder + '">' + tileFolder + '</div>';
        html += '</div><div id="officeMap"></div></div>';
      }
      
      // Users card — always show pending section
      html += '<div class="card">';
      html += '<div class="card-title">User List<button class="btn btn-sm btn-outline" style="margin-left:auto" onclick="openUserManageModal()">Manage</button></div>';

      // Pending section — prominent, always visible
      html += '<div style="margin-bottom:16px;padding:12px;background:#1a0f0f;border:1px solid #7f1d1d;border-radius:8px">';
      html += '<div style="font-size:.8rem;font-weight:600;color:#fca5a5;margin-bottom:10px">&#9203; Pending Approval (' + pendingUsers.length + ')</div>';
      if (pendingUsers.length === 0) {
        html += '<div style="font-size:.8rem;color:#475569">No pending requests</div>';
      } else {
        pendingUsers.forEach(function(u) {
          html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">';
          html += '<span class="role-tag role-pending" style="flex-shrink:0">' + u + '</span>';
          html += '<select id="approveRole_' + u + '" style="padding:4px 8px;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#e2e8f0;font-size:.78rem;outline:none">';
          html += '<option value="viewer">Viewer</option>';
          html += '<option value="editor">Editor</option>';
          html += '<option value="admin">Admin</option>';
          html += '</select>';
          html += '<button class="btn btn-success btn-sm" style="padding:4px 10px;font-size:.75rem" onclick="approvePendingUser(\'' + u + '\')">Approve</button>';
          html += '<button class="btn btn-danger btn-sm" style="padding:4px 10px;font-size:.75rem" onclick="removePendingUser(\'' + u + '\')">Remove</button>';
          html += '</div>';
        });
      }
      html += '</div>';

      // Active users grid
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px">';
      html += renderUserGroup('Admin', adminUsers, 'role-admin');
      html += renderUserGroup('Editor', editorUsers, 'role-editor');
      html += renderUserGroup('Viewer', viewerUsers, 'role-viewer');
      html += '</div></div>';
      
      // Only show meter/reading tables if we have data and no auth error
      if (!hasAuthError) {
        // Recent readings
        if (readings.length > 0) {
          html += '<div class="card"><div class="card-title">Recent Readings (last 10)</div><div class="table-wrap"><table>';
          html += '<thead><tr><th>Reading ID</th><th>Account ID</th><th>Date</th><th>Reader</th><th>Value</th></tr></thead><tbody>';
          readings.slice(-10).reverse().forEach(function(r) {
            var rj = safeJson(r.reading_json);
            var val = rj.value !== undefined ? rj.value + ' ' + (rj.unit || '') : '—';
            html += '<tr>';
            html += '<td><code style="font-size:.75rem;color:#64748b">' + r.reading_id.substring(0,8) + '...</code></td>';
            html += '<td><code style="font-size:.78rem">' + r.account_id + '</code></td>';
            html += '<td style="font-size:.8rem">' + (r.date_time || '—') + '</td>';
            html += '<td><span class="badge badge-blue">' + r.reader_username + '</span></td>';
            html += '<td style="color:#38bdf8;font-weight:600">' + val + '</td>';
            html += '</tr>';
          });
          html += '</tbody></table></div></div>';
        }
        
        // Meters table
        if (meters.length > 0) {
          html += '<div class="card"><div class="card-title">Meter List (first 50)</div><div class="table-wrap"><table>';
          html += '<thead><tr><th>Account ID</th><th>Account No.</th><th>Name</th><th>Route</th><th>Village</th><th>GPS</th></tr></thead><tbody>';
          meters.slice(0, 50).forEach(function(m) {
            var aj = safeJson(m.account_info_json);
            html += '<tr>';
            html += '<td><code style="font-size:.78rem">' + m.account_id + '</code></td>';
            html += '<td>' + (m.account_number || '—') + '</td>';
            html += '<td>' + (aj.name || '—') + '</td>';
            html += '<td>' + (m.route_number || '—') + '</td>';
            html += '<td>' + (m.village || '—') + '</td>';
            html += '<td style="font-size:.75rem;color:#64748b">' + (m.gps_location || '—') + '</td>';
            html += '</tr>';
          });
          html += '</tbody></table></div>';
          if (meters.length > 50) html += '<div style="text-align:center;padding:10px;color:#64748b;font-size:.82rem">... ' + (meters.length - 50) + ' more meters</div>';
          html += '</div>';
        }
      } else {
        // Show auth error message
        html += '<div class="card"><div class="card-title">Data Access</div>';
        html += '<div style="padding:16px;background:#0f172a;border-radius:8px;border:1px solid #334155">';
        html += '<div style="color:#fca5a5;font-size:.85rem;margin-bottom:8px">&#9888; Authentication Required</div>';
        html += '<div style="color:#94a3b8;font-size:.8rem">Meter and reading data requires JWT authentication. Super admin API key only works for office management operations.</div>';
        html += '</div></div>';
      }
      
      content.innerHTML = html;
      currentOffice._info = info;
      currentOffice._users = users;
      if (tileFolder) {
        setTimeout(function() { initOfficeMap(tileFolder, info.ne_point || '', info.sw_point || ''); }, 150);
      }
    });
  }).catch(function(e) {
    content.innerHTML = '<div class="empty-state"><div class="icon">X</div><p>' + e.message + '</p></div>';
  });
}

function renderUserGroup(title, users, cls) {
  var h = '<div><div style="font-size:.8rem;color:#64748b;margin-bottom:8px;font-weight:600">' + title + ' (' + users.length + ')</div>';
  if (users.length === 0) {
    h += '<div style="font-size:.8rem;color:#475569">None</div>';
  } else {
    users.forEach(function(u) {
      h += '<div class="role-tag ' + cls + '" style="margin-bottom:4px">' + u + '</div>';
    });
  }
  return h + '</div>';
}

function initOfficeMap(tileUrl, neStr, swStr) {
  if (officeMap) {
    officeMap.remove();
    officeMap = null;
  }
  var el = document.getElementById('officeMap');
  if (!el) return;

  // Parse NE and SW points
  var ne = null, sw = null;
  if (neStr && swStr) {
    var neParts = neStr.split(',');
    var swParts = swStr.split(',');
    var neLat = parseFloat(neParts[0]), neLng = parseFloat(neParts[1]);
    var swLat = parseFloat(swParts[0]), swLng = parseFloat(swParts[1]);
    if (!isNaN(neLat) && !isNaN(neLng) && !isNaN(swLat) && !isNaN(swLng)) {
      ne = [neLat, neLng];
      sw = [swLat, swLng];
    }
  }

  // Determine initial view
  var clat = 23.685, clng = 90.356, zoom = 7;
  if (ne && sw) {
    clat = (ne[0] + sw[0]) / 2;
    clng = (ne[1] + sw[1]) / 2;
    zoom = 10;
  }

  officeMap = L.map('officeMap', { zoomControl: true }).setView([clat, clng], zoom);

  // Tile layer — use URL as-is if it has {z}, else append /{z}/{x}/{y}.png
  var tilePath = tileUrl.indexOf('{z}') !== -1
    ? tileUrl
    : tileUrl.replace(/\/+$/, '') + '/{z}/{x}/{y}.png';

  L.tileLayer(tilePath, {
    maxZoom: 18,
    minZoom: 0,
    tms: false,
    attribution: 'Map data &copy; OpenStreetMap contributors'
  }).addTo(officeMap);

  // Fit map to NE/SW bounds if available
  if (ne && sw) {
    officeMap.fitBounds([sw, ne], { padding: [10, 10] });
  }
}

function closeOfficeDetail() {
  if (officeMap) {
    officeMap.remove();
    officeMap = null;
  }
  document.getElementById('officeDetailView').style.display = 'none';
  document.getElementById('officeListView').style.display = 'block';
  currentOffice = null;
}

function openEditOfficeModal() {
  if (!currentOffice) return;
  var info = currentOffice._info || {};
  document.getElementById('editOfficeId').value = currentOffice.office_id;
  document.getElementById('editOfficeName').value = currentOffice.office_name;
  document.getElementById('editOfficeContact').value = info.contact || '';
  document.getElementById('editOfficeMapTile').value = info.map_tile_url || '';
  document.getElementById('editOfficeMaxNativeZoom').value = info.max_native_zoom || 19;
  var ne = info.ne_point || '';
  var sw = info.sw_point || '';
  document.getElementById('editOfficeNE').value = ne;
  document.getElementById('editOfficeSW').value = sw;
  document.getElementById('editOfficeModal').classList.add('open');
}

function saveEditOffice() {
  var id = document.getElementById('editOfficeId').value;
  var name = document.getElementById('editOfficeName').value.trim();
  var contact = document.getElementById('editOfficeContact').value.trim();
  var tile = document.getElementById('editOfficeMapTile').value.trim();
  var maxNativeZoom = parseInt(document.getElementById('editOfficeMaxNativeZoom').value) || 19;
  var ne = document.getElementById('editOfficeNE').value.trim();
  var sw = document.getElementById('editOfficeSW').value.trim();
  var existing = currentOffice._info || {};
  var ij = {};
  if (contact) ij.contact = contact;
  if (tile) ij.map_tile_url = tile;
  ij.max_native_zoom = maxNativeZoom;
  if (ne) ij.ne_point = ne;
  if (sw) ij.sw_point = sw;
  var managed = { contact: 1, map_tile_url: 1, max_native_zoom: 1, ne_point: 1, sw_point: 1, area: 1 };
  for (var key in existing) {
    if (!managed[key]) ij[key] = existing[key];
  }
  var body = { office_id: id };
  if (name) body.office_name = name;
  body.office_info_json = ij;
  api('POST', '/api/dev/edit-office', body)
    .then(function(r) {
      if (r.ok) {
        toast('Office updated');
        closeModal('editOfficeModal');
        currentOffice.office_name = name;
        currentOffice._info = ij;
        loadOffices();
        refreshCurrentOfficeDetail();
      } else {
        toast(r.data.message || 'Update failed', 'error');
      }
    })
    .catch(function(e) {
      toast('Error: ' + e.message, 'error');
    });
}

function refreshCurrentOfficeDetail() {
  if (!currentOffice) return;
  // Re-fetch office data from the list API
  api('GET', '/api/dev/all-office/' + currentOffice.pbs_id)
    .then(function(r) {
      if (!r.ok) return;
      var offices = r.data.data || [];
      var updatedOffice = offices.find(function(o) { return o.office_id === currentOffice.office_id; });
      if (!updatedOffice) return;
      var info = safeJson(updatedOffice.office_info_json);
      var users = safeJson(updatedOffice.office_user_json);
      // Re-open detail with updated data
      openOfficeDetail(updatedOffice, users, info, {});
    })
    .catch(function() {
      // If fetch fails, just reload the page
      location.reload();
    });
}

function openUserManageModal() {
  if (!currentOffice) return;
  document.getElementById('userManageOfficeId').value = currentOffice.office_id;
  document.getElementById('addUsername').value = '';
  document.getElementById('removeUsername').value = '';
  renderCurrentUsers(currentOffice._users || {});
  document.getElementById('userManageModal').classList.add('open');
}

function renderCurrentUsers(users) {
  var el = document.getElementById('currentUsersDisplay');
  var groups = [
    { key: 'admin_users', label: 'Admin', cls: 'role-admin' },
    { key: 'editor_users', label: 'Editor', cls: 'role-editor' },
    { key: 'viewer_users', label: 'Viewer', cls: 'role-viewer' },
    { key: 'pending_users', label: 'Pending', cls: 'role-pending' }
  ];
  var h = '<div style="font-size:.8rem;color:#64748b;margin-bottom:8px">Current users:</div><div style="display:flex;flex-wrap:wrap;gap:6px">';
  groups.forEach(function(g) {
    (users[g.key] || []).forEach(function(u) {
      h += '<span class="role-tag ' + g.cls + '">' + g.label + ': ' + u + '</span>';
    });
  });
  el.innerHTML = h + '</div>';
}

function approvePendingUser(username) {
  if (!currentOffice) return;
  var roleEl = document.getElementById('approveRole_' + username);
  var role = roleEl ? roleEl.value : 'viewer';
  var body = { office_id: currentOffice.office_id };
  body['remove_pending'] = username;
  body['add_' + role] = username;
  api('POST', '/api/dev/user-manage', body)
    .then(function(r) {
      if (r.ok) {
        toast(username + ' approved as ' + role);
        currentOffice._users = r.data.data;
        refreshCurrentOfficeDetail();
      } else {
        toast(r.data.message || 'Failed', 'error');
      }
    })
    .catch(function(e) { toast('Error: ' + e.message, 'error'); });
}

function removePendingUser(username) {
  if (!currentOffice) return;
  api('POST', '/api/dev/user-manage', {
    office_id: currentOffice.office_id,
    remove_pending: username
  })
    .then(function(r) {
      if (r.ok) {
        toast(username + ' removed from pending');
        currentOffice._users = r.data.data;
        refreshCurrentOfficeDetail();
      } else {
        toast(r.data.message || 'Failed', 'error');
      }
    })
    .catch(function(e) { toast('Error: ' + e.message, 'error'); });
}

function switchUserTab(tab) {
  document.querySelectorAll('#userManageModal .tab').forEach(function(t, i) {
    t.classList.toggle('active', (i === 0 && tab === 'add') || (i === 1 && tab === 'remove'));
  });
  document.getElementById('userTabAdd').style.display = tab === 'add' ? 'block' : 'none';
  document.getElementById('userTabRemove').style.display = tab === 'remove' ? 'block' : 'none';
}

function addUserToOffice() {
  var oid = document.getElementById('userManageOfficeId').value;
  var uname = document.getElementById('addUsername').value.trim();
  var role = document.getElementById('addUserRole').value;
  if (!uname) {
    toast('Enter username', 'error');
    return;
  }
  var body = { office_id: oid };
  body['add_' + role] = uname;
  api('POST', '/api/dev/user-manage', body)
    .then(function(r) {
      if (r.ok) {
        toast(uname + ' added as ' + role);
        currentOffice._users = r.data.data;
        renderCurrentUsers(r.data.data);
      } else {
        toast(r.data.message || 'Failed', 'error');
      }
    })
    .catch(function(e) {
      toast('Error: ' + e.message, 'error');
    });
}

function removeUserFromOffice() {
  var oid = document.getElementById('userManageOfficeId').value;
  var uname = document.getElementById('removeUsername').value.trim();
  var role = document.getElementById('removeUserRole').value;
  if (!uname) {
    toast('Enter username', 'error');
    return;
  }
  var body = { office_id: oid };
  body['remove_' + role] = uname;
  api('POST', '/api/dev/user-manage', body)
    .then(function(r) {
      if (r.ok) {
        toast(uname + ' removed');
        currentOffice._users = r.data.data;
        renderCurrentUsers(r.data.data);
      } else {
        toast(r.data.message || 'Failed', 'error');
      }
    })
    .catch(function(e) {
      toast('Error: ' + e.message, 'error');
    });
}

function createOffice() {
  var pbsId = parseInt(document.getElementById('createOfficePbs').value);
  var name = document.getElementById('createOfficeName').value.trim();
  var errEl = document.getElementById('createOfficeError');
  errEl.textContent = '';
  if (!pbsId) {
    errEl.textContent = 'Select a PBS';
    return;
  }
  if (!name) {
    errEl.textContent = 'Enter office name';
    return;
  }
  api('POST', '/api/dev/create-office', { pbs_id: pbsId, office_name: name })
    .then(function(r) {
      if (r.ok) {
        toast('Office created! ID: ' + r.data.data.office_id);
        document.getElementById('createOfficeName').value = '';
        document.getElementById('createOfficePbs').value = '';
      } else {
        errEl.textContent = r.data.message || 'Creation failed';
      }
    })
    .catch(function(e) {
      errEl.textContent = 'Error: ' + e.message;
    });
}

function searchUser() {
  var mobile = document.getElementById('searchMobile').value.trim();
  var resultEl = document.getElementById('userSearchResult');
  if (!mobile) {
    resultEl.innerHTML = '<div class="error-msg">Enter mobile number</div>';
    return;
  }
  resultEl.innerHTML = '<div class="loading"><div class="spinner"></div>Searching...</div>';
  fetch(BASE_URL + '/api/public/user-by-mobile/' + encodeURIComponent(mobile))
    .then(function(res) {
      return res.json().then(function(data) {
        return { ok: res.ok, data: data };
      });
    })
    .then(function(r) {
      if (!r.ok || !r.data.success) {
        resultEl.innerHTML = '<div class="empty-state"><div class="icon">?</div><p>' + (r.data.message || 'User not found') + '</p></div>';
        return;
      }
      var u = r.data.data;
      var uj = safeJson(u.user_json);
      var avatar = uj.profile_pic_url
        ? '<img src="' + uj.profile_pic_url + '" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid #334155">'
        : '<div style="width:48px;height:48px;border-radius:50%;background:#1e3a5f;display:flex;align-items:center;justify-content:center;font-size:1.4rem">U</div>';
      resultEl.innerHTML = '<div class="user-result"><div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">' + avatar + '<div><div style="font-weight:600;color:#f1f5f9">' + (uj.full_name || 'No name') + '</div><div style="font-size:.8rem;color:#64748b">@' + u.username + '</div></div></div><div class="user-info-grid"><div class="user-info-item"><label>Username</label><p><code style="color:#38bdf8">' + u.username + '</code></p></div><div class="user-info-item"><label>Mobile</label><p>' + (u.mobile_number || '—') + '</p></div><div class="user-info-item"><label>Full Name</label><p>' + (uj.full_name || '—') + '</p></div></div></div>';
    })
    .catch(function(e) {
      resultEl.innerHTML = '<div class="empty-state"><div class="icon">!</div><p>Error: ' + e.message + '</p></div>';
    });
}

document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.modal-overlay').forEach(function(ov) {
    ov.addEventListener('click', function(e) {
      if (e.target === ov) ov.classList.remove('open');
    });
  });
});
