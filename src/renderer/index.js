const $ = (id) => document.getElementById(id);

const editor = $('editor');
const prompter = $('prompter');
const appEl = $('app');
const script = $('script');
const readyBtn = $('ready-btn');
const startBtn = $('start-btn');
const settingsBtn = $('settings-btn');
const closeBtn = $('close-btn');
const track = $('track');
const viewport = $('viewport');
const speedToast = $('speed-toast');
const timerEl = $('timer');

const STORAGE_KEY = 'tele-script';
const PROMPTER_HEIGHT = 130;
const EDITOR_HEIGHT = 300;
const MIN_SPEED = 1;
const MAX_SPEED = 10;
const SPEED_STEP = 0.5;
const PX_PER_LEVEL = 15;
let seekSpeed = 150;

const state = {
  playing: false,
  speed: 3,
  scrollY: 0,
  rafId: null,
  lastTime: null,
  toastTimer: null,
  elapsed: 0,
  timerInterval: null,
};

// ── Config ──

function applyConfig(config) {
  state.speed = config.defaultSpeed;
  seekSpeed = config.seekSpeed;
}

window.api.getConfig().then(applyConfig);
window.api.onConfigChanged(applyConfig);

// ── Persistence ──

script.value = localStorage.getItem(STORAGE_KEY) || '';

function saveScript() {
  localStorage.setItem(STORAGE_KEY, script.value);
}

// ── Markdown ──

function escapeHtml(text) {
  const el = document.createElement('span');
  el.textContent = text;
  return el.innerHTML;
}

function renderInline(text) {
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');
  return html;
}

function classifyLine(text) {
  if (/^---+$/.test(text)) return 'separator';
  if (/^#{1,3}\s/.test(text)) return 'header';
  if (/^\[.+\]$/.test(text)) return 'direction';
  return '';
}

function renderLineContent(text) {
  if (/^---+$/.test(text)) return '';
  const hdr = text.match(/^#{1,3}\s+(.*)/);
  if (hdr) return renderInline(hdr[1]);
  if (/^\[.+\]$/.test(text)) return renderInline(text.slice(1, -1));
  return renderInline(text);
}

// ── Rendering ──

const END_NOTES = [
  'You nailed it.',
  'That was perfect.',
  'Crushed it.',
  'Mic drop.',
  'Standing ovation.',
  'Flawless.',
  'Absolutely killed it.',
  'Legend.',
  'Take a bow.',
  'Pure magic.',
  'Chef\'s kiss.',
  'Speechless. Almost.',
  'Born for this.',
  'Encore!',
  'And scene.',
  'Brilliant.',
  'Show-stopper.',
  'They felt that.',
  'Unforgettable.',
  'Owned the room.',
  'Nailed every word.',
  'Golden.',
  'That hit different.',
  'Wow. Just wow.',
  'Peak performance.',
];

function randomEndNote() {
  return END_NOTES[Math.floor(Math.random() * END_NOTES.length)];
}

function renderLines(lines) {
  track.innerHTML = lines
    .map((text) => {
      const type = classifyLine(text);
      const cls = ['line', type].filter(Boolean).join(' ');
      return `<div class="${cls}">${renderLineContent(text)}</div>`;
    })
    .join('')
    + `<div class="line the-end">${randomEndNote()}</div>`;
  state.scrollY = 0;
  track.style.transform = 'translateY(0px)';
}

// ── Scrolling ──

function maxScroll() {
  return Math.max(0, track.scrollHeight - viewport.offsetHeight);
}

function applyScroll() {
  track.style.transform = `translateY(-${state.scrollY}px)`;
}

function scrollFrame(now) {
  if (!state.playing) return;

  if (state.lastTime === null) {
    state.lastTime = now;
    state.rafId = requestAnimationFrame(scrollFrame);
    return;
  }

  const dt = (now - state.lastTime) / 1000;
  state.lastTime = now;

  const pxPerSec = state.speed * PX_PER_LEVEL;
  state.scrollY = Math.min(state.scrollY + pxPerSec * dt, maxScroll());
  applyScroll();

  if (state.scrollY >= maxScroll()) {
    pause();
    return;
  }

  state.rafId = requestAnimationFrame(scrollFrame);
}

// ── Timer ──

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function startTimer() {
  if (state.timerInterval) return;
  state.timerInterval = setInterval(() => {
    state.elapsed++;
    timerEl.textContent = formatTime(state.elapsed);
  }, 1000);
}

function stopTimer() {
  if (!state.timerInterval) return;
  clearInterval(state.timerInterval);
  state.timerInterval = null;
}

function resetTimer() {
  stopTimer();
  state.elapsed = 0;
  timerEl.textContent = '0:00';
}

// ── Playback ──

function play() {
  if (state.playing) return;
  state.playing = true;
  state.lastTime = null;
  state.rafId = requestAnimationFrame(scrollFrame);
  startBtn.classList.add('hidden');
  if (!state.timerInterval) startTimer();
}

function pause() {
  if (!state.playing) return;
  state.playing = false;
  if (state.rafId !== null) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
}

function togglePlay() {
  stopSeeking();
  state.playing ? pause() : play();
}

function adjustSpeed(delta) {
  state.speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, state.speed + delta));
  showSpeedToast();
}

// ── Seek (hold-to-seek) ──

let seekDir = 0;
let seekRafId = null;
let seekLastTime = null;
let seekStopTimer = null;

const SEEK_STOP_DELAY = 300;

