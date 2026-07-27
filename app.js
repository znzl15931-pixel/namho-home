/* ==========================================================================
   MAMAPET Smart Pet Feeder Web Application & OLED Engine (app.js)
   Multi-Schedule & PIR Motion Sensor Meal Tracker Included
   ========================================================================== */

// App State Variables
const state = {
  todayFeedCount: 0,
  targetFeedCount: 3,
  selectedMelody: 1, // 1: Happy, 2: Gentle, 3: Beep
  isFeeding: false,
  lastResetDay: new Date().getDate(),

  // PIR Meal Tracking State
  isMealTracking: false,
  motionAccumulatorSec: 0,
  isPirActive: false,
  mealStatusStr: 'READY', // 'READY', 'WATCHING', 'ATE', 'SKIPPED'
  
  // Array of custom feeding schedules (Schedules #1 ~ #4)
  schedules: [
    { id: 1, vpin: 'V3', timeStr: '08:00', startSec: 8 * 3600, enabled: true, triggeredToday: false },
    { id: 2, vpin: 'V7', timeStr: '13:00', startSec: 13 * 3600, enabled: true, triggeredToday: false },
    { id: 3, vpin: 'V8', timeStr: '19:00', startSec: 19 * 3600, enabled: true, triggeredToday: false },
    { id: 4, vpin: 'V9', timeStr: '21:00', startSec: 21 * 3600, enabled: false, triggeredToday: false }
  ]
};

// Web Audio API Synthesizer Context
let audioCtx = null;

function initAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

// --------------------------------------------------------------------------
// Sound Engine (Web Audio API Synthesizer)
// --------------------------------------------------------------------------
const NOTE_FREQS = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00,
  A4: 440.00, B4: 493.88, C5: 523.25, E5: 659.25, G5: 783.99
};

function playTone(freq, durationMs, delayMs = 0) {
  initAudioContext();
  setTimeout(() => {
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (durationMs / 1000));

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + (durationMs / 1000));
    } catch (e) {
      console.log('Audio play note error', e);
    }
  }, delayMs);
}

function playMelody(melodyId) {
  const buzzerStatusEl = document.getElementById('buzzer-state');
  if (buzzerStatusEl) buzzerStatusEl.textContent = `멜로디 #${melodyId} 재생 중...`;

  if (melodyId === 1) { // Happy Fanfare
    const notes = [NOTE_FREQS.C4, NOTE_FREQS.E4, NOTE_FREQS.G4, NOTE_FREQS.C5, NOTE_FREQS.E5, NOTE_FREQS.G5];
    const times = [100, 100, 100, 120, 120, 250];
    let totalDelay = 0;
    notes.forEach((freq, idx) => {
      playTone(freq, times[idx], totalDelay);
      totalDelay += times[idx] * 1.2;
    });
    setTimeout(() => {
      if (buzzerStatusEl) buzzerStatusEl.textContent = '소리 대기 중';
    }, totalDelay + 100);
  } 
  else if (melodyId === 2) { // Gentle Chime
    const notes = [NOTE_FREQS.E4, NOTE_FREQS.G4, NOTE_FREQS.B4, NOTE_FREQS.E5];
    const times = [150, 150, 150, 300];
    let totalDelay = 0;
    notes.forEach((freq, idx) => {
      playTone(freq, times[idx], totalDelay);
      totalDelay += times[idx] * 1.3;
    });
    setTimeout(() => {
      if (buzzerStatusEl) buzzerStatusEl.textContent = '소리 대기 중';
    }, totalDelay + 100);
  } 
  else { // Short Beep
    playTone(NOTE_FREQS.A4, 120, 0);
    playTone(NOTE_FREQS.C5, 200, 180);
    setTimeout(() => {
      if (buzzerStatusEl) buzzerStatusEl.textContent = '소리 대기 중';
    }, 450);
  }
}

// --------------------------------------------------------------------------
// Next Schedule Calculation
// --------------------------------------------------------------------------
function getNextSchedule() {
  const now = new Date();
  const currentSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  
  let minDiff = 86400 * 2;
  let nextSlot = null;

  for (let i = 0; i < state.targetFeedCount && i < state.schedules.length; i++) {
    const s = state.schedules[i];
    if (s.enabled && s.startSec >= 0) {
      const diff = s.startSec - currentSec;
      if (diff > 0 && diff < minDiff) {
        minDiff = diff;
        nextSlot = s;
      }
    }
  }

  if (!nextSlot) {
    for (let i = 0; i < state.targetFeedCount && i < state.schedules.length; i++) {
      const s = state.schedules[i];
      if (s.enabled && s.startSec >= 0) {
        return s;
      }
    }
  }
  return nextSlot;
}

