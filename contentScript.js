(function () {
  if (window.top !== window.self) return;

  const DEFAULTS = {
    intentCooldownSec: 15,
    gracePeriodMins: 5,
    doomscrollThreshold: 150
  };

  function hostnameMatchesBlocklist(hostname, blocklist) {
    const h = hostname.replace(/^www\./, '').toLowerCase();
    for (const raw of blocklist) {
      const d = String(raw).replace(/^www\./, '').toLowerCase().trim();
      if (!d) continue;
      if (h === d || h.endsWith('.' + d)) return d;
    }
    return null;
  }

  (async () => {
    const { blocklist = [], activeSession = null, gracePeriods = {}, settings: raw = {} } =
      await chrome.storage.local.get(['blocklist', 'activeSession', 'gracePeriods', 'settings']);

    if (!activeSession) return;

    const settings = { ...DEFAULTS, ...raw };
    const hostname = window.location.hostname;
    const matchedDomain = hostnameMatchesBlocklist(hostname, blocklist);
    if (!matchedDomain) return;

    const domainGracePeriod = gracePeriods[matchedDomain] || gracePeriods[hostname];
    let scrollScore = 0;
    const threshold = Math.max(30, Number(settings.doomscrollThreshold) || DEFAULTS.doomscrollThreshold);

    const checkDoomscroll = () => {
      scrollScore += 1;
      if (scrollScore > threshold) {
        document.removeEventListener('scroll', checkDoomscroll, true);
        document.removeEventListener('click', resetScrollState, true);
        scrollScore = 0;
        if (document.getElementById('focusfuse-intent-host')) return;
        injectIntentCheckUI(activeSession.taskId, matchedDomain, true, settings);
      }
    };

    const resetScrollState = () => {
      scrollScore = 0;
    };

    if (domainGracePeriod && domainGracePeriod > Date.now()) {
      document.addEventListener('scroll', checkDoomscroll, { passive: true, capture: true });
      document.addEventListener('click', resetScrollState, { passive: true, capture: true });
      return;
    }

    injectIntentCheckUI(activeSession.taskId, matchedDomain, false, settings);
  })();
})();

