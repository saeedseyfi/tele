const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const defaultSpeedInput = $('#default-speed');
const defaultSpeedVal = $('#default-speed-val');
const seekSpeedInput = $('#seek-speed');
const seekSpeedVal = $('#seek-speed-val');
const saveBtn = $('#save-btn');

let config = null;
let activeBtn = null;

// ── Accelerator Display ──

const SYMBOLS = {
  CommandOrControl: '\u2318',
  Command: '\u2318',
  Control: '\u2303',
  Shift: '\u21E7',
  Alt: '\u2325',
  Option: '\u2325',
  Up: '\u2191',
  Down: '\u2193',
  Left: '\u2190',
  Right: '\u2192',
  Space: '\u2423',
  Escape: 'Esc',
};

function acceleratorToDisplay(accel) {
  return accel.split('+').map((p) => SYMBOLS[p] || p).join('');
}

function keyEventToAccelerator(e) {
  const parts = [];
  if (e.metaKey) parts.push('CommandOrControl');
  if (e.ctrlKey && !e.metaKey) parts.push('CommandOrControl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  const key = e.key;
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(key)) return null;

  const keyMap = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    ' ': 'Space',
  };

  parts.push(keyMap[key] || key.toUpperCase());
  return parts.join('+');
}

// ── Load Config ──

window.api.getConfig().then((cfg) => {
  config = cfg;

  $$('.shortcut-btn').forEach((btn) => {
    const key = btn.dataset.key;
    btn.textContent = acceleratorToDisplay(config.shortcuts[key]);
  });

  defaultSpeedInput.value = config.defaultSpeed;
  defaultSpeedVal.textContent = config.defaultSpeed.toFixed(1);
  seekSpeedInput.value = config.seekSpeed;
  seekSpeedVal.textContent = config.seekSpeed;
});

// ── Shortcut Recording ──

$$('.shortcut-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (activeBtn) {
      activeBtn.classList.remove('recording');
      activeBtn.textContent = acceleratorToDisplay(config.shortcuts[activeBtn.dataset.key]);
    }
    activeBtn = btn;
    btn.classList.add('recording');
    btn.textContent = 'Press shortcut\u2026';
  });
});

document.addEventListener('keydown', (e) => {
  if (!activeBtn) return;
  e.preventDefault();
  e.stopPropagation();

  const accel = keyEventToAccelerator(e);
  if (!accel) return;

  config.shortcuts[activeBtn.dataset.key] = accel;
  activeBtn.textContent = acceleratorToDisplay(accel);
  activeBtn.classList.remove('recording');
  activeBtn = null;
});

document.addEventListener('click', (e) => {
  if (activeBtn && !e.target.classList.contains('shortcut-btn')) {
    activeBtn.classList.remove('recording');
    activeBtn.textContent = acceleratorToDisplay(config.shortcuts[activeBtn.dataset.key]);
    activeBtn = null;
  }
});

// ── Sliders ──

defaultSpeedInput.addEventListener('input', () => {
  defaultSpeedVal.textContent = parseFloat(defaultSpeedInput.value).toFixed(1);
});

seekSpeedInput.addEventListener('input', () => {
  seekSpeedVal.textContent = seekSpeedInput.value;
});

// ── Save ──

saveBtn.addEventListener('click', async () => {
  config.defaultSpeed = parseFloat(defaultSpeedInput.value);
  config.seekSpeed = parseInt(seekSpeedInput.value, 10);

  await window.api.saveConfig(config);

  saveBtn.textContent = 'Saved';
  saveBtn.classList.add('saved');
  setTimeout(() => {
    saveBtn.textContent = 'Save';
    saveBtn.classList.remove('saved');
  }, 1200);
});
