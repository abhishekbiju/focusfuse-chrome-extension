let timerInterval;

document.addEventListener('DOMContentLoaded', async () => {
    // Elements
    const viewSetup = document.getElementById('view-setup');
    const viewActive = document.getElementById('view-active');

    // Setup View Elements
    const taskInput = document.getElementById('task-input');
    const durationSlider = document.getElementById('duration-slider');
    const sliderVal = document.getElementById('slider-val');
    const pills = document.querySelectorAll('.dur-pill');
    const btnIgnite = document.getElementById('btn-ignite');
    let selectedDuration = parseInt(durationSlider.value, 10);

    // Active View Elements
    const activeTaskName = document.getElementById('active-task-name');
    const timeRemaining = document.getElementById('time-remaining');
    const timerProgress = document.querySelector('.timer-progress');
    const btnAbort = document.getElementById('btn-abort');
    const btnOptions = document.getElementById('btn-options');

    // 1. Initial State Check
    const checkState = async () => {
        const { activeSession } = await chrome.storage.local.get('activeSession');
        if (activeSession) {
            showActiveView(activeSession);
        } else {
            showSetupView();
        }
    };

    checkState();

    // 2. Setup View Logic
    const updateDisplayStr = (duration) => {
        let displayStr = "";
        if (duration >= 60) {
            const h = Math.floor(duration / 60);
            const m = duration % 60;
            displayStr = m > 0 ? `${h}h ${m}m` : `${h}h`;
        } else {
            displayStr = `${duration}m`;
        }
        sliderVal.textContent = displayStr;
    };

    const setDuration = (duration) => {
        selectedDuration = duration;
        durationSlider.value = duration;
        updateDisplayStr(duration);

        // sync pills
        pills.forEach(p => p.classList.remove('active'));
        pills.forEach(p => {
            if (parseInt(p.dataset.mins, 10) === duration) {
                p.classList.add('active');
            }
        });
    };

    pills.forEach(pill => {
        pill.addEventListener('click', () => {
            setDuration(parseInt(pill.dataset.mins, 10));
        });
    });

    // Initialize duration display and pill state
    setDuration(selectedDuration);

    durationSlider.addEventListener('input', (e) => {
        setDuration(parseInt(e.target.value, 10));
    });

    taskInput.addEventListener('input', () => {
        btnIgnite.disabled = taskInput.value.trim().length === 0;
    });
    // Trigger validation
    btnIgnite.disabled = taskInput.value.trim().length === 0;

    btnIgnite.addEventListener('click', () => {
        const taskId = taskInput.value.trim();
        if (!taskId) return;

        btnIgnite.textContent = "Igniting...";

        chrome.runtime.sendMessage({
            action: 'START_SESSION',
            payload: { taskId, durationMins: selectedDuration }
        }, (response) => {
            if (response && response.success) {
                checkState();
            }
        });
    });

    // 3. Active View Logic
    const CIRCUMFERENCE = 2 * Math.PI * 45; // r=45 config in SVG

    function showActiveView(session) {
        viewSetup.classList.remove('active');
        viewActive.classList.add('active');

        activeTaskName.textContent = session.taskId;

        // Start local UI tick
        if (timerInterval) clearInterval(timerInterval);

        const tick = () => {
            const now = Date.now();
            let remainingMs = session.endTime - now;

            if (remainingMs <= 0) {
                clearInterval(timerInterval);
                checkState(); // Should show setup view because service worker handled completion
                return;
            }

            // Format time (MM:SS)
            const totalSeconds = Math.floor(remainingMs / 1000);
            const mins = Math.floor(totalSeconds / 60);
            const secs = totalSeconds % 60;
            timeRemaining.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

            // Update SVG Progress
            const totalSessionMs = session.durationMins * 60000;
            const progressRatio = remainingMs / totalSessionMs;
            const dashoffset = CIRCUMFERENCE - (progressRatio * CIRCUMFERENCE);
            timerProgress.style.strokeDashoffset = dashoffset;
        };

        tick();
        timerInterval = setInterval(tick, 1000);
    }

    function showSetupView() {
        if (timerInterval) clearInterval(timerInterval);
        viewActive.classList.remove('active');
        viewSetup.classList.add('active');
        btnIgnite.innerHTML = `Ignite Fuse <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ml-2"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>`;
        taskInput.value = '';
        btnIgnite.disabled = true;
    }

    btnAbort.addEventListener('click', () => {
        const confirmBlow = confirm("Are you sure you want to abandon this task and blow your fuse?");
        if (confirmBlow) {
            chrome.runtime.sendMessage({ action: 'BLOW_FUSE' }, () => {
                showSetupView();
            });
        }
    });

    // 4. Options Page Navigation
    btnOptions.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });
});
