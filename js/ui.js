// Small DOM and formatting helpers.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), ms);
}

const DAY = 864e5;
export function relDay(t) {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(t); b.setHours(0, 0, 0, 0);
  const d = Math.round((a - b) / DAY);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 14) return 'last week';
  if (d < 60) return `${Math.floor(d / 7)} weeks ago`;
  return `${Math.floor(d / 30)} months ago`;
}
export const daysSince = (t) => {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(t); b.setHours(0, 0, 0, 0);
  return Math.round((a - b) / DAY);
};

export const fmtDate = (t, opts = { weekday: 'short', month: 'short', day: 'numeric' }) =>
  new Date(t).toLocaleDateString(undefined, opts);
export const fmtTime = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export function fmtDur(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
export function fmtMins(mins) {
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}
export const fmtNum = (n) => Math.round(n).toLocaleString();

export function download(name, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------- bottom sheet ---------- */

let sheetClose = null;
export function openSheet(html, { onMount, onClose, tall = false } = {}) {
  closeSheet(true);
  const root = $('#sheet-root');
  root.innerHTML = `
    <div class="sheet-backdrop" data-sheet-close></div>
    <div class="sheet${tall ? ' tall' : ''}" role="dialog" aria-modal="true">
      <button class="sheet-grip" data-sheet-close aria-label="Close" tabindex="-1"></button>
      <button class="icon-btn sheet-close" data-sheet-close aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      ${html}
    </div>`;
  requestAnimationFrame(() => root.classList.add('open'));
  sheetClose = onClose || null;
  const sheet = $('.sheet', root);
  enableSwipeDown(sheet, $('.sheet-backdrop', root));
  onMount?.(sheet);
  return sheet;
}
// Drag a sheet down to dismiss it. Only kicks in when the sheet is scrolled to the top
// and the gesture is mostly vertical, so horizontal plate rows and inner lists still scroll.
function enableSwipeDown(sheet, backdrop) {
  let x0 = 0, y0 = null, t0 = 0, dy = 0, dragging = false;
  sheet.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || sheet.scrollTop > 0) { y0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); dy = 0; dragging = false;
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    const dx = e.touches[0].clientX - x0, y = e.touches[0].clientY - y0;
    if (!dragging) {
      if (y > 10 && y > Math.abs(dx) * 1.2) { dragging = true; sheet.classList.add('dragging'); document.activeElement?.blur?.(); }
      else if (Math.abs(dx) > 10 || y < -6) { y0 = null; return; }
      else return;
    }
    e.preventDefault();
    dy = Math.max(0, y);
    sheet.style.transform = `translateY(${dy}px)`;
    backdrop.style.opacity = String(Math.max(0, 1 - dy / (sheet.offsetHeight || 400)));
  }, { passive: false });
  const end = () => {
    if (!dragging) { y0 = null; return; }
    sheet.classList.remove('dragging');
    const fast = dy / Math.max(1, Date.now() - t0) > 0.5;
    if (dy > 110 || (fast && dy > 40)) { sheet.style.transform = 'translateY(100%)'; backdrop.style.opacity = ''; closeSheet(); }
    else { sheet.style.transform = ''; backdrop.style.opacity = ''; }
    dragging = false; y0 = null;
  };
  sheet.addEventListener('touchend', end);
  sheet.addEventListener('touchcancel', end);
}

export function closeSheet(immediate = false) {
  const root = $('#sheet-root');
  if (!root.innerHTML) return;
  const cb = sheetClose; sheetClose = null;
  root.classList.remove('open');
  if (immediate) root.innerHTML = '';
  else setTimeout(() => { if (!root.classList.contains('open')) root.innerHTML = ''; }, 220);
  cb?.();
}
document.addEventListener('click', (e) => { if (e.target.closest('[data-sheet-close]')) closeSheet(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

export function confirmSheet({ title, body = '', confirm = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    openSheet(`
      <h2 class="sheet-title">${esc(title)}</h2>
      ${body ? `<p class="muted">${esc(body)}</p>` : ''}
      <div class="sheet-actions">
        <button class="btn ghost" data-sheet-close>Cancel</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-confirm>${esc(confirm)}</button>
      </div>`, {
      onMount: (s) => $('[data-confirm]', s).addEventListener('click', () => { done = true; closeSheet(); resolve(true); }),
      onClose: () => { if (!done) resolve(false); },
    });
  });
}

/* ---------- audio cue for the rest timer ---------- */

let actx = null;
export function primeAudio() {
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch { /* no audio */ }
}
export function beep() {
  try {
    primeAudio();
    if (!actx) return;
    const t = actx.currentTime;
    [0, 0.22, 0.44].forEach((d, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = i === 2 ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.25, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.18);
      o.connect(g).connect(actx.destination);
      o.start(t + d); o.stop(t + d + 0.2);
    });
  } catch { /* ignore */ }
  navigator.vibrate?.([200, 100, 200]);
}
