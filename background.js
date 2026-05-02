// FocusFuse — background service worker

const DEFAULT_BLOCKLIST = [
  'reddit.com',
  'youtube.com',
  'twitter.com',
  'x.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'netflix.com'
];

const DEFAULT_SETTINGS = {
  intentCooldownSec: 15,
  gracePeriodMins: 5,
  doomscrollThreshold: 150,
  blownBadgeClearMins: 2
};

const ALARM_TICK = 'focusTimerTick';
const ALARM_SESSION_END = 'focusSessionEnd';
const ALARM_CLEAR_BLOWN = 'focusfuseClearBlownBadge';

async function ensureStorageShape() {
  const data = await chrome.storage.local.get(null);
  const patch = {};

  if (!Array.isArray(data.blocklist)) {
    patch.blocklist = [...DEFAULT_BLOCKLIST];
  }
  if (!Array.isArray(data.history)) {
    patch.history = [];
  }
  if (data.gracePeriods == null || typeof data.gracePeriods !== 'object') {
    patch.gracePeriods = {};
  }
  if (data.settings == null || typeof data.settings !== 'object') {
    patch.settings = { ...DEFAULT_SETTINGS };
  }

  if (Object.keys(patch).length) {
    await chrome.storage.local.set(patch);
  }
}

function syncBadgeFromSession(activeSession) {
  if (!activeSession) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  const now = Date.now();
  const remainingMs = activeSession.endTime - now;
  if (remainingMs <= 0) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  const remainingMins = Math.max(1, Math.ceil(remainingMs / 60000));
  chrome.action.setBadgeText({ text: `${remainingMins}m` });
  chrome.action.setBadgeBackgroundColor({ color: '#15803d' });
}

async function ensureTimerAlarm() {
  const { activeSession } = await chrome.storage.local.get('activeSession');
  if (!activeSession) {
    await chrome.alarms.clear(ALARM_TICK);
    await chrome.alarms.clear(ALARM_SESSION_END);
    syncBadgeFromSession(null);
    return;
  }
  const tick = await chrome.alarms.get(ALARM_TICK);
  if (!tick) {
    await chrome.alarms.create(ALARM_TICK, { periodInMinutes: 1 });
  }
  const end = await chrome.alarms.get(ALARM_SESSION_END);
  if (!end || Math.abs(end.scheduledTime - activeSession.endTime) > 2000) {
    await chrome.alarms.clear(ALARM_SESSION_END);
    await chrome.alarms.create(ALARM_SESSION_END, { when: activeSession.endTime });
  }
  syncBadgeFromSession(activeSession);
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureStorageShape();

  if (details.reason === 'install') {
    await chrome.storage.local.set({
      blocklist: DEFAULT_BLOCKLIST,
      activeSession: null,
      history: [],
      gracePeriods: {},
      settings: { ...DEFAULT_SETTINGS }
    });
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html?welcome=1') });
  }

  await ensureTimerAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureStorageShape();
  await ensureTimerAlarm();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_SESSION_END) {
    const { activeSession } = await chrome.storage.local.get('activeSession');
    if (activeSession && Date.now() >= activeSession.endTime - 500) {
      await completeSession(activeSession);
    }
    return;
  }

  if (alarm.name === ALARM_TICK) {
    const { activeSession } = await chrome.storage.local.get('activeSession');
    if (!activeSession) {
      await chrome.alarms.clear(ALARM_TICK);
      chrome.action.setBadgeText({ text: '' });
      return;
    }

    const now = Date.now();
    const remainingMs = activeSession.endTime - now;

    if (remainingMs <= 0) {
      await completeSession(activeSession);
    } else {
      syncBadgeFromSession(activeSession);
    }
    return;
  }

  if (alarm.name === ALARM_CLEAR_BLOWN) {
    const { activeSession } = await chrome.storage.local.get('activeSession');
    if (!activeSession) {
      chrome.action.setBadgeText({ text: '' });
    }
    await chrome.alarms.clear(ALARM_CLEAR_BLOWN);
  }
});

async function notifyCompletion(title, message) {
  try {
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'assets/icon-128.png',
      title,
      message,
      priority: 2
    });
  } catch {
    // Notifications may be disabled by the user or unsupported in context
  }
}