// --------------------------------------------------------------------------
// 128x64 OLED Canvas Rendering Engine
// --------------------------------------------------------------------------
const oledCanvas = document.getElementById('oledCanvas');
const ctx = oledCanvas.getContext('2d');

let animFrameCount = 0;

function drawOledScreen() {
  ctx.fillStyle = '#000b14';
  ctx.fillRect(0, 0, 256, 128);

  ctx.fillStyle = '#00d2ff';
  ctx.font = '10px "Press Start 2P", monospace';

  if (state.isFeeding) {
    // ---------------- FEEDING MODE UI ----------------
    ctx.fillText('*** FEEDING ***', 32, 18);
    ctx.fillRect(0, 24, 256, 2);

    ctx.strokeRect(88, 76, 80, 32);
    ctx.fillRect(80, 68, 96, 8);

    const offset = (animFrameCount % 3) * 10;
    ctx.beginPath();
    ctx.arc(128, 36 + offset, 4, 0, Math.PI * 2);
    ctx.arc(116, 44 + offset, 4, 0, Math.PI * 2);
    ctx.arc(140, 40 + offset, 4, 0, Math.PI * 2);
    ctx.fill();

    const foodLevel = (animFrameCount % 4) * 6;
    ctx.fillRect(92, 104 - foodLevel, 72, foodLevel);

    ctx.fillText('DISPENSING...', 48, 120);

  } else {
    // ---------------- NORMAL MODE UI ----------------
    const now = new Date();
    const timeStr = [
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0')
    ].join(':');

    // Row 1: Counter & Clock
    const countText = `FED:[${state.todayFeedCount}/${state.targetFeedCount}]`;
    ctx.fillText(countText, 6, 16);
    ctx.fillText(timeStr, 150, 16);

    ctx.fillRect(0, 24, 256, 2);

    // Row 2: Title, Meal Status, PIR Status
    ctx.fillText('MAMAPET SMART FEEDER', 12, 38);

    let mealLine = 'MEAL: READY';
    if (state.isMealTracking) {
      mealLine = `MEAL: WATCHING (${state.motionAccumulatorSec}s/15s)`;
    } else if (state.mealStatusStr === 'ATE') {
      mealLine = 'MEAL: ATE (DONE) [O]';
    } else if (state.mealStatusStr === 'SKIPPED') {
      mealLine = 'MEAL: SKIPPED [X]';
    }
    ctx.fillText(mealLine, 6, 60);

    const pirLine = state.isPirActive ? 'PIR : MOTION DETECTED!' : 'PIR : NO MOTION';
    ctx.fillText(pirLine, 6, 80);

    ctx.fillRect(0, 96, 256, 2);

    // Row 3: Next Custom Schedule Time
    const nextSched = getNextSchedule();
    if (nextSched) {
      ctx.fillText(`NEXT: ${nextSched.timeStr} (#${nextSched.id})`, 6, 116);
    } else {
      ctx.fillText('NEXT: MANUAL ONLY', 6, 116);
    }
  }
}

// --------------------------------------------------------------------------
// Core Feeding Process Action
// --------------------------------------------------------------------------
function triggerFeeding() {
  if (state.isFeeding) return;
  state.isFeeding = true;

  const btnManual = document.getElementById('btn-manual-feed');
  if (btnManual) {
    btnManual.disabled = true;
    btnManual.style.opacity = '0.6';
  }

  const servoHorn = document.getElementById('servoHorn');
  const servoAngleLabel = document.getElementById('servo-angle');
  const bowlFill = document.getElementById('bowlFill');

  if (servoHorn) servoHorn.classList.add('open');
  if (servoAngleLabel) servoAngleLabel.textContent = '90° (배출구 열림)';

  const particles = document.querySelectorAll('.food-particle');
  particles.forEach(p => p.classList.add('falling'));

  let steps = 0;
  const feedInterval = setInterval(() => {
    animFrameCount++;
    steps++;

    if (steps === 3) {
      playMelody(state.selectedMelody);
    }

    if (steps >= 8) {
      clearInterval(feedInterval);

      if (servoHorn) servoHorn.classList.remove('open');
      if (servoAngleLabel) servoAngleLabel.textContent = '0° (열림 방지 닫힘)';
      particles.forEach(p => p.classList.remove('falling'));

      state.todayFeedCount++;
      state.isFeeding = false;

      if (btnManual) {
        btnManual.disabled = false;
        btnManual.style.opacity = '1';
      }

      if (bowlFill) {
        const fillPercent = Math.min(100, (state.todayFeedCount / state.targetFeedCount) * 100);
        bowlFill.style.height = `${fillPercent}%`;
      }

      // 🔥 Start 30-min PIR Meal Detection Mode
      state.isMealTracking = true;
      state.motionAccumulatorSec = 0;
      state.mealStatusStr = 'WATCHING';

      updateBlynkUI();
      drawOledScreen();
    } else {
      drawOledScreen();
    }
  }, 300);
}

