/* ==========================================================================
   MAMAPET Smart Pet Feeder Web Application & OLED Engine (app.js)
   MicroPython Web BLE Real-time Integration + 10-sec Melodies & 5-min Counter
   ========================================================================== */

// App State Variables
const state = {
  todayFeedCount: 0,
  targetFeedCount: 3, // Syncs with active schedule count
  selectedMelody: 1,  // 1: Happy (~10s), 2: Gentle (~10s)
  isFeeding: false,
  lastResetDay: new Date().getDate(),

  // Food Level Ultrasonic Sensor State
  foodPercent: 80,
  isFoodLowWarning: false,

  // IR Pet Detection & 5-min Counter State
  continuousMotionSec: 0,
  noMotionSec: 0,
  isPirActive: false,
  mealStatusStr: 'READY', // 'READY', '12s/300s', 'EATING', 'SKIPPED'
  motionTimerInterval: null,

  // Web BLE Connection State
  bleDevice: null,
  bleServer: null,
  rxCharacteristic: null,
  txCharacteristic: null,
  isConnected: false,
  
  // Default 3 Feeding Schedules
  schedules: [
    { id: 1, vpin: 'V3', timeStr: '08:00', startSec: 8 * 3600, enabled: true, triggeredToday: false },
    { id: 2, vpin: 'V7', timeStr: '13:00', startSec: 13 * 3600, enabled: true, triggeredToday: false },
    { id: 3, vpin: 'V8', timeStr: '19:00', startSec: 19 * 3600, enabled: true, triggeredToday: false }
  ]
};

// Web BLE UUID Constants (Nordic UART Service - NUS)
const BLE_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const BLE_RX_UUID      = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Web -> ESP32
const BLE_TX_UUID      = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // ESP32 -> Web

// Web Audio API Synthesizer Context
let audioCtx = null;

function initAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

// --------------------------------------------------------------------------
// Web Bluetooth (Web BLE) Integration Functions
// --------------------------------------------------------------------------
async function connectBLE() {
  const statusText = document.getElementById('ble-status-text');
  const chipConnected = document.getElementById('status-chip-connected');

  if (!navigator.bluetooth) {
    alert('이 브라우저는 Web Bluetooth를 지원하지 않습니다. Chrome 또는 iOS Bluefy 앱을 사용해주세요.');
    return;
  }

  try {
    if (statusText) statusText.textContent = 'ESP32 검색 중...';

    state.bleDevice = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'ESP_' }],
      optionalServices: [BLE_SERVICE_UUID]
    });

    if (statusText) statusText.textContent = '연결 시도 중...';

    state.bleDevice.addEventListener('gattserverdisconnected', onBLEDisconnected);
    state.bleServer = await state.bleDevice.gatt.connect();

    const service = await state.bleServer.getPrimaryService(BLE_SERVICE_UUID);
    state.rxCharacteristic = await service.getCharacteristic(BLE_RX_UUID);
    state.txCharacteristic = await service.getCharacteristic(BLE_TX_UUID);

    // Subscribe to TX notifications from ESP32
    await state.txCharacteristic.startNotifications();
    state.txCharacteristic.addEventListener('characteristicvaluechanged', handleBLENotification);

    state.isConnected = true;
    if (statusText) statusText.textContent = 'ESP32 연동 완료! 🔵';
    if (chipConnected) {
      chipConnected.className = 'status-chip online';
      chipConnected.innerHTML = '<i class="fa-brands fa-bluetooth-b"></i> ESP32 무선 연결됨';
    }

    console.log('Successfully connected to ESP32 Web BLE!');

  } catch (error) {
    console.log('BLE Connection Error:', error);
    state.isConnected = false;
    if (statusText) statusText.textContent = 'ESP32 연동하기 (Web BLE)';
  }
}

function onBLEDisconnected() {
  state.isConnected = false;
  const statusText = document.getElementById('ble-status-text');
  const chipConnected = document.getElementById('status-chip-connected');

  if (statusText) statusText.textContent = 'ESP32 연결 끊김 (재연동)';
  if (chipConnected) {
    chipConnected.className = 'status-chip offline';
    chipConnected.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> 연결 해제됨';
  }
  console.log('ESP32 BLE Disconnected.');
}

function sendBLECommand(cmdStr) {
  if (state.isConnected && state.rxCharacteristic) {
    const encoder = new TextEncoder();
    state.rxCharacteristic.writeValue(encoder.encode(cmdStr + '\n'))
      .catch(err => console.log('BLE Send Error:', err));
  }
}

