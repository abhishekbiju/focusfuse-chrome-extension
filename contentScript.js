(async () => {
    // Only run in top frame
    if (window.top !== window.self) return;

    const hostname = window.location.hostname;

    // Quick check: is there an active session and is this site blocked?
    const { blocklist = [], activeSession = null } = await chrome.storage.local.get(['blocklist', 'activeSession']);

    if (!activeSession) return;

    const matchedDomain = blocklist.find(domain => hostname.includes(domain));
    if (!matchedDomain) return;

    // Use the matched domain for the grace period (so www.reddit.com and old.reddit.com share it)
    const { gracePeriods = {} } = await chrome.storage.local.get('gracePeriods');
    const domainGracePeriod = gracePeriods[matchedDomain] || gracePeriods[hostname];
    if (domainGracePeriod && domainGracePeriod > Date.now()) {
        // We are allowed to access it temporarily
        return;
    }

    // INTERCEPT!
    injectIntentCheckUI(activeSession.taskId, matchedDomain);
})();

function injectIntentCheckUI(taskId, matchedDomain) {
    // Prevent scrolling on the main body securely
    const disableScroll = () => {
        if (document.body) document.body.style.overflow = 'hidden';
    };
    const enableScroll = () => {
        if (document.body) document.body.style.overflow = '';
    };

    if (document.body) {
        disableScroll();
    } else {
        window.addEventListener('DOMContentLoaded', disableScroll);
    }

    // Create shadow DOM host to prevent site CSS interference
    const host = document.createElement('div');
    host.id = 'focusfuse-intent-host';

    // Make sure we overlay everything
    host.style.position = 'fixed';
    host.style.top = '0';
    host.style.left = '0';
    host.style.width = '100vw';
    host.style.height = '100vh';
    host.style.zIndex = '2147483647'; // max z-index

    const shadow = host.attachShadow({ mode: 'closed' });

    // Overlay styles
    const style = document.createElement('style');
    style.textContent = `
        :host {
            all: initial;
        }
        .focusfuse-overlay {
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(15, 23, 42, 0.85); /* Dark slate with opacity */
            backdrop-filter: blur(12px); /* Glassmorphism blur */
            -webkit-backdrop-filter: blur(12px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 999999999;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: white;
        }

        .focusfuse-dialog {
            background: rgba(30, 41, 59, 0.95);
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
            font-size: 24px;
            margin: 0 0 16px 0;
            font-weight: 700;
            color: #f8fafc;
            line-height: 1.3;
        }

        .task-name {
            color: #38bdf8; /* Light blue */
        }

        p {
            font-size: 16px;
            color: #cbd5e1;
            margin-bottom: 32px;
            line-height: 1.5;
        }

        .btn-group {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        button {
            border: none;
            padding: 16px 24px;
            border-radius: 12px;
            font-size: 16px;
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
            box-shadow: 0 4px 14px 0 rgba(37, 99, 235, 0.39);
        }

        .btn-no:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px 0 rgba(37, 99, 235, 0.39);
        }
    `;

    // Overlay structure
    const overlay = document.createElement('div');
    overlay.className = 'focusfuse-overlay';

    overlay.innerHTML = `
        <div class="focusfuse-dialog">
            <h1>Hold on. Is this required for <br/><span class="task-name">"${taskId}"</span>?</h1>
            <p>You are currently in an active focus session. Approaching this site without intent will blow your fuse.</p>
            <div class="btn-group">
                <button class="btn-no" id="btn-save">No, save my fuse — get me out</button>
                <button class="btn-yes" id="btn-allow">Yes, I need this (5 min allowance)</button>
                <button class="btn-yes" style="color:#f87171" id="btn-blow">I'm distracted. Blow my fuse.</button>
            </div>
        </div>
    `;

    shadow.appendChild(style);
    shadow.appendChild(overlay);
    document.documentElement.appendChild(host); // attach to html, not body, to ensure it sits on top of everything early

    // Events
    shadow.getElementById('btn-save').addEventListener('click', () => {
        window.history.back(); // Try to go back
        setTimeout(() => {
            // If back didn't work (e.g. opened in new tab), close it
            window.location.href = "chrome-extension://" + chrome.runtime.id + "/options.html"; // Safe redirect
        }, 300);
    });

    shadow.getElementById('btn-allow').addEventListener('click', async () => {
        // Grant 5 minute grace period for this domain
        const { gracePeriods = {} } = await chrome.storage.local.get('gracePeriods');
        gracePeriods[matchedDomain] = Date.now() + (5 * 60000);
        await chrome.storage.local.set({ gracePeriods });

        // Remove overlay and restore scroll
        host.remove();
        enableScroll();
        window.removeEventListener('DOMContentLoaded', disableScroll);
    });

    shadow.getElementById('btn-blow').addEventListener('click', () => {
        // Blow the fuse!
        chrome.runtime.sendMessage({ action: 'BLOW_FUSE' }, () => {
            // Remove overlay so they can freely browse in shame
            host.remove();
            enableScroll();
            window.removeEventListener('DOMContentLoaded', disableScroll);
        });
    });
}