function injectIntentCheckUI(taskId, matchedDomain, isDoomscrollEvent, settings) {
  const cooldownSec = Math.max(5, Math.min(120, Number(settings.intentCooldownSec) || 15));
  const graceMs = Math.max(60000, (Number(settings.gracePeriodMins) || 5) * 60000);

  const disableScroll = () => {
    if (document.body) document.body.style.overflow = 'hidden';
  };
  const enableScroll = () => {
    if (document.body) document.body.style.overflow = '';
  };

  if (document.body) {
    disableScroll();
  } else {
    window.addEventListener('DOMContentLoaded', disableScroll, { once: true });
  }

  const host = document.createElement('div');
  host.id = 'focusfuse-intent-host';

  host.style.cssText =
    'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;margin:0;padding:0;border:0;';

  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
        :host { all: initial; }
        .focusfuse-overlay {
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(15, 23, 42, 0.88);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 999999999;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: white;
        }
        .focusfuse-dialog {
            background: rgba(30, 41, 59, 0.96);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 40px;
            max-width: 500px;
            text-align: center;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            animation: popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes popIn {
            from { opacity: 0; transform: scale(0.95) translateY(10px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
        }
        h1 {
            font-size: 22px;
            margin: 0 0 16px 0;
            font-weight: 700;
            color: #f8fafc;
            line-height: 1.35;
        }
        .task-name { color: #38bdf8; }
        p {
            font-size: 15px;
            color: #cbd5e1;
            margin-bottom: 28px;
            line-height: 1.5;
        }
        .btn-group { display: flex; flex-direction: column; gap: 12px; }
        button {
            border: none;
            padding: 14px 22px;
            border-radius: 12px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn-yes {
            background: rgba(255, 255, 255, 0.05);
            color: #94a3b8;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .btn-yes:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #f8fafc;
        }
        .btn-no {
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
            color: white;
            box-shadow: 0 4px 14px 0 rgba(37, 99, 235, 0.35);
        }
        .btn-no:hover {
            transform: translateY(-1px);
            box-shadow: 0 6px 20px 0 rgba(37, 99, 235, 0.35);
        }
        .cooldown-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            margin: 32px 0;
        }
        .breathing-circle {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            background: rgba(59, 130, 246, 0.2);
            border: 2px solid #3b82f6;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            font-weight: 700;
            color: #3b82f6;
            animation: breathe 4s ease-in-out infinite;
        }
        @keyframes breathe {
            0%, 100% { transform: scale(1); opacity: 0.5; }
            50% { transform: scale(1.45); opacity: 1; }
        }
        .hidden { display: none !important; }
        .confession-area {
            margin-top: 16px;
            padding-top: 16px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            text-align: left;
        }
        .confession-text {
            font-size: 13px;
            color: #94a3b8;
            margin-bottom: 8px;
            user-select: none;
            font-style: italic;
        }
        .confession-input {
            width: 100%;
            background: rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.1);
            padding: 12px;
            border-radius: 8px;
            color: white;
            font-family: inherit;
            margin-bottom: 12px;
            box-sizing: border-box;
        }
        .confession-input:focus {
            outline: none;
            border-color: #f87171;
        }
        .btn-danger {
            background: #ef4444;
            color: white;
            width: 100%;
        }
        .btn-danger:disabled {
            background: rgba(239, 68, 68, 0.3);
            color: rgba(255, 255, 255, 0.5);
            cursor: not-allowed;
            transform: none;
        }
    `;

  const overlay = document.createElement('div');
  overlay.className = 'focusfuse-overlay';

  const graceMinsLabel = Math.round(graceMs / 60000);
  const titleHtml = isDoomscrollEvent
    ? `<h1>Still working on <br/><span class="task-name">"${escapeHtml(taskId)}"</span>,<br/>or scrolling?</h1>`
    : `<h1>Pause. Needed for <br/><span class="task-name">"${escapeHtml(taskId)}"</span>?</h1>`;

  const expectedConfession = `I am choosing to abandon my focus session on ${taskId} to look at ${matchedDomain}`;

  overlay.innerHTML = `
        <div class="focusfuse-dialog">
            ${titleHtml}
            <p>You have an active focus session. Opening this site without intent will blow your fuse.</p>
            <div id="cooldown-view" class="cooldown-container">
                <div class="breathing-circle" id="cd-timer">${cooldownSec}</div>
                <p style="margin-top: 20px; font-size: 14px; opacity: 0.7;">Take a breath…</p>
            </div>
            <div id="action-view" class="hidden">
                <div class="btn-group">
                    <button type="button" class="btn-no" id="btn-save">Leave this site</button>
                    <button type="button" class="btn-yes" id="btn-allow">I need this (${graceMinsLabel} min access)</button>
                    <button type="button" class="btn-yes" style="color:#f87171" id="btn-show-confession">I'm distracted — blow my fuse</button>
                </div>
                <div id="confession-view" class="confession-area hidden">
                    <div class="confession-text">Type exactly:<br/><strong style="color:white">"${escapeHtml(expectedConfession)}"</strong></div>
                    <input type="text" id="confession-input" class="confession-input" autocomplete="off" spellcheck="false" placeholder="Type here…" />
                    <button type="button" class="btn-danger" id="btn-blow" disabled>Blow fuse</button>
                </div>
            </div>
        </div>
    `;

  shadow.appendChild(style);
  shadow.appendChild(overlay);
  document.documentElement.appendChild(host);

  const cooldownView = shadow.getElementById('cooldown-view');
  const actionView = shadow.getElementById('action-view');
  const cdTimer = shadow.getElementById('cd-timer');
  const btnShowConfession = shadow.getElementById('btn-show-confession');
  const confessionView = shadow.getElementById('confession-view');
  const confessionInput = shadow.getElementById('confession-input');
  const btnBlow = shadow.getElementById('btn-blow');

  let timeLeft = cooldownSec;
  const cdInterval = setInterval(() => {
    timeLeft -= 1;
    if (timeLeft <= 0) {
      clearInterval(cdInterval);
      cooldownView.classList.add('hidden');
      actionView.classList.remove('hidden');
    } else {
      cdTimer.textContent = String(timeLeft);
    }
  }, 1000);

  const teardown = () => {
    clearInterval(cdInterval);
    enableScroll();
    window.removeEventListener('DOMContentLoaded', disableScroll);
    window.removeEventListener('pagehide', onPageHide);
    if (host.isConnected) host.remove();
  };

  const onPageHide = () => {
    clearInterval(cdInterval);
  };
  window.addEventListener('pagehide', onPageHide);

  shadow.getElementById('btn-save').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'ESCAPE_DISTRACTION' }, () => {
      void chrome.runtime.lastError;
      teardown();
    });
  });

  shadow.getElementById('btn-allow').addEventListener('click', async () => {
    const { gracePeriods = {} } = await chrome.storage.local.get('gracePeriods');
    gracePeriods[matchedDomain] = Date.now() + graceMs;
    await chrome.storage.local.set({ gracePeriods });
    teardown();
  });

  btnShowConfession.addEventListener('click', () => {
    btnShowConfession.classList.add('hidden');
    confessionView.classList.remove('hidden');
    confessionInput.focus();
  });

  confessionInput.addEventListener('input', (e) => {
    const val = e.target.value.trim().toLowerCase();
    const normalizedExpected = expectedConfession.toLowerCase().replace(/[.!]*$/, '');
    const normalizedVal = val.replace(/[.!]*$/, '');
    btnBlow.disabled = normalizedVal !== normalizedExpected;
  });

  btnBlow.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'BLOW_FUSE' }, () => {
      teardown();
    });
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
