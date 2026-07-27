/* ==========================================================================
   MAMAPET Smart Pet Feeder Web Application & OLED Engine (app.js)
   Dynamic Schedule Addition & Deletion Supported
   ========================================================================== */

// App State Variables
const state = {
  todayFeedCount: 0,
  targetFeedCount: 3, // Dynamically synced with active schedule count
  selectedMelody: 1,  // 1: Happy, 2: Gentle, 3: Beep
  isFeeding: false,
  lastResetDay: new Date().getDate(),

  // Food Level Ultrasonic Sensor State
  foodPercent: 80,
  isFoodLowWarning: false,

  // PIR Meal Tracking State
  continuousMotionSec: 0,
  noMotionSec: 0,
  isPirActive: false,
  mealStatusStr: 'READY', // 'READY', 'EATING', 'SKIPPED'
  
  // Default 3 Feeding Schedules (4차 급식 기본 제거, 추가/삭제 가능)
  schedules: [
    { id: 1, vpin: 'V3', timeStr: '08:00', startSec: 8 * 3600, enabled: true, triggeredToday: false },
    { id: 2, vpin: 'V7', timeStr: '13:00', startSec: 13 * 3600, enabled: true, triggeredToday: false },
    { id: 3, vpin: 'V8', timeStr: '19:00', startSec: 19 * 3600, enabled: true, triggeredToday: false }
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
  if (melodyId === 1) { // Happy Fanfare
    const notes = [NOTE_FREQS.C4, NOTE_FREQS.E4, NOTE_FREQS.G4, NOTE_FREQS.C5, NOTE_FREQS.E5, NOTE_FREQS.G5];
    const times = [100, 100, 100, 120, 120, 250];
    let totalDelay = 0;
    notes.forEach((freq, idx) => {
      playTone(freq, times[idx], totalDelay);
      totalDelay += times[idx] * 1.2;
    });
  } 
  else if (melodyId === 2) { // Gentle Chime
    const notes = [NOTE_FREQS.E4, NOTE_FREQS.G4, NOTE_FREQS.B4, NOTE_FREQS.E5];
    const times = [150, 150, 150, 300];
    let totalDelay = 0;
    notes.forEach((freq, idx) => {
      playTone(freq, times[idx], totalDelay);
      totalDelay += times[idx] * 1.3;
    });
  } 
  else { // Short Beep
    playTone(NOTE_FREQS.C5, 120, 0);
    playTone(NOTE_FREQS.G5, 200, 180);
  }
}

// --------------------------------------------------------------------------
// OLED Canvas Renderer (Pixel-accurate SSD1306 Simulation)
// --------------------------------------------------------------------------
let canvas, ctx;

function initCanvas() {
  canvas = document.getElementById('oledCanvas');
  if (canvas) {
    ctx = canvas.getContext('2d');
    renderOLED();
  }
}

function renderOLED() {
  if (!ctx) return;

  // Clear Canvas
  ctx.fillStyle = '#090e1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header Title
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 14px "Fira Code", monospace';
  ctx.fillText('MAMAPET [STATUS]', 10, 20);

  // Food Level Percentage
  ctx.fillStyle = state.foodPercent <= 20 ? '#ff4d4d' : '#ffffff';
  ctx.fillText(`${state.foodPercent}%`, 210, 20);

  // Divider Line
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(10, 26);
  ctx.lineTo(246, 26);
  ctx.stroke();

  // Feed Count Row
  ctx.fillStyle = '#ffffff';
  ctx.font = '500 13px "Fira Code", monospace';
  ctx.fillText(`FEED COUNT: ${state.todayFeedCount} / ${state.targetFeedCount}`, 10, 48);

  // Meal Status Row
  ctx.fillStyle = '#60a5fa';
  ctx.fillText(`MEAL: ${state.mealStatusStr}`, 10, 68);

  // Bottom Warning Box (20% or less)
  if (state.foodPercent <= 20) {
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(10, 82, 236, 36);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 14px "Outfit", sans-serif';
    ctx.fillText('⚠️ REFILL FOOD! (<=20%)', 35, 105);
  } else {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px "Fira Code", monospace';
    ctx.fillText(`PIR: ${state.isPirActive ? 'MOTION DETECTED' : 'NO MOTION'}`, 10, 92);
    ctx.fillText('SYS: NORMAL READY', 10, 112);
  }
}

// --------------------------------------------------------------------------
// UI Update Helpers
// --------------------------------------------------------------------------
function updateUI() {
  // Sync target feed count with enabled schedules count
  const activeCount = state.schedules.filter(s => s.enabled).length;
  state.targetFeedCount = Math.max(1, activeCount);

  // 1. Counter Display (V1)
  const counterDisplay = document.getElementById('v1-counter-display');
  const progressFill = document.getElementById('v1-progress-fill');
  if (counterDisplay) {
    counterDisplay.textContent = `${state.todayFeedCount} / ${state.targetFeedCount}`;
  }
  if (progressFill) {
    const pct = Math.min(100, Math.round((state.todayFeedCount / state.targetFeedCount) * 100));
    progressFill.style.width = `${pct}%`;
  }

  // 2. Food Level Gauge & 20% Warning (V12 & V13)
  const v12FoodPct = document.getElementById('v12-food-pct');
  const v13WarningBox = document.getElementById('v13-warning-box');
  const v13WarningText = document.getElementById('v13-warning-text');
  const v13WarningIcon = document.getElementById('v13-warning-icon');
  const foodFillBar = document.getElementById('food-fill-bar');
  const foodPctText = document.getElementById('food-pct-text');

  if (v12FoodPct) v12FoodPct.textContent = `${state.foodPercent}%`;
  if (foodFillBar) foodFillBar.style.height = `${state.foodPercent}%`;

  if (state.foodPercent <= 20) {
    state.isFoodLowWarning = true;
    if (v13WarningBox) v13WarningBox.className = 'warning-banner-box warning-active';
    if (v13WarningText) v13WarningText.textContent = '⚠️ 사료 부족! 사료를 채워주세요 (20% 이하)';
    if (v13WarningIcon) v13WarningIcon.className = 'fa-solid fa-triangle-exclamation';
    if (foodPctText) {
      foodPctText.textContent = `${state.foodPercent}% (사료 부족!)`;
      foodPctText.style.color = '#ef4444';
    }
  } else {
    state.isFoodLowWarning = false;
    if (v13WarningBox) v13WarningBox.className = 'warning-banner-box';
    if (v13WarningText) v13WarningText.textContent = '사료량 양호';
    if (v13WarningIcon) v13WarningIcon.className = 'fa-solid fa-circle-check';
    if (foodPctText) {
      foodPctText.textContent = `${state.foodPercent}% (충분)`;
      foodPctText.style.color = '#38bdf8';
    }
  }

  // 3. PIR Status (V10 & V11)
  const v10StatusText = document.getElementById('v10-status-text');
  const v11Led = document.getElementById('v11-led');
  const pirStatusText = document.getElementById('pir-status-text');
  const pirBadge = document.getElementById('pir-visualizer-badge');
  const mealTrackerState = document.getElementById('meal-tracker-state');

  if (v10StatusText) v10StatusText.textContent = state.mealStatusStr;
  if (mealTrackerState) mealTrackerState.textContent = state.mealStatusStr;

  if (state.isPirActive) {
    if (v11Led) {
      v11Led.textContent = 'ON';
      v11Led.classList.add('active');
    }
    if (pirStatusText) pirStatusText.textContent = '움직임 감지 중 (GPIO 27 HIGH)';
    if (pirBadge) pirBadge.classList.add('active');
  } else {
    if (v11Led) {
      v11Led.textContent = 'OFF';
      v11Led.classList.remove('active');
    }
    if (pirStatusText) pirStatusText.textContent = '움직임 없음 (GPIO 27 LOW)';
    if (pirBadge) pirBadge.classList.remove('active');
  }

  renderOLED();
}

// --------------------------------------------------------------------------
// Feeding Animation & Trigger Logic
// --------------------------------------------------------------------------
function triggerFeeding() {
  if (state.isFeeding) return;

  state.isFeeding = true;
  state.todayFeedCount++;

  const servoHorn = document.getElementById('servoHorn');
  const servoAngle = document.getElementById('servo-angle');
  const bowlFill = document.getElementById('bowlFill');

  if (servoHorn) servoHorn.style.transform = 'rotate(90deg)';
  if (servoAngle) servoAngle.textContent = '90° (사료 배출 중)';

  playMelody(parseInt(state.selectedMelody));

  if (bowlFill) bowlFill.style.height = '70%';

  if (state.foodPercent > 5) {
    state.foodPercent = Math.max(0, state.foodPercent - 10);
    const slider = document.getElementById('sim-food-slider');
    if (slider) slider.value = state.foodPercent;
  }

  updateUI();

  setTimeout(() => {
    if (servoHorn) servoHorn.style.transform = 'rotate(0deg)';
    if (servoAngle) servoAngle.textContent = '0° (닫힘)';
    state.isFeeding = false;
    updateUI();
  }, 2000);
}

// --------------------------------------------------------------------------
// Dynamic Schedule Addition & Removal
// --------------------------------------------------------------------------
function addSchedule() {
  if (state.schedules.length >= 6) {
    alert('최대 6개의 급식 스케줄까지 등록할 수 있습니다.');
    return;
  }

  const nextId = state.schedules.length + 1;
  const defaultTimes = ['08:00', '13:00', '19:00', '21:00', '23:00', '07:00'];
  const newTimeStr = defaultTimes[nextId - 1] || '12:00';
  const parts = newTimeStr.split(':');
  const startSec = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60;

  state.schedules.push({
    id: nextId,
    vpin: `V${nextId + 2}`,
    timeStr: newTimeStr,
    startSec: startSec,
    enabled: true,
    triggeredToday: false
  });

  reindexSchedules();
  renderScheduleList();
  updateUI();
}

function removeSchedule(index) {
  if (state.schedules.length <= 1) {
    alert('최소 1개 이상의 급식 스케줄이 필요합니다.');
    return;
  }

  state.schedules.splice(index, 1);
  reindexSchedules();
  renderScheduleList();
  updateUI();
}

function reindexSchedules() {
  state.schedules.forEach((slot, idx) => {
    slot.id = idx + 1;
  });
}

function renderScheduleList() {
  const container = document.getElementById('sched-slots-container');
  if (!container) return;

  container.innerHTML = '';

  state.schedules.forEach((slot, index) => {
    const item = document.createElement('div');
    item.className = `sched-item ${slot.enabled ? 'enabled' : 'disabled'}`;

    item.innerHTML = `
      <div class="sched-info">
        <span class="slot-name">${slot.id}차 급식</span>
        <input type="time" class="sched-time-input" value="${slot.timeStr}" ${!slot.enabled ? 'disabled' : ''}>
      </div>
      <div class="sched-actions">
        <label class="switch">
          <input type="checkbox" ${slot.enabled ? 'checked' : ''}>
          <span class="slider round"></span>
        </label>
        <button class="btn-delete-sched" title="스케줄 삭제">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;

    // Events
    const timeInput = item.querySelector('.sched-time-input');
    const toggle = item.querySelector('input[type="checkbox"]');
    const btnDelete = item.querySelector('.btn-delete-sched');

    timeInput.addEventListener('change', (e) => {
      slot.timeStr = e.target.value;
      const parts = e.target.value.split(':');
      slot.startSec = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60;
    });

    toggle.addEventListener('change', (e) => {
      slot.enabled = e.target.checked;
      timeInput.disabled = !slot.enabled;
      item.className = `sched-item ${slot.enabled ? 'enabled' : 'disabled'}`;
      updateUI();
    });

    btnDelete.addEventListener('click', () => {
      removeSchedule(index);
    });

    container.appendChild(item);
  });
}

// --------------------------------------------------------------------------
// Source Code Tab Copy Helper
// --------------------------------------------------------------------------
function fetchSourceCode() {
  fetch('MAMAPET_ESP32.ino')
    .then(res => res.text())
    .then(code => {
      const codeDisplay = document.getElementById('code-display');
      if (codeDisplay) codeDisplay.textContent = code;
    })
    .catch(err => {
      console.log('Error loading source code:', err);
    });
}

// --------------------------------------------------------------------------
// Initialization & Event Listeners
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initCanvas();
  renderScheduleList();
  fetchSourceCode();
  updateUI();

  // Add Schedule Button Event
  const btnAddSchedule = document.getElementById('btn-add-schedule');
  if (btnAddSchedule) {
    btnAddSchedule.addEventListener('click', addSchedule);
  }

  // Manual Feed Button (V2)
  const btnManualFeed = document.getElementById('btn-manual-feed');
  if (btnManualFeed) {
    btnManualFeed.addEventListener('click', triggerFeeding);
  }

  // Food Slider Simulation (V12)
  const foodSlider = document.getElementById('sim-food-slider');
  if (foodSlider) {
    foodSlider.addEventListener('input', (e) => {
      state.foodPercent = parseInt(e.target.value);
      updateUI();
    });
  }

  // PIR Pet Eat Button
  const btnSimPetEat = document.getElementById('btn-sim-pet-eat');
  if (btnSimPetEat) {
    btnSimPetEat.addEventListener('click', () => {
      state.isPirActive = true;
      state.mealStatusStr = 'EATING (식사 중)';
      updateUI();

      setTimeout(() => {
        state.isPirActive = false;
        updateUI();
      }, 3000);
    });
  }

  // PIR Pet Skip Button
  const btnSimPetSkip = document.getElementById('btn-sim-pet-skip');
  if (btnSimPetSkip) {
    btnSimPetSkip.addEventListener('click', () => {
      state.isPirActive = false;
      state.mealStatusStr = 'SKIPPED (미섭취/1시간 무반응)';
      updateUI();
    });
  }

  // Melody Select (V4)
  const melodySelect = document.getElementById('melody-select');
  if (melodySelect) {
    melodySelect.addEventListener('change', (e) => {
      state.selectedMelody = parseInt(e.target.value);
    });
  }

  // Test Melody Button
  const btnTestMelody = document.getElementById('btn-test-melody');
  if (btnTestMelody) {
    btnTestMelody.addEventListener('click', () => {
      playMelody(parseInt(state.selectedMelody));
    });
  }

  // Midnight Reset Test Button
  const btnMidnightReset = document.getElementById('btn-midnight-reset');
  if (btnMidnightReset) {
    btnMidnightReset.addEventListener('click', () => {
      state.todayFeedCount = 0;
      state.schedules.forEach(s => s.triggeredToday = false);
      state.mealStatusStr = 'READY';
      updateUI();
    });
  }

  // Code Tab Switching
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      const targetContent = document.getElementById(tabId);
      if (targetContent) targetContent.classList.add('active');
    });
  });

  // Copy Code Button
  const btnCopyCode = document.getElementById('btn-copy-code');
  if (btnCopyCode) {
    btnCopyCode.addEventListener('click', () => {
      const codeText = document.getElementById('code-display').textContent;
      navigator.clipboard.writeText(codeText).then(() => {
        btnCopyCode.innerHTML = '<i class="fa-solid fa-check"></i> 복사 완료!';
        setTimeout(() => {
          btnCopyCode.innerHTML = '<i class="fa-regular fa-copy"></i> 전체 코드 복사';
        }, 2000);
      });
    });
  }
});