function startSeeking(dir) {
  clearTimeout(seekStopTimer);
  seekStopTimer = setTimeout(stopSeeking, SEEK_STOP_DELAY);

  if (seekDir === dir) return;

  seekDir = dir;
  if (seekRafId === null) {
    seekLastTime = null;
    seekRafId = requestAnimationFrame(seekFrame);
  }
}

function stopSeeking() {
  clearTimeout(seekStopTimer);
  seekStopTimer = null;
  seekDir = 0;
  if (seekRafId !== null) {
    cancelAnimationFrame(seekRafId);
    seekRafId = null;
  }
}

function seekFrame(now) {
  if (seekDir === 0) return;

  if (seekLastTime === null) {
    seekLastTime = now;
    seekRafId = requestAnimationFrame(seekFrame);
    return;
  }

  const dt = (now - seekLastTime) / 1000;
  seekLastTime = now;

  state.scrollY = Math.max(0, Math.min(state.scrollY + seekDir * seekSpeed * dt, maxScroll()));
  applyScroll();

  seekRafId = requestAnimationFrame(seekFrame);
}

// ── UI Feedback ──

function showSpeedToast() {
  speedToast.textContent = `Speed: ${state.speed.toFixed(1)}`;
  speedToast.classList.add('visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => speedToast.classList.remove('visible'), 800);
}

// ── Mode Switching ──

function enterPrompter() {
  const text = script.value.trim();
  if (!text) return;

  saveScript();
  const lines = text.split('\n')
    .flatMap((l) => {
      const trimmed = l.trim();
      if (!trimmed || classifyLine(trimmed) !== '') return [trimmed];
      return trimmed.split(/(?<=[.!?])\s+/);
    })
    .filter(Boolean);

  editor.classList.add('hidden');
  prompter.classList.remove('hidden');
  appEl.classList.add('prompter-active');

  window.api.resize(PROMPTER_HEIGHT);


  renderLines(lines);
  resetTimer();
  startBtn.classList.remove('hidden');
}

function enterEditor() {
  const scrollPct = maxScroll() > 0 ? state.scrollY / maxScroll() : 0;
  pause();
  stopSeeking();
  prompter.classList.add('hidden');
  editor.classList.remove('hidden');
  appEl.classList.remove('prompter-active');

  window.api.resize(EDITOR_HEIGHT);
  script.scrollTop = scrollPct * (script.scrollHeight - script.clientHeight);
}

// ── Events ──

script.addEventListener('input', saveScript);
readyBtn.addEventListener('click', enterPrompter);
startBtn.addEventListener('click', () => {
  startBtn.classList.add('hidden');
  startTimer();
  play();
});
// ── Viewport: manual drag + click + double-click ──

const DRAG_THRESHOLD = 4;
let dragOrigin = null;
let didDrag = false;
let lastClickTime = 0;

viewport.addEventListener('mousedown', (e) => {
  dragOrigin = { x: e.screenX, y: e.screenY };
  didDrag = false;
});

window.addEventListener('mousemove', (e) => {
  if (!dragOrigin) return;
  const dx = e.screenX - dragOrigin.x;
  const dy = e.screenY - dragOrigin.y;
  if (!didDrag && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
  didDrag = true;
  dragOrigin = { x: e.screenX, y: e.screenY };
  window.api.moveBy(dx, dy);
});

window.addEventListener('mouseup', () => {
  if (!dragOrigin) return;
  const wasDrag = didDrag;
  dragOrigin = null;
  didDrag = false;

  if (wasDrag) return;

  const now = Date.now();
  if (now - lastClickTime < 300) {
    lastClickTime = 0;
    enterEditor();
    return;
  }
  lastClickTime = now;
  togglePlay();
});

viewport.addEventListener('wheel', (e) => {
  e.preventDefault();
  state.scrollY = Math.max(0, Math.min(state.scrollY + e.deltaY, maxScroll()));
  applyScroll();
}, { passive: false });
settingsBtn.addEventListener('click', () => window.api.openSettings());
closeBtn.addEventListener('click', () => window.api.close());

document.addEventListener('keydown', (e) => {
  const inPrompter = !prompter.classList.contains('hidden');

  if (inPrompter && e.code === 'Escape') {
    e.preventDefault();
    enterEditor();
  }
});

// ── IPC from main process ──

window.api.onMedia((action) => {
  if (action === 'play-pause' && prompter.classList.contains('hidden')) {
    enterPrompter();
    return;
  }
  if (prompter.classList.contains('hidden')) return;

  switch (action) {
    case 'play-pause':
      if (!startBtn.classList.contains('hidden')) {
        startBtn.classList.add('hidden');
        play();
      } else {
        togglePlay();
      }
      break;
    case 'speed-up': adjustSpeed(SPEED_STEP); break;
    case 'speed-down': adjustSpeed(-SPEED_STEP); break;
    case 'seek-back': startSeeking(-1); break;
    case 'seek-ahead': startSeeking(1); break;
  }
});


// ── Stuck-to-top ──

appEl.classList.add('stuck-top');
window.api.onStuckTop((stuck) => {
  appEl.classList.toggle('stuck-top', stuck);
});

// ── Menu Bar Color ──

window.api.onMenuBarColor((color, isLight) => {
  appEl.style.setProperty('--app-bg', color);
  appEl.classList.toggle('light', isLight);
});

// ── Init ──

window.api.resize(EDITOR_HEIGHT);