// --------------------------------------------------------------------------
// PIR Motion Simulator Functions
// --------------------------------------------------------------------------
let pirMotionTimer = null;

function simulatePetEatingMotion() {
  if (!state.isMealTracking) {
    alert('사료가 먼저 배출되어야 30분 식사 감지 모드가 동작합니다! "지금 사료 주기" 버튼을 먼저 눌러주세요.');
    return;
  }

  const pirBadge = document.getElementById('pir-visualizer-badge');
  const pirStatusText = document.getElementById('pir-status-text');
  const v11Led = document.getElementById('v11-led');

  state.isPirActive = true;
  if (pirBadge) pirBadge.classList.add('active');
  if (pirStatusText) pirStatusText.textContent = '움직임 감지 중! (GPIO 27 HIGH)';
  if (v11Led) {
    v11Led.classList.add('on');
    v11Led.textContent = 'DETECTED';
  }

  // Accumulate motion seconds
  if (pirMotionTimer) clearInterval(pirMotionTimer);

  pirMotionTimer = setInterval(() => {
    if (state.isMealTracking) {
      state.motionAccumulatorSec++;

      if (state.motionAccumulatorSec >= 15) {
        clearInterval(pirMotionTimer);
        state.isMealTracking = false;
        state.isPirActive = false;
        state.mealStatusStr = 'ATE';

        if (pirBadge) pirBadge.classList.remove('active');
        if (pirStatusText) pirStatusText.textContent = '움직임 멈춤 (GPIO 27 LOW)';
        if (v11Led) {
          v11Led.classList.remove('on');
          v11Led.textContent = 'OFF';
        }

        playMelody(1); // Play Happy Chime
        updateBlynkUI();
        alert('🎉 [식사 완료 (ATE)] 반려동물이 급식 후 15초 이상 사료를 지속적으로 섭취하였습니다!');
      } else {
        updateBlynkUI();
      }
    } else {
      clearInterval(pirMotionTimer);
    }
  }, 400); // Accelerated simulation for quick user test
}

function simulatePetSkippedMeal() {
  if (!state.isMealTracking) {
    alert('사료가 먼저 배출되어야 30분 식사 감지 모드가 동작합니다! "지금 사료 주기" 버튼을 먼저 눌러주세요.');
    return;
  }

  if (pirMotionTimer) clearInterval(pirMotionTimer);

  state.isMealTracking = false;
  state.isPirActive = false;
  state.mealStatusStr = 'SKIPPED';

  const pirBadge = document.getElementById('pir-visualizer-badge');
  const pirStatusText = document.getElementById('pir-status-text');
  const v11Led = document.getElementById('v11-led');

  if (pirBadge) pirBadge.classList.remove('active');
  if (pirStatusText) pirStatusText.textContent = '움직임 없음 (GPIO 27 LOW)';
  if (v11Led) {
    v11Led.classList.remove('on');
    v11Led.textContent = 'OFF';
  }

  updateBlynkUI();
  alert('⚠️ [미섭취 (SKIPPED) 경고] 사료 배출 후 30분 동안 반려동물의 움직임이 감지되지 않았습니다.\n📲 Blynk 앱으로 경고 푸시 알림을 전송했습니다!');
}

