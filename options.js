document.addEventListener('DOMContentLoaded', async () => {
    // Nav Logic
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Update nav active
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Update views
            const target = item.dataset.target;
            views.forEach(view => {
                if (view.id === `view-${target}`) {
                    view.classList.add('active');
                } else {
                    view.classList.remove('active');
                }
            });
        });
    });

    // Load Data
    const { history = [], blocklist = [] } = await chrome.storage.local.get(['history', 'blocklist']);

    // --- Dashboard Rendering ---
    const statTime = document.getElementById('stat-time');
    const statSuccess = document.getElementById('stat-success');
    const statBlown = document.getElementById('stat-blown');
    const historyTable = document.querySelector('#history-table tbody');
    const historyEmpty = document.getElementById('history-empty');

    let totalMins = 0;
    let completed = 0;
    let blown = 0;

    history.forEach(session => {
        if (session.status === 'COMPLETED') {
            totalMins += session.durationMins;
            completed++;
        } else {
            blown++;
        }
    });

    // Format time
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    statTime.textContent = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    statSuccess.textContent = completed;
    statBlown.textContent = blown;

    // Render Table
    if (history.length === 0) {
        historyEmpty.style.display = 'block';
    } else {
        // Sort history by date desc
        const sorted = [...history].sort((a, b) => new Date(b.date) - new Date(a.date));

        sorted.forEach(session => {
            const tr = document.createElement('tr');

            const date = new Date(session.date);
            const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            tr.innerHTML = `
                <td><strong>${session.taskId}</strong></td>
                <td>${session.durationMins} min</td>
                <td><span class="status-badge ${session.status === 'COMPLETED' ? 'status-completed' : 'status-blown'}">${session.status}</span></td>
                <td style="color: var(--text-secondary); font-size: 13px;">${dateStr}</td>
            `;
            historyTable.appendChild(tr);
        });
    }

    // --- Blocklist Rendering ---
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
                <span class="domain-name">${domain}</span>
                <button class="delete-btn" data-idx="${idx}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"></path>
                    </svg>
                </button>
            `;
            domainList.appendChild(li);
        });

        // Attach delete events
        document.querySelectorAll('.delete-btn').forEach(btn => {
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

        // simple URL extraction just in case they pasted https://reddit.com
        let domain = val;
        try {
            if (val.startsWith('http')) {
                domain = new URL(val).hostname;
            }
        } catch (e) { }

        // remove wwww
        domain = domain.replace(/^www\./, '');

        if (domain && !currentBlocklist.includes(domain)) {
            currentBlocklist.push(domain);
            await chrome.storage.local.set({ blocklist: currentBlocklist });
            domainInput.value = '';
            renderBlocklist();
        }
    });

    domainInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            btnAddDomain.click();
        }
    });
});
