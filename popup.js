let timerInterval;

document.addEventListener('DOMContentLoaded', async () => {
  const viewSetup = document.getElementById('view-setup');
  const viewActive = document.getElementById('view-active');

  const taskInput = document.getElementById('task-input');
  const durationSlider = document.getElementById('duration-slider');
  const sliderVal = document.getElementById('slider-val');
  const pills = document.querySelectorAll('.dur-pill');
  const btnIgnite = document.getElementById('btn-ignite');
  let selectedDuration = parseInt(durationSlider.value, 10);

  const activeTaskName = document.getElementById('active-task-name');
  const timeRemaining = document.getElementById('time-remaining');
  const timerProgress = document.querySelector('.timer-progress');
  const btnAbort = document.getElementById('btn-abort');
  const btnFinish = document.getElementById('btn-finish');
  const btnOptions = document.getElementById('btn-options');

  let liveSession = null;

  const checkState = async () => {
    const res = await chrome.runtime.sendMessage({ action: 'GET_ACTIVE_SESSION' });
    const activeSession = res && res.activeSession ? res.activeSession : null;
    liveSession = activeSession;
    if (activeSession) {
      showActiveView(activeSession);
    } else {
      showSetupView();
    }
  };

  await checkState();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.activeSession) return;
    const next = changes.activeSession.newValue;
    liveSession = next || null;
    if (next) {
      showActiveView(next);
    } else {
      showSetupView();
    }
  });

  const updateDisplayStr = (duration) => {
    let displayStr = '';
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
    pills.forEach((p) => p.classList.remove('active'));
    pills.forEach((p) => {
      if (parseInt(p.dataset.mins, 10) === duration) {
        p.classList.add('active');
      }
    });
  };

  pills.forEach((pill) => {
    pill.addEventListener('click', () => {
      setDuration(parseInt(pill.dataset.mins, 10));
    });
  });

  setDuration(selectedDuration);

  durationSlider.addEventListener('input', (e) => {
    setDuration(parseInt(e.target.value, 10));
  });

  taskInput.addEventListener('input', () => {
    btnIgnite.disabled = taskInput.value.trim().length === 0;
  });
  btnIgnite.disabled = taskInput.value.trim().length === 0;

  btnIgnite.addEventListener('click', () => {
    const taskId = taskInput.value.trim();
    if (!taskId) return;

    btnIgnite.disabled = true;
    btnIgnite.textContent = 'Igniting…';

    chrome.runtime.sendMessage(
      {
        action: 'START_SESSION',
        payload: { taskId, durationMins: selectedDuration }
      },
      (response) => {
        btnIgnite.disabled = false;
        if (chrome.runtime.lastError) {
          btnIgnite.innerHTML = `Ignite Fuse <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ml-2"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>`;
          return;
        }
        if (response && response.success) {
          checkState();
        }
      }
    );
  });

  const CIRCUMFERENCE = 2 * Math.PI * 45;

  function showActiveView(session) {
    viewSetup.classList.remove('active');
    viewActive.classList.add('active');

    activeTaskName.textContent = session.taskId;

    if (timerInterval) clearInterval(timerInterval);

    const tick = () => {
      const s = liveSession || session;
      const now = Date.now();
      let remainingMs = s.endTime - now;

      if (remainingMs <= 0) {
        clearInterval(timerInterval);
        checkState();
        return;
      }

      const totalSeconds = Math.floor(remainingMs / 1000);
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      timeRemaining.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

      const totalSessionMs = s.durationMins * 60000;
      const progressRatio = remainingMs / totalSessionMs;
      const dashoffset = CIRCUMFERENCE - progressRatio * CIRCUMFERENCE;
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

  btnFinish.addEventListener('click', () => {
    if (!confirm('End this session now and log the time you have already focused?')) return;
    chrome.runtime.sendMessage({ action: 'COMPLETE_SESSION_EARLY' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response && response.success) {
        showSetupView();
      } else if (response && response.success === false) {
        checkState();
      }
    });
  });

  btnAbort.addEventListener('click', () => {
    if (!confirm('Blow your fuse? This counts as abandoning the session.')) return;
    chrome.runtime.sendMessage({ action: 'BLOW_FUSE' }, () => {
      if (chrome.runtime.lastError) return;
      showSetupView();
    });
  });

  btnOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});