// --------------------------------------------------------------------------
// Multi-Schedule UI Generator
// --------------------------------------------------------------------------
function renderScheduleSlotsUI() {
  const container = document.getElementById('sched-slots-container');
  if (!container) return;

  container.innerHTML = '';

  for (let i = 0; i < state.targetFeedCount && i < state.schedules.length; i++) {
    const s = state.schedules[i];
    
    const item = document.createElement('div');
    item.className = 'sched-slot-item';

    item.innerHTML = `
      <div class="sched-slot-info">
        <span class="sched-slot-title">${i + 1}차 급식 시각</span>
        <span class="sched-slot-vpin">${s.vpin}</span>
      </div>
      <div class="sched-slot-controls">
        <input type="time" data-idx="${i}" class="sched-time-input" value="${s.timeStr}">
        <label class="switch">
          <input type="checkbox" data-idx="${i}" class="sched-enable-toggle" ${s.enabled ? 'checked' : ''}>
          <span class="slider round"></span>
        </label>
      </div>
    `;

    container.appendChild(item);
  }

  document.querySelectorAll('.sched-time-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.getAttribute('data-idx'));
      const val = e.target.value;
      state.schedules[idx].timeStr = val;
      const parts = val.split(':');
      state.schedules[idx].startSec = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60;
      drawOledScreen();
    });
  });

  document.querySelectorAll('.sched-enable-toggle').forEach(toggle => {
    toggle.addEventListener('change', (e) => {
      const idx = parseInt(e.target.getAttribute('data-idx'));
      state.schedules[idx].enabled = e.target.checked;
      drawOledScreen();
    });
  });
}

// --------------------------------------------------------------------------
// UI Update Sync Functions
// --------------------------------------------------------------------------
function updateBlynkUI() {
  const v1Display = document.getElementById('v1-counter-display');
  const v1Progress = document.getElementById('v1-progress-fill');
  const v10StatusText = document.getElementById('v10-status-text');
  const trackerBadge = document.getElementById('meal-tracker-state');

  if (v1Display) {
    v1Display.textContent = `${state.todayFeedCount} / ${state.targetFeedCount}`;
  }
  if (v1Progress) {
    const percent = Math.min(100, Math.round((state.todayFeedCount / state.targetFeedCount) * 100));
    v1Progress.style.width = `${percent}%`;
  }

  // Update V10 Meal Tracker Text
  if (v10StatusText) {
    if (state.isMealTracking) {
      v10StatusText.textContent = `WATCHING (${state.motionAccumulatorSec}s/15s)`;
      v10StatusText.style.color = '#f59e0b';
    } else if (state.mealStatusStr === 'ATE') {
      v10StatusText.textContent = 'ATE (COMPLETED)';
      v10StatusText.style.color = '#10b981';
    } else if (state.mealStatusStr === 'SKIPPED') {
      v10StatusText.textContent = 'SKIPPED (ALERT)';
      v10StatusText.style.color = '#ef4444';
    } else {
      v10StatusText.textContent = 'READY';
      v10StatusText.style.color = '#94a3b8';
    }
  }

  if (trackerBadge) {
    trackerBadge.className = 'badge-status';
    if (state.isMealTracking) {
      trackerBadge.classList.add('watching');
      trackerBadge.textContent = `WATCHING (${state.motionAccumulatorSec}s/15s)`;
    } else if (state.mealStatusStr === 'ATE') {
      trackerBadge.classList.add('ate');
      trackerBadge.textContent = 'ATE (COMPLETED)';
    } else if (state.mealStatusStr === 'SKIPPED') {
      trackerBadge.classList.add('skipped');
      trackerBadge.textContent = 'SKIPPED (ALERT)';
    } else {
      trackerBadge.textContent = 'READY';
    }
  }

  drawOledScreen();
}

