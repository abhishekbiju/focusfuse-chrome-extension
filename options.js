document.addEventListener('DOMContentLoaded', async () => {
  const welcomeBanner = document.getElementById('welcome-banner');
  if (new URLSearchParams(location.search).get('welcome') === '1') {
    welcomeBanner.style.display = 'block';
  }

  const navItems = document.querySelectorAll('.nav-item');
  const views = document.querySelectorAll('.view');

  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      navItems.forEach((nav) => nav.classList.remove('active'));
      item.classList.add('active');
      const target = item.dataset.target;
      views.forEach((view) => {
        view.classList.toggle('active', view.id === `view-${target}`);
      });
    });
  });

  const DEFAULT_SETTINGS = {
    intentCooldownSec: 15,
    gracePeriodMins: 5,
    doomscrollThreshold: 150,
    blownBadgeClearMins: 2
  };

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function statusLabel(status) {
    if (status === 'COMPLETED') return 'Completed';
    if (status === 'ENDED_EARLY') return 'Ended early';
    if (status === 'BLOWN') return 'Blown';
    return escapeHtml(status);
  }

  function statusClass(status) {
    if (status === 'COMPLETED') return 'status-completed';
    if (status === 'ENDED_EARLY') return 'status-ended';
    if (status === 'BLOWN') return 'status-blown';
    return 'status-ended';
  }

  function formatDurationCell(session) {
    if (session.status === 'ENDED_EARLY' && session.plannedMins != null) {
      return `${session.durationMins} min <span class="muted">(planned ${session.plannedMins} min)</span>`;
    }
    return `${session.durationMins} min`;
  }

  const statTime = document.getElementById('stat-time');
  const statSuccess = document.getElementById('stat-success');
  const statBlown = document.getElementById('stat-blown');
  const historyTable = document.querySelector('#history-table tbody');
  const historyEmpty = document.getElementById('history-empty');

  const { history = [], blocklist = [] } = await chrome.storage.local.get(['history', 'blocklist']);

  let totalMins = 0;
  let successCount = 0;
  let blown = 0;

  history.forEach((session) => {
    if (session.status === 'COMPLETED' || session.status === 'ENDED_EARLY') {
      totalMins += Number(session.durationMins) || 0;
      successCount += 1;
    } else if (session.status === 'BLOWN') {
      blown += 1;
    }
  });

  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  statTime.textContent = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  statSuccess.textContent = String(successCount);
  statBlown.textContent = String(blown);

  if (history.length === 0) {
    historyEmpty.style.display = 'block';
  } else {
    const sorted = [...history].sort((a, b) => new Date(b.date) - new Date(a.date));
    sorted.forEach((session) => {
      const tr = document.createElement('tr');
      const date = new Date(session.date);
      const dateStr =
        date.toLocaleDateString() +
        ' ' +
        date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      tr.innerHTML = `
        <td><strong>${escapeHtml(session.taskId)}</strong></td>
        <td>${formatDurationCell(session)}</td>
        <td><span class="status-badge ${statusClass(session.status)}">${statusLabel(session.status)}</span></td>
        <td style="color: var(--text-secondary); font-size: 13px;">${escapeHtml(dateStr)}</td>
      `;
      historyTable.appendChild(tr);
    });
  }

  const domainList = document.getElementById('domain-list');
  const domainInput = document.getElementById('domain-input');
  const btnAddDomain = document.getElementById('btn-add-domain');

  let currentBlocklist = [...blocklist];

  function renderBlocklist() {
    domainList.innerHTML = '';
    currentBlocklist.forEach((domain, idx) => {
      const li = document.createElement('li');
      li.className = 'domain-item';
      li.innerHTML = `
        <span class="domain-name">${escapeHtml(domain)}</span>
        <button type="button" class="delete-btn" data-idx="${idx}" aria-label="Remove ${escapeHtml(domain)}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"></path>
          </svg>
        </button>
      `;
      domainList.appendChild(li);
    });

    domainList.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        currentBlocklist.splice(idx, 1);
        await chrome.storage.local.set({ blocklist: currentBlocklist });
        renderBlocklist();
      });
    });
  }

  renderBlocklist();

  btnAddDomain.addEventListener('click', async () => {
    const val = domainInput.value.trim().toLowerCase();
    if (!val) return;

    let domain = val;
    try {
      if (val.startsWith('http')) {
        domain = new URL(val).hostname;
      }
    } catch {
      /* ignore */
    }

    domain = domain.replace(/^www\./, '');

    if (domain && !currentBlocklist.includes(domain)) {
      currentBlocklist.push(domain);
      await chrome.storage.local.set({ blocklist: currentBlocklist });
      domainInput.value = '';
      renderBlocklist();
    }
  });

  domainInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnAddDomain.click();
    }
  });

  const setCooldown = document.getElementById('set-cooldown');
  const setGrace = document.getElementById('set-grace');
  const setDoom = document.getElementById('set-doom');
  const setBadge = document.getElementById('set-badge');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const settingsSaved = document.getElementById('settings-saved');

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  async function loadSettingsForm() {
    const { settings = {} } = await chrome.storage.local.get('settings');
    const s = { ...DEFAULT_SETTINGS, ...settings };
    setCooldown.value = String(s.intentCooldownSec);
    setGrace.value = String(s.gracePeriodMins);
    setDoom.value = String(s.doomscrollThreshold);
    setBadge.value = String(s.blownBadgeClearMins);
  }

  await loadSettingsForm();

  btnSaveSettings.addEventListener('click', async () => {
    const settings = {
      intentCooldownSec: clamp(parseInt(setCooldown.value, 10) || 15, 5, 120),
      gracePeriodMins: clamp(parseInt(setGrace.value, 10) || 5, 1, 60),
      doomscrollThreshold: clamp(parseInt(setDoom.value, 10) || 150, 30, 500),
      blownBadgeClearMins: clamp(parseInt(setBadge.value, 10) || 2, 1, 60)
    };
    await chrome.storage.local.set({ settings });
    settingsSaved.style.display = 'block';
    setTimeout(() => {
      settingsSaved.style.display = 'none';
    }, 2200);
  });

  document.getElementById('btn-export').addEventListener('click', async () => {
    const data = await chrome.storage.local.get(['history', 'blocklist', 'settings']);
    const blob = new Blob(
      [
        JSON.stringify(
          {
            focusfuseExport: true,
            version: 1,
            exportedAt: new Date().toISOString(),
            history: data.history || [],
            blocklist: data.blocklist || [],
            settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) }
          },
          null,
          2
        )
      ],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `focusfuse-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('btn-import').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;

    const text = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      alert('That file is not valid JSON.');
      return;
    }

    const looksValid =
      parsed.focusfuseExport === true ||
      (Array.isArray(parsed.history) && Array.isArray(parsed.blocklist));
    if (!looksValid) {
      alert('Unrecognized backup format.');
      return;
    }

    if (!confirm('Replace history, blocklist, and settings with this file?')) return;

    const nextHistory = Array.isArray(parsed.history) ? parsed.history : [];
    const nextBlocklist = Array.isArray(parsed.blocklist) ? parsed.blocklist : [];
    const nextSettings =
      parsed.settings && typeof parsed.settings === 'object'
        ? { ...DEFAULT_SETTINGS, ...parsed.settings }
        : DEFAULT_SETTINGS;

    await chrome.storage.local.set({
      history: nextHistory,
      blocklist: nextBlocklist,
      settings: nextSettings
    });
    location.reload();
  });

  document.getElementById('btn-clear-history').addEventListener('click', async () => {
    if (!confirm('Delete all session history? Your blocklist and settings stay.')) return;
    await chrome.storage.local.set({ history: [] });
    location.reload();
  });
});