async function completeSession(session) {
  const { activeSession, history = [] } = await chrome.storage.local.get(['activeSession', 'history']);
  if (!activeSession || activeSession.endTime !== session.endTime) {
    return;
  }

  history.push({
    taskId: session.taskId,
    durationMins: session.durationMins,
    status: 'COMPLETED',
    date: new Date().toISOString()
  });

  await chrome.storage.local.set({
    activeSession: null,
    history
  });

  chrome.action.setBadgeText({ text: '' });
  await chrome.alarms.clear(ALARM_TICK);
  await chrome.alarms.clear(ALARM_SESSION_END);

  await notifyCompletion(
    'Focus session complete',
    `Nice work on: ${session.taskId}`
  );
}

async function completeSessionEarly(session) {
  const { activeSession, history = [] } = await chrome.storage.local.get(['activeSession', 'history']);
  if (!activeSession || activeSession.startTime !== session.startTime) {
    return false;
  }

  const now = Date.now();
  const elapsedMs = Math.max(0, Math.min(now, session.endTime) - session.startTime);
  const actualMins = Math.max(1, Math.ceil(elapsedMs / 60000));

  history.push({
    taskId: session.taskId,
    durationMins: actualMins,
    plannedMins: session.durationMins,
    status: 'ENDED_EARLY',
    date: new Date().toISOString()
  });

  await chrome.storage.local.set({
    activeSession: null,
    history
  });

  chrome.action.setBadgeText({ text: '' });
  await chrome.alarms.clear(ALARM_TICK);
  await chrome.alarms.clear(ALARM_SESSION_END);

  await notifyCompletion(
    'Session ended early',
    `Logged ${actualMins} min for: ${session.taskId}`
  );
  return true;
}

async function blowFuse() {
  const { activeSession, history = [] } = await chrome.storage.local.get(['activeSession', 'history']);

  if (activeSession) {
    history.push({
      taskId: activeSession.taskId,
      durationMins: activeSession.durationMins,
      status: 'BLOWN',
      date: new Date().toISOString()
    });

    await chrome.storage.local.set({
      activeSession: null,
      history
    });

    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#b91c1c' });

    await chrome.alarms.clear(ALARM_TICK);
    await chrome.alarms.clear(ALARM_SESSION_END);

    const { settings } = await chrome.storage.local.get('settings');
    const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    const delayMins = Math.max(1, merged.blownBadgeClearMins || 2);
    await chrome.alarms.create(ALARM_CLEAR_BLOWN, { delayInMinutes: delayMins });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_SESSION') {
    const { taskId, durationMins } = message.payload;
    const now = Date.now();
    const endTime = now + durationMins * 60000;

    const session = {
      taskId,
      durationMins,
      startTime: now,
      endTime,
      status: 'RUNNING'
    };

    (async () => {
      await chrome.storage.local.set({ activeSession: session });
      syncBadgeFromSession(session);
      await chrome.alarms.clear(ALARM_TICK);
      await chrome.alarms.clear(ALARM_SESSION_END);
      await chrome.alarms.create(ALARM_TICK, { periodInMinutes: 1 });
      await chrome.alarms.create(ALARM_SESSION_END, { when: session.endTime });
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.action === 'BLOW_FUSE') {
    blowFuse().then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === 'COMPLETE_SESSION_EARLY') {
    (async () => {
      const { activeSession } = await chrome.storage.local.get('activeSession');
      if (!activeSession) {
        sendResponse({ success: false, error: 'NO_SESSION' });
        return;
      }
      const ok = await completeSessionEarly(activeSession);
      sendResponse({ success: Boolean(ok) });
    })();
    return true;
  }

  if (message.action === 'END_SESSION_EARLY') {
    (async () => {
      await chrome.storage.local.set({ activeSession: null });
      chrome.action.setBadgeText({ text: '' });
      await chrome.alarms.clear(ALARM_TICK);
      await chrome.alarms.clear(ALARM_SESSION_END);
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.action === 'GET_ACTIVE_SESSION') {
    chrome.storage.local.get('activeSession').then(({ activeSession }) => {
      sendResponse({ activeSession: activeSession || null });
    });
    return true;
  }

  if (message.action === 'ESCAPE_DISTRACTION') {
    const tabId = sender.tab?.id;
    if (tabId == null) {
      sendResponse({ success: false, error: 'NO_TAB' });
      return false;
    }
    chrome.tabs.goBack(tabId, () => {
      if (chrome.runtime.lastError) {
        chrome.tabs.update(tabId, { url: chrome.runtime.getURL('options.html') });
      }
      sendResponse({ success: true });
    });
    return true;
  }

  return false;
});