function handleBLENotification(event) {
  const decoder = new TextDecoder('utf-8');
  const msg = decoder.decode(event.target.value).trim();

  if (msg.startsWith('FOOD:')) {
    const pct = parseInt(msg.replace('FOOD:', ''));
    if (!isNaN(pct)) {
      state.foodPercent = pct;
      const slider = document.getElementById('sim-food-slider');
      if (slider) slider.value = pct;
    }
  } else if (msg.startsWith('MEAL:')) {
    state.mealStatusStr = msg.replace('MEAL:', '');
  } else if (msg.startsWith('PIR:')) {
    state.isPirActive = msg.includes('1') || msg.includes('MOTION');
  }

  updateUI();
}

// --------------------------------------------------------------------------
// Sound Engine (~10 Second Pet Melodies Simulation)
// --------------------------------------------------------------------------
const NOTE_FREQS = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00,
  A4: 440.00, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25,
  F5: 698.46, G5: 783.99, A5: 880.00
};

function playTone(freq, durationMs, delayMs = 0) {
  initAudioContext();
  setTimeout(() => {
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
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
  if (melodyId === 1) { // 1번 멜로디 (~10초)
    const melody = [
      { f: NOTE_FREQS.C5, d: 300 }, { f: NOTE_FREQS.E5, d: 300 }, { f: NOTE_FREQS.G5, d: 300 }, { f: NOTE_FREQS.C5, d: 500 },
      { f: NOTE_FREQS.G4, d: 300 }, { f: NOTE_FREQS.A4, d: 300 }, { f: NOTE_FREQS.C5, d: 300 }, { f: NOTE_FREQS.E5, d: 500 },
      { f: NOTE_FREQS.G5, d: 400 }, { f: NOTE_FREQS.E5, d: 400 }, { f: NOTE_FREQS.C5, d: 400 }, { f: NOTE_FREQS.G4, d: 600 },
      { f: NOTE_FREQS.C5, d: 300 }, { f: NOTE_FREQS.D5, d: 300 }, { f: NOTE_FREQS.E5, d: 300 }, { f: NOTE_FREQS.F5, d: 300 },
      { f: NOTE_FREQS.G5, d: 600 }, { f: NOTE_FREQS.C5, d: 400 }, { f: NOTE_FREQS.E5, d: 400 }, { f: NOTE_FREQS.G5, d: 800 }
    ];
    let delay = 0;
    melody.forEach(item => {
      playTone(item.f, item.d, delay);
      delay += item.d + 80;
    });
  } 
  else { // 2번 멜로디 (~10초)
    const melody = [
      { f: NOTE_FREQS.E5, d: 400 }, { f: NOTE_FREQS.G5, d: 400 }, { f: NOTE_FREQS.A5, d: 500 },
      { f: NOTE_FREQS.G5, d: 400 }, { f: NOTE_FREQS.E5, d: 400 }, { f: NOTE_FREQS.C5, d: 600 },
      { f: NOTE_FREQS.D5, d: 400 }, { f: NOTE_FREQS.E5, d: 400 }, { f: NOTE_FREQS.G5, d: 500 },
      { f: NOTE_FREQS.E5, d: 400 }, { f: NOTE_FREQS.C5, d: 400 }, { f: NOTE_FREQS.A4, d: 600 },
      { f: NOTE_FREQS.C5, d: 400 }, { f: NOTE_FREQS.E5, d: 400 }, { f: NOTE_FREQS.G5, d: 500 }, { f: NOTE_FREQS.C5, d: 800 }
    ];
    let delay = 0;
    melody.forEach(item => {
      playTone(item.f, item.d, delay);
      delay += item.d + 100;
    });
  }
}

// --------------------------------------------------------------------------
// OLED Canvas Renderer
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

  ctx.fillStyle = '#090e1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Line 1: Title & Food %
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 14px "Fira Code", monospace';
  ctx.fillText('MAMAPET', 10, 20);

  ctx.fillStyle = state.foodPercent <= 20 ? '#ff4d4d' : '#ffffff';
  ctx.fillText(`${state.foodPercent}%`, 210, 20);

  // Divider Line
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(10, 26);
  ctx.lineTo(246, 26);
  ctx.stroke();

  // Line 2: Meal Status (Concise)
  ctx.fillStyle = '#60a5fa';
  ctx.font = '600 13px "Fira Code", monospace';
  const shortMeal = state.mealStatusStr.includes('EATING') ? 'EATING' :
                   (state.mealStatusStr.includes('SKIPPED') ? 'SKIPPED' : state.mealStatusStr);
  ctx.fillText(`MEAL: ${shortMeal}`, 10, 52);

  // Line 3: IR Sensor State
  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px "Fira Code", monospace';
  ctx.fillText(`IR  : ${state.isPirActive ? 'ON (DETECT)' : 'OFF'}`, 10, 75);

  // Line 4: System Warning / Status
  if (state.foodPercent <= 20) {
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(10, 88, 236, 32);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 13px "Outfit", sans-serif';
    ctx.fillText('⚠️ REFILL FOOD! (<=20%)', 40, 108);
  } else {
    ctx.fillText('SYS : ONLINE', 10, 108);
  }
}

// --------------------------------------------------------------------------
// UI Update Helpers
// --------------------------------------------------------------------------
function updateUI() {
  const activeCount = state.schedules.filter(s => s.enabled).length;
  state.targetFeedCount = Math.max(1, activeCount);

  const counterDisplay = document.getElementById('v1-counter-display');
  const progressFill = document.getElementById('v1-progress-fill');
  if (counterDisplay) {
    counterDisplay.textContent = `${state.todayFeedCount} / ${state.targetFeedCount}`;
  }
  if (progressFill) {
    const pct = Math.min(100, Math.round((state.todayFeedCount / state.targetFeedCount) * 100));
    progressFill.style.width = `${pct}%`;
  }

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
    if (pirStatusText) pirStatusText.textContent = '반려동물 감지 중 (GPIO 27 LOW)';
    if (pirBadge) pirBadge.classList.add('active');
  } else {
    if (v11Led) {
      v11Led.textContent = 'OFF';
      v11Led.classList.remove('active');
    }
    if (pirStatusText) pirStatusText.textContent = '미감지 (GPIO 27 HIGH)';
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

  // Send BLE command to ESP32 physical device!
  sendBLECommand('FEED');

  const servoHorn = document.getElementById('servoHorn');
  const servoAngle = document.getElementById('servo-angle');
  const bowlFill = document.getElementById('bowlFill');

  if (servoHorn) servoHorn.style.transform = 'rotate(90deg)';
  if (servoAngle) servoAngle.textContent = '90° (사료 배출 중)';

  // Play ~10 sec melody
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
  fetch('main.py')
    .then(res => res.text())
    .then(code => {
      const codeDisplay = document.getElementById('code-display');
      if (codeDisplay) codeDisplay.textContent = code;
    })
    .catch(() => {
      console.log('Source code file loaded');
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

  // Web BLE Connect Button Event
  const btnBleConnect = document.getElementById('btn-ble-connect');
  if (btnBleConnect) {
    btnBleConnect.addEventListener('click', connectBLE);
  }

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

  // IR Pet Detection & 5-min Counter Simulation Button
  const btnSimPetEat = document.getElementById('btn-sim-pet-eat');
  if (btnSimPetEat) {
    btnSimPetEat.addEventListener('click', () => {
      if (state.motionTimerInterval) clearInterval(state.motionTimerInterval);

      state.isPirActive = true;
      state.continuousMotionSec = 0;
      updateUI();

      // Send Web BLE Command to physical ESP32 OLED screen!
      sendBLECommand('SIM:EAT');

      state.motionTimerInterval = setInterval(() => {
        state.continuousMotionSec += 15; // Speed up simulation by 15s steps
        if (state.continuousMotionSec >= 300) {
          state.mealStatusStr = 'ATE (식사 완료)';
          clearInterval(state.motionTimerInterval);
          state.isPirActive = false;
        } else {
          state.mealStatusStr = `EATING(${state.continuousMotionSec}s/300s)`;
        }
        updateUI();
      }, 500);
    });
  }

  // IR Pet Skip Button
  const btnSimPetSkip = document.getElementById('btn-sim-pet-skip');
  if (btnSimPetSkip) {
    btnSimPetSkip.addEventListener('click', () => {
      if (state.motionTimerInterval) clearInterval(state.motionTimerInterval);
      state.isPirActive = false;
      state.mealStatusStr = 'SKIPPED (미섭취/1시간 무반응)';
      updateUI();

      // Send Web BLE Command to physical ESP32 OLED screen!
      sendBLECommand('SIM:SKIP');
    });
  }

  // Melody Select (V4)
  const melodySelect = document.getElementById('melody-select');
  if (melodySelect) {
    melodySelect.addEventListener('change', (e) => {
      state.selectedMelody = parseInt(e.target.value);
      sendBLECommand(`MELODY:${state.selectedMelody}`);
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
