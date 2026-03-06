// FocusFuse Background Service Worker

// Default blocked domains
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

chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        // Initialize default settings
        await chrome.storage.local.set({
            blocklist: DEFAULT_BLOCKLIST,
            activeSession: null,
            history: [] // { taskId, durationMins, status: 'COMPLETED' | 'BLOWN', date }
        });
    }
});

// Pomodoro Timer Engine
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'focusTimerTick') {
        const { activeSession } = await chrome.storage.local.get('activeSession');
        if (!activeSession) {
            chrome.action.setBadgeText({ text: '' });
            chrome.alarms.clear('focusTimerTick');
            return;
        }

        const now = Date.now();
        const remainingMs = activeSession.endTime - now;

        if (remainingMs <= 0) {
            // Session Complete
            await completeSession(activeSession);
        } else {
            // Update badge
            const remainingMins = Math.ceil(remainingMs / 60000);
            chrome.action.setBadgeText({ text: `${remainingMins}m` });
            chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' }); // Green for active focus
        }
    }
});

async function completeSession(session) {
    const { history = [] } = await chrome.storage.local.get('history');

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
    chrome.alarms.clear('focusTimerTick');

    // Optional: Notify user
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'assets/icon-128.png',
        title: 'Focus Session Complete!',
        message: `Great job completing: ${session.taskId}`,
        priority: 2
    });
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

        chrome.action.setBadgeText({ text: 'BLOWN' });
        chrome.action.setBadgeBackgroundColor({ color: '#F44336' }); // Red for blown
        chrome.alarms.clear('focusTimerTick');
    }
}

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_SESSION') {
        const { taskId, durationMins } = message.payload;
        const now = Date.now();
        const endTime = now + (durationMins * 60000);

        const session = {
            taskId,
            durationMins,
            startTime: now,
            endTime,
            status: 'RUNNING'
        };

        chrome.storage.local.set({ activeSession: session }).then(() => {
            chrome.action.setBadgeText({ text: `${durationMins}m` });
            chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
            // Tick every 1 minute to update badge
            chrome.alarms.create('focusTimerTick', { periodInMinutes: 1 });
            sendResponse({ success: true });
        });
        return true; // async response
    }

    if (message.action === 'BLOW_FUSE') {
        blowFuse().then(() => sendResponse({ success: true }));
        return true;
    }

    if (message.action === 'END_SESSION_EARLY') {
        chrome.storage.local.set({ activeSession: null }).then(() => {
            chrome.action.setBadgeText({ text: '' });
            chrome.alarms.clear('focusTimerTick');
            sendResponse({ success: true });
        });
        return true;
    }
});