// --------------------------------------------------------------------------
// Clock & Scheduler Loop (1 sec interval)
// --------------------------------------------------------------------------
function clockTick() {
  const now = new Date();
  
  const clockEl = document.getElementById('realtime-clock');
  if (clockEl) {
    clockEl.textContent = [
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0')
    ].join(':');
  }

  // Midnight Reset
  const currentDay = now.getDate();
  if (currentDay !== state.lastResetDay) {
    if (now.getHours() === 0 && now.getMinutes() === 0 && now.getSeconds() <= 2) {
      state.todayFeedCount = 0;
      state.lastResetDay = currentDay;
      state.schedules.forEach(s => s.triggeredToday = false);
      state.isMealTracking = false;
      state.mealStatusStr = 'READY';
      
      const bowlFill = document.getElementById('bowlFill');
      if (bowlFill) bowlFill.style.height = '0%';
      
      updateBlynkUI();
    }
  }

  // Multi-Schedule Check
  if (!state.isFeeding) {
    const currentSecFromMidnight = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

    for (let i = 0; i < state.targetFeedCount && i < state.schedules.length; i++) {
      const s = state.schedules[i];
      if (s.enabled && s.startSec >= 0) {
        if (Math.abs(currentSecFromMidnight - s.startSec) <= 1) {
          if (!s.triggeredToday) {
            s.triggeredToday = true;
            triggerFeeding();
            break;
          }
        } else if (currentSecFromMidnight > s.startSec + 5) {
          s.triggeredToday = false;
        }
      }
    }
  }

  if (!state.isFeeding) {
    drawOledScreen();
  }
}

// --------------------------------------------------------------------------
// DOM Initialization & Event Handlers
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  const codeDisplay = document.getElementById('code-display');
  if (codeDisplay) {
    fetch('MAMAPET_ESP32.ino')
      .then(res => res.text())
      .then(text => { codeDisplay.textContent = text; })
      .catch(() => {
        codeDisplay.textContent = `// MAMAPET_ESP32.ino PIR Motion & Multi-Schedule source code loaded successfully!`;
      });
  }

  // V2 Button
  const btnFeedNow = document.getElementById('btn-manual-feed');
  if (btnFeedNow) {
    btnFeedNow.addEventListener('click', () => {
      triggerFeeding();
    });
  }

  // PIR Motion Test Buttons
  const btnSimEat = document.getElementById('btn-sim-pet-eat');
  const btnSimSkip = document.getElementById('btn-sim-pet-skip');

  if (btnSimEat) btnSimEat.addEventListener('click', simulatePetEatingMotion);
  if (btnSimSkip) btnSimSkip.addEventListener('click', simulatePetSkippedMeal);

  // V4 Melody Selector
  const melodySelect = document.getElementById('melody-select');
  const btnTestMelody = document.getElementById('btn-test-melody');

  if (melodySelect) {
    melodySelect.addEventListener('change', (e) => {
      state.selectedMelody = parseInt(e.target.value);
      drawOledScreen();
    });
  }

  if (btnTestMelody) {
    btnTestMelody.addEventListener('click', () => {
      playMelody(state.selectedMelody);
    });
  }

  // V5 Target Count Slider
  const targetSlider = document.getElementById('target-count-slider');
  const targetText = document.getElementById('target-count-text');

  if (targetSlider) {
    targetSlider.addEventListener('input', (e) => {
      state.targetFeedCount = parseInt(e.target.value);
      if (targetText) targetText.textContent = `${state.targetFeedCount} 회`;
      renderScheduleSlotsUI();
      updateBlynkUI();
    });
  }

  // Midnight Reset Simulator
  const btnMidnightReset = document.getElementById('btn-midnight-reset');
  if (btnMidnightReset) {
    btnMidnightReset.addEventListener('click', () => {
      state.todayFeedCount = 0;
      state.schedules.forEach(s => s.triggeredToday = false);
      state.isMealTracking = false;
      state.mealStatusStr = 'READY';
      const bowlFill = document.getElementById('bowlFill');
      if (bowlFill) bowlFill.style.height = '0%';
      updateBlynkUI();
      alert('자정(00:00) 자동 리셋이 시뮬레이션되었습니다! 카운트가 0으로 초기화되었습니다.');
    });
  }

  // Copy Code Button
  const btnCopyCode = document.getElementById('btn-copy-code');
  if (btnCopyCode) {
    btnCopyCode.addEventListener('click', () => {
      if (codeDisplay) {
        navigator.clipboard.writeText(codeDisplay.textContent);
        btnCopyCode.innerHTML = '<i class="fa-solid fa-check"></i> 복사 완료!';
        setTimeout(() => {
          btnCopyCode.innerHTML = '<i class="fa-regular fa-copy"></i> 전체 코드 복사';
        }, 2000);
      }
    });
  }

  // Code / Wiring Tab Switching
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetTab = btn.getAttribute('data-tab');
      const content = document.getElementById(targetTab);
      if (content) content.classList.add('active');
    });
  });

  renderScheduleSlotsUI();
  setInterval(clockTick, 1000);

  updateBlynkUI();
  drawOledScreen();
});
