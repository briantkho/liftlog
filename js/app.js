import * as S from './store.js';
import { save, exById, routineById, workoutById, fmtW, unit, uid } from './store.js';
import { $, $$, esc, toast, relDay, daysSince, fmtDate, fmtTime, fmtDur, fmtMins, fmtNum, download, openSheet, closeSheet, confirmSheet, primeAudio, beep } from './ui.js';
import { lineChart } from './chart.js';
import { MUSCLES, STARTER_PLANS } from './seed.js';

const view = $('#view');
const st = () => S.state; // live binding helper after imports/resets

/* ================= router ================= */

const routes = [
  [/^\/?$/, renderHome, 'home'],
  [/^\/workout$/, renderWorkout, 'workout'],
  [/^\/history$/, renderHistory, 'history'],
  [/^\/session\/(.+)$/, renderSession, 'history'],
  [/^\/progress$/, renderProgress, 'progress'],
  [/^\/exercise\/(.+)$/, renderExercise, 'progress'],
  [/^\/routines$/, renderRoutines, 'workout'],
  [/^\/routine\/(.+)$/, renderRoutineEdit, 'workout'],
  [/^\/settings$/, renderSettings, 'settings'],
];

let currentPath = null;
function route() {
  const path = location.hash.replace(/^#/, '') || '/';
  for (const [re, fn, tab] of routes) {
    const m = path.match(re);
    if (m) {
      const same = path === currentPath;
      currentPath = path;
      if (!same) closeSheet(true);
      $$('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
      fn(...m.slice(1).map(decodeURIComponent));
      if (!same) { window.scrollTo(0, 0); view.focus({ preventScroll: true }); }
      return;
    }
  }
  location.hash = '#/';
}
// Navigate synchronously so a sheet opened right after go() is not closed by a late hashchange.
const go = (h) => { if (location.hash !== h) history.pushState(null, '', h); route(); };
const rerender = () => route();
window.addEventListener('hashchange', route);
window.addEventListener('popstate', route);

/* ================= shared bits ================= */

const icon = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 10 17.5 19.5 7"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg>',
  dots: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5v1.5A3.5 3.5 0 0 0 8 11M16 6h3.5v1.5A3.5 3.5 0 0 1 16 11M12 13v4M8.5 20h7M10 17h4"/></svg>',
  flame: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.5 3-5.4 3.6-8.9C12 8 13 10 13 11.5c1-.6 1.6-1.8 1.7-3 2 1.4 3.3 4 3.3 6.9 0 3.2-2.4 5.6-6 5.6z"/></svg>',
};

function header(title, { back, right = '' } = {}) {
  return `<header class="topbar">
    ${back ? `<a class="icon-btn" href="${back}" aria-label="Back">${icon.back}</a>` : '<span class="topbar-spacer"></span>'}
    <h1 class="topbar-title">${esc(title)}</h1>
    <div class="topbar-right">${right}</div>
  </header>`;
}

function describeSets(sets, kind) {
  // Collapse "135x8, 135x8, 135x7" into "135 lb × 8, 8, 7"
  const working = sets.filter(S.isWorking);
  if (!working.length) return '';
  const groups = [];
  for (const s of working) {
    const g = groups[groups.length - 1];
    if (g && g.w === (s.w || 0)) g.r.push(s.r); else groups.push({ w: s.w || 0, r: [s.r] });
  }
  return groups.map((g) => (g.w ? `${fmtW(g.w)} ${unit()} × ${g.r.join(', ')}` : `${kind === 'reps' ? 'BW' : '0'} × ${g.r.join(', ')}`)).join(' · ');
}

function routinePreview(r) {
  return r.items.map((it) => {
    const ex = exById(it.exerciseId);
    if (!ex) return '';
    const sg = S.suggest(it.exerciseId, it);
    const w = sg.w ? `${fmtW(sg.w)} ${unit()}` : ex.kind === 'reps' ? 'Bodyweight' : 'New';
    return `<li>
      <span class="pv-name">${esc(ex.name)}</span>
      <span class="pv-target">${sg.up ? '<span class="up-tag">↑</span>' : ''}${esc(w)} <span class="muted">· ${it.sets}×${sg.range.min}-${sg.range.max}</span></span>
    </li>`;
  }).join('');
}

function startRoutine(id) {
  if (st().active) {
    toast('Finish or discard the current workout first.');
    go('#/workout');
    return;
  }
  primeAudio();
  S.startWorkout(id);
  go('#/workout');
}

/* ================= HOME ================= */

function renderHome() {
  const s = st();
  const sk = S.streak();
  const all = S.finishedWorkouts();
  const last = all[0];
  const next = S.nextRoutine();
  const prs = S.recentPRs(30).slice(0, 5);
  const today = new Date();
  const ringPct = Math.min(1, sk.thisWeek / sk.goal);
  const C = 2 * Math.PI * 30;

  let nudge = '';
  if (!all.length) nudge = 'Log your first workout. After that, this app remembers every weight for you.';
  else {
    const d = daysSince(last.start);
    const left = sk.goal - sk.thisWeek;
    const dow = (today.getDay() + 6) % 7; // Mon=0
    const daysLeft = 7 - dow;
    if (left <= 0) nudge = `Weekly goal done. ${sk.current > 1 ? `That's ${sk.current} weeks in a row.` : 'Keep it going next week.'}`;
    else if (d === 0) nudge = `Nice work today. ${left} more this week to hit your goal.`;
    else if (left >= daysLeft) nudge = `${left} workout${left > 1 ? 's' : ''} left and ${daysLeft} day${daysLeft > 1 ? 's' : ''} in the week. Today counts.`;
    else if (d >= 4) nudge = `It's been ${d} days. A short session still counts.`;
    else nudge = `${left} more this week to hit your goal.`;
  }

  view.innerHTML = `
    <section class="home-head">
      <p class="eyebrow">${today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      <h1 class="display">${s.active ? 'Workout in progress' : next ? 'Next up: ' + esc(next.name) : 'Liftlog'}</h1>
      <p class="muted lead">${esc(nudge)}</p>
    </section>

    ${s.active ? `
      <a class="card resume" href="#/workout">
        <div>
          <p class="eyebrow">Started ${fmtTime(s.active.start)}</p>
          <p class="resume-name">${esc(s.active.name)}</p>
        </div>
        <span class="btn primary sm">Resume</span>
      </a>` : ''}

    <section class="card week">
      <div class="ring" aria-label="${sk.thisWeek} of ${sk.goal} workouts this week">
        <svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="30" class="ring-bg"/><circle cx="36" cy="36" r="30" class="ring-fg" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - ringPct)}"/></svg>
        <div class="ring-num"><strong>${sk.thisWeek}</strong><span>/${sk.goal}</span></div>
      </div>
      <div class="week-stats">
        <div><span class="stat-big">${sk.current}</span><span class="stat-label">week streak</span></div>
        <div><span class="stat-big">${last ? (daysSince(last.start) === 0 ? 'Today' : daysSince(last.start) + 'd') : '-'}</span><span class="stat-label">since last</span></div>
        <div><span class="stat-big">${all.length}</span><span class="stat-label">workouts</span></div>
      </div>
    </section>

    ${!s.active && next ? `
      <section class="card next">
        <div class="card-head">
          <div>
            <p class="eyebrow">Up next in your rotation</p>
            <h2 class="h2">${esc(next.name)}</h2>
            <p class="muted small">${(() => { const l = S.lastDoneRoutine(next.id); return l ? `Last done ${relDay(l.start)}` : 'Not done yet'; })()}</p>
          </div>
        </div>
        <ul class="preview">${routinePreview(next)}</ul>
        <button class="btn primary block" data-action="start" data-id="${next.id}">Start ${esc(next.name)}</button>
        <div class="row-links">
          <button class="link" data-action="pick-routine">Pick a different one</button>
          <button class="link" data-action="start-empty">Empty workout</button>
        </div>
      </section>` : ''}

    ${!s.active && !next ? `
      <section class="card">
        <h2 class="h2">Set up your routine</h2>
        <p class="muted">Save the workouts you repeat. The app will rotate through them and tell you what weight to use each time.</p>
        <div class="stack">
          <a class="btn primary block" href="#/routines">Choose a starter plan or build one</a>
          <button class="btn ghost block" data-action="start-empty">Just log a workout</button>
        </div>
      </section>` : ''}

    <section class="card">
      <div class="card-head"><h2 class="h3">Last 16 weeks</h2><span class="muted small">Best streak ${sk.best} wk</span></div>
      ${heatmap()}
    </section>

    ${prs.length ? `
      <section class="card">
        <div class="card-head"><h2 class="h3">Recent PRs</h2><span class="muted small">Last 30 days</span></div>
        <ul class="list">
          ${prs.map((p) => `<li><a class="list-row" href="#/exercise/${encodeURIComponent(p.exerciseId)}">
            <span class="pr-icon">${icon.trophy}</span>
            <span class="grow"><strong>${esc(exById(p.exerciseId)?.name || '?')}</strong><span class="muted small block">${esc(p.type)} · ${relDay(p.workout.start)}</span></span>
            <span class="mono">${p.s.w ? `${fmtW(p.s.w)}×${p.s.r}` : `${p.s.r} reps`}</span>
          </a></li>`).join('')}
        </ul>
      </section>` : ''}
  `;
}

function heatmap() {
  const weeks = 16;
  const start = S.startOfWeek(Date.now()) - (weeks - 1) * 7 * 864e5;
  const byDay = new Map();
  for (const w of st().workouts) {
    const d = new Date(w.start); d.setHours(0, 0, 0, 0);
    byDay.set(d.getTime(), (byDay.get(d.getTime()) || 0) + 1);
  }
  const counts = S.weekCounts();
  const goal = st().settings.weeklyGoal;
  const todayT = new Date().setHours(0, 0, 0, 0);
  let cols = '';
  for (let w = 0; w < weeks; w++) {
    let cells = '';
    const ws = new Date(start); ws.setDate(ws.getDate() + w * 7);
    const wkKey = S.startOfWeek(ws.getTime());
    for (let d = 0; d < 7; d++) {
      const day = new Date(ws); day.setDate(day.getDate() + d); day.setHours(0, 0, 0, 0);
      const t = day.getTime();
      const n = byDay.get(t) || 0;
      const future = t > todayT;
      cells += `<span class="hm-cell${n ? ' on' : ''}${future ? ' future' : ''}${t === todayT ? ' today' : ''}" title="${fmtDate(t)}${n ? ': ' + n + ' workout' + (n > 1 ? 's' : '') : ''}"></span>`;
    }
    const hit = (counts.get(wkKey) || 0) >= goal;
    cols += `<div class="hm-col${hit ? ' hit' : ''}">${cells}</div>`;
  }
  return `<div class="heatmap" role="img" aria-label="Workout calendar for the last ${weeks} weeks">
      <div class="hm-days"><span>M</span><span></span><span>W</span><span></span><span>F</span><span></span><span>S</span></div>
      <div class="hm-grid">${cols}</div>
    </div>
    <p class="hm-legend muted small"><span class="hm-cell on"></span> trained <span class="hm-bar"></span> weekly goal hit</p>`;
}

function pickRoutineSheet() {
  const rs = st().routines;
  openSheet(`
    <h2 class="sheet-title">Start a workout</h2>
    <ul class="list">
      ${rs.map((r) => {
        const l = S.lastDoneRoutine(r.id);
        return `<li><button class="list-row" data-action="start" data-id="${r.id}">
          <span class="grow"><strong>${esc(r.name)}</strong><span class="muted small block">${r.items.length} exercises · ${l ? 'last ' + relDay(l.start) : 'not done yet'}</span></span>
          <span class="chev">›</span></button></li>`;
      }).join('')}
      <li><button class="list-row" data-action="start-empty"><span class="grow"><strong>Empty workout</strong><span class="muted small block">Add exercises as you go</span></span><span class="chev">›</span></button></li>
    </ul>
    <a class="btn ghost block" href="#/routines" data-sheet-close>Edit routines</a>
  `);
}

/* ================= WORKOUT ================= */

let clockTimer = null;

function renderWorkout() {
  clearInterval(clockTimer);
  const s = st();
  if (!s.active) return renderWorkoutStart();
  const w = s.active;
  const editing = !!w.editing;

  view.innerHTML = `
    <header class="topbar sticky">
      <button class="btn ghost sm" data-action="workout-menu">${editing ? 'Cancel' : 'More'}</button>
      <div class="topbar-center">
        <button class="title-btn" data-action="rename-workout">${esc(w.name)}</button>
        <span class="clock mono" id="clock">${editing ? fmtDate(w.start) : fmtDur(Date.now() - w.start)}</span>
      </div>
      <button class="btn primary sm" data-action="finish">${editing ? 'Save' : 'Finish'}</button>
    </header>
    <div id="entries">${w.entries.map(entryCard).join('')}</div>
    ${!w.entries.length ? `<div class="empty"><p>No exercises yet.</p></div>` : ''}
    <button class="btn ghost block add-ex" data-action="add-exercise">${icon.plus} Add exercise</button>
    <label class="field notes">
      <span class="field-label">Notes</span>
      <textarea id="w-notes" rows="2" placeholder="How did it feel? Anything to remember next time?">${esc(w.notes || '')}</textarea>
    </label>
  `;
  $('#w-notes').addEventListener('input', (e) => { w.notes = e.target.value; save(); });
  if (!editing) clockTimer = setInterval(() => {
    const c = $('#clock'); if (!c || !st().active) return clearInterval(clockTimer);
    c.textContent = fmtDur(Date.now() - st().active.start);
  }, 1000);
}

function entryCard(e) {
  const ex = exById(e.exerciseId);
  if (!ex) return '';
  const sg = S.suggest(e.exerciseId, { sets: e.targetSets, repMin: e.repMin, repMax: e.repMax });
  const prevSets = sg.last ? sg.last.sets : [];
  const isReps = ex.kind === 'reps';
  let workingIdx = 0;

  return `<section class="card entry" data-entry="${e.id}">
    <div class="entry-head">
      <a class="entry-name" href="#/exercise/${encodeURIComponent(ex.id)}">${esc(ex.name)}</a>
      <button class="icon-btn" data-action="entry-menu" data-entry="${e.id}" aria-label="Exercise options">${icon.dots}</button>
    </div>
    <p class="suggest${sg.up ? ' up' : ''}">${esc(sg.note)}</p>
    ${sg.last ? `<p class="muted small last">Last time (${relDay(sg.last.workout.start)}): ${esc(describeSets(sg.last.sets, ex.kind))}</p>` : ''}
    <div class="sets-head">
      <span>Set</span><span>Previous</span><span>${isReps ? '+' + unit() : unit()}</span><span>Reps</span><span aria-hidden="true"></span>
    </div>
    ${e.sets.map((s, i) => {
      const label = s.warmup ? 'W' : String(++workingIdx);
      const prev = prevSets[workingIdx - 1];
      const prevTxt = s.warmup ? '' : prev ? (prev.w ? `${fmtW(prev.w)}×${prev.r}` : `${prev.r}`) : '-';
      const phW = s.warmup ? '' : sg.w != null ? fmtW(sg.w) : isReps ? '0' : '';
      const phR = s.warmup ? '' : String(sg.r);
      return `<div class="set-row${s.done ? ' done' : ''}${s.warmup ? ' warm' : ''}" data-entry="${e.id}" data-set="${i}">
        <button class="set-num" data-action="set-menu" aria-label="Set options">${label}</button>
        <span class="prev mono">${prevTxt}</span>
        <input class="num" inputmode="decimal" enterkeyhint="next" data-field="w" value="${s.w != null ? fmtW(s.w) : ''}" placeholder="${phW}" aria-label="Weight">
        <input class="num" inputmode="numeric" enterkeyhint="done" data-field="r" value="${s.r ?? ''}" placeholder="${phR}" aria-label="Reps">
        <button class="check" data-action="toggle-set" aria-label="${s.done ? 'Mark not done' : 'Mark done'}">${icon.check}</button>
        ${s.pr?.length ? `<span class="pr-badge">${icon.trophy}${esc(s.pr[0])}</span>` : ''}
      </div>`;
    }).join('')}
    <div class="entry-foot">
      <button class="link" data-action="add-set" data-entry="${e.id}">${icon.plus} Add set</button>
      ${!isReps ? `<button class="link" data-action="plates" data-entry="${e.id}">Plates</button>` : ''}
    </div>
  </section>`;
}

function renderWorkoutStart() {
  const rs = st().routines;
  const next = S.nextRoutine();
  view.innerHTML = `
    ${header('Start workout', { right: '<a class="btn ghost sm" href="#/routines">Routines</a>' })}
    ${rs.length ? `
      <ul class="list card">
        ${rs.map((r) => {
          const l = S.lastDoneRoutine(r.id);
          return `<li><button class="list-row" data-action="start" data-id="${r.id}">
            <span class="grow"><strong>${esc(r.name)}</strong>${r.id === next?.id ? ' <span class="tag">Next</span>' : ''}
            <span class="muted small block">${r.items.map((i) => exById(i.exerciseId)?.name).filter(Boolean).slice(0, 4).map(esc).join(', ')}${r.items.length > 4 ? '…' : ''}</span>
            <span class="muted small block">${l ? 'Last done ' + relDay(l.start) : 'Not done yet'}</span></span>
            <span class="chev">›</span></button></li>`;
        }).join('')}
      </ul>` : `
      <div class="card">
        <h2 class="h3">No routines yet</h2>
        <p class="muted">A routine is a workout you repeat, like "Push" or "Full body A". Save one and the app fills in your weights every time.</p>
        <a class="btn primary block" href="#/routines">Set up routines</a>
      </div>`}
    <button class="btn ghost block" data-action="start-empty">${icon.plus} Empty workout</button>
    <button class="btn ghost block" data-action="log-past">Log a past workout</button>
  `;
}

function findSet(el) {
  const row = el.closest('.set-row');
  const entry = st().active.entries.find((x) => x.id === row.dataset.entry);
  return { row, entry, set: entry.sets[+row.dataset.set], idx: +row.dataset.set };
}

// Typing into set inputs updates state without a re-render.
view.addEventListener('input', (e) => {
  const inp = e.target.closest('.set-row input');
  if (!inp || !st().active) return;
  const { set } = findSet(inp);
  const v = inp.value.trim().replace(',', '.');
  if (inp.dataset.field === 'w') set.w = v === '' ? null : S.fromDisplay(parseFloat(v));
  else set.r = v === '' ? null : parseInt(v, 10);
  save();
});
view.addEventListener('keydown', (e) => {
  const inp = e.target.closest('.set-row input');
  if (!inp || e.key !== 'Enter') return;
  e.preventDefault();
  if (inp.dataset.field === 'w') inp.parentElement.querySelector('[data-field="r"]').focus();
  else inp.parentElement.querySelector('.check').click();
});

function toggleSet(btn) {
  const { row, entry, set, idx } = findSet(btn);
  const ex = exById(entry.exerciseId);
  if (!set.done) {
    // Fill blanks from the suggestion placeholders.
    const wIn = row.querySelector('[data-field="w"]'), rIn = row.querySelector('[data-field="r"]');
    if (set.w == null && wIn.placeholder !== '') set.w = S.fromDisplay(parseFloat(wIn.placeholder));
    if (set.r == null && rIn.placeholder !== '') set.r = parseInt(rIn.placeholder, 10);
    if (!(set.r > 0)) { toast('Enter reps first.'); rIn.focus(); return; }
    if (ex?.kind === 'reps' && !set.w) set.w = 0;
    if (set.w == null && ex?.kind !== 'reps') { toast('Enter a weight first.'); wIn.focus(); return; }
    set.done = true;
    set.pr = st().active.editing ? [] : S.setPRs(entry.exerciseId, set, st().active.id, entry.sets.slice(0, idx));
    if (set.pr.length) toast(`PR: ${set.pr[0]} on ${ex.name}`);
    if (st().settings.autoRest && !set.warmup && !st().active.editing) startRest();
    // Carry the weight forward to later empty sets so you can change it once.
    for (const later of entry.sets.slice(idx + 1)) if (!later.done && later.w == null && !later.warmup) later.w = set.w;
    navigator.vibrate?.(15);
  } else {
    set.done = false;
    set.pr = [];
  }
  save();
  rerenderEntry(entry.id);
}

function rerenderEntry(id) {
  const entry = st().active.entries.find((x) => x.id === id);
  const el = view.querySelector(`.entry[data-entry="${id}"]`);
  if (!el || !entry) return rerender();
  const tmp = document.createElement('div');
  tmp.innerHTML = entryCard(entry);
  el.replaceWith(tmp.firstElementChild);
}

function addSet(entryId) {
  const e = st().active.entries.find((x) => x.id === entryId);
  const lastSet = e.sets[e.sets.length - 1];
  e.sets.push({ w: lastSet && !lastSet.warmup ? lastSet.w : null, r: null, done: false });
  save();
  rerenderEntry(entryId);
}

function setMenu(btn) {
  const { entry, set, idx } = findSet(btn);
  openSheet(`
    <h2 class="sheet-title">Set options</h2>
    <div class="stack">
      <button class="btn ghost block" data-x="warm">${set.warmup ? 'Make it a working set' : 'Mark as warm-up'}</button>
      <button class="btn danger block" data-x="del">Delete set</button>
    </div>`, {
    onMount: (sh) => {
      $('[data-x="warm"]', sh).onclick = () => { set.warmup = !set.warmup; set.pr = []; save(); closeSheet(); rerenderEntry(entry.id); };
      $('[data-x="del"]', sh).onclick = () => { entry.sets.splice(idx, 1); save(); closeSheet(); rerenderEntry(entry.id); };
    },
  });
}

function entryMenu(entryId) {
  const w = st().active;
  const i = w.entries.findIndex((x) => x.id === entryId);
  const e = w.entries[i];
  const ex = exById(e.exerciseId);
  openSheet(`
    <h2 class="sheet-title">${esc(ex.name)}</h2>
    <div class="stack">
      <a class="btn ghost block" href="#/exercise/${encodeURIComponent(ex.id)}" data-sheet-close>History and PRs</a>
      <button class="btn ghost block" data-x="swap">Swap exercise</button>
      ${i > 0 ? '<button class="btn ghost block" data-x="up">Move up</button>' : ''}
      ${i < w.entries.length - 1 ? '<button class="btn ghost block" data-x="down">Move down</button>' : ''}
      <button class="btn danger block" data-x="del">Remove from workout</button>
    </div>`, {
    onMount: (sh) => {
      $('[data-x="swap"]', sh).onclick = () => exercisePicker((id) => {
        w.entries[i] = S.newEntry(id, { sets: e.targetSets });
        save(); rerender();
      });
      const up = $('[data-x="up"]', sh), dn = $('[data-x="down"]', sh);
      if (up) up.onclick = () => { [w.entries[i - 1], w.entries[i]] = [w.entries[i], w.entries[i - 1]]; save(); closeSheet(); rerender(); };
      if (dn) dn.onclick = () => { [w.entries[i + 1], w.entries[i]] = [w.entries[i], w.entries[i + 1]]; save(); closeSheet(); rerender(); };
      $('[data-x="del"]', sh).onclick = () => { w.entries.splice(i, 1); save(); closeSheet(); rerender(); };
    },
  });
}

function workoutMenu() {
  const w = st().active;
  if (w.editing) {
    // Cancel editing: restore the saved copy.
    S.state.active = null; save(true);
    go(`#/session/${w.id}`);
    return;
  }
  openSheet(`
    <h2 class="sheet-title">Workout</h2>
    <div class="stack">
      <button class="btn ghost block" data-x="rename">Rename</button>
      ${w.routineId ? '<button class="btn ghost block" data-x="save-routine">Update routine to match this workout</button>' : '<button class="btn ghost block" data-x="new-routine">Save as a routine</button>'}
      <button class="btn danger block" data-x="discard">Discard workout</button>
    </div>`, {
    onMount: (sh) => {
      $('[data-x="rename"]', sh).onclick = () => { closeSheet(true); renameWorkout(); };
      const sr = $('[data-x="save-routine"]', sh), nr = $('[data-x="new-routine"]', sh);
      if (sr) sr.onclick = () => {
        const r = routineById(w.routineId);
        if (r) r.items = w.entries.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.filter((s) => !s.warmup).length || e.targetSets, repMin: e.repMin, repMax: e.repMax }));
        save(); closeSheet(); toast('Routine updated.');
      };
      if (nr) nr.onclick = () => {
        const r = { id: uid(), name: w.name === 'Workout' ? 'My routine' : w.name, items: w.entries.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.filter((s) => !s.warmup).length || 3, repMin: e.repMin, repMax: e.repMax })) };
        st().routines.push(r); w.routineId = r.id; save(); closeSheet(); toast('Saved as a routine.');
      };
      $('[data-x="discard"]', sh).onclick = async () => {
        closeSheet(true);
        if (await confirmSheet({ title: 'Discard this workout?', body: 'Nothing from this session will be saved.', confirm: 'Discard', danger: true })) {
          S.discardActive(); stopRest(); go('#/');
        }
      };
    },
  });
}

function renameWorkout() {
  const w = st().active;
  openSheet(`
    <h2 class="sheet-title">Workout details</h2>
    <label class="field"><span class="field-label">Name</span><input id="rn" value="${esc(w.name)}"></label>
    ${w.editing ? `<label class="field"><span class="field-label">Date</span><input id="rd" type="datetime-local" value="${toLocalInput(w.start)}"></label>` : ''}
    <div class="sheet-actions"><button class="btn ghost" data-sheet-close>Cancel</button><button class="btn primary" data-x="ok">Save</button></div>`, {
    onMount: (sh) => {
      const inp = $('#rn', sh); inp.focus(); inp.select();
      $('[data-x="ok"]', sh).onclick = () => {
        w.name = inp.value.trim() || w.name;
        const d = $('#rd', sh);
        if (d?.value) {
          const dur = (w.end || w.start) - w.start;
          w.start = new Date(d.value).getTime(); w.end = w.start + dur;
        }
        save(); closeSheet(); rerender();
      };
    },
  });
}
const toLocalInput = (t) => { const d = new Date(t); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

async function finishWorkout() {
  const w = st().active;
  const pending = w.entries.reduce((n, e) => n + e.sets.filter((s) => !s.done && (s.w != null || s.r != null)).length, 0);
  const logged = w.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  if (!logged) {
    if (await confirmSheet({ title: 'No sets checked off', body: 'Tap the check on each set you finish. Discard this workout?', confirm: 'Discard', danger: true })) {
      S.discardActive(); stopRest(); go('#/');
    }
    return;
  }
  if (pending && !w.editing && !(await confirmSheet({ title: `${pending} set${pending > 1 ? 's' : ''} not checked off`, body: 'Unchecked sets will not be saved.', confirm: 'Finish anyway' }))) return;
  const wasEditing = !!w.editing;
  const prs = w.entries.flatMap((e) => e.sets.filter((s) => s.pr?.length).map((s) => ({ e, s })));
  const done = S.finishActive();
  stopRest();
  if (wasEditing) { toast('Workout updated.'); go(`#/session/${done.id}`); return; }
  const stats = S.workoutStats(done);
  const sk = S.streak();
  go(`#/session/${done.id}`);
  openSheet(`
    <div class="celebrate">
      <p class="eyebrow">Workout saved</p>
      <h2 class="display">${esc(done.name)}</h2>
      <div class="stat-row">
        <div><span class="stat-big">${fmtMins(stats.mins)}</span><span class="stat-label">time</span></div>
        <div><span class="stat-big">${stats.sets}</span><span class="stat-label">sets</span></div>
        <div><span class="stat-big">${fmtNum(S.toDisplay(stats.vol))}</span><span class="stat-label">${unit()} moved</span></div>
      </div>
      <p class="lead">${sk.thisWeek >= sk.goal ? `Weekly goal hit (${sk.thisWeek}/${sk.goal}).` : `${sk.thisWeek} of ${sk.goal} this week.`}${sk.current > 1 ? ` ${sk.current} week streak.` : ''}</p>
      ${prs.length ? `<ul class="list pr-list">${prs.map(({ e, s }) => `<li class="list-row"><span class="pr-icon">${icon.trophy}</span><span class="grow"><strong>${esc(exById(e.exerciseId)?.name)}</strong><span class="muted small block">${esc(s.pr.join(', '))}</span></span><span class="mono">${s.w ? fmtW(s.w) + '×' + s.r : s.r + ' reps'}</span></li>`).join('')}</ul>` : ''}
      <button class="btn primary block" data-sheet-close>Done</button>
    </div>`);
}

function addExercise() {
  exercisePicker((id) => {
    st().active.entries.push(S.newEntry(id));
    save(); rerender();
    requestAnimationFrame(() => view.querySelector('.entry:last-of-type')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  });
}

function platesSheet(entryId) {
  const e = st().active.entries.find((x) => x.id === entryId);
  const first = e.sets.find((s) => !s.done && !s.warmup) || e.sets[e.sets.length - 1];
  const sg = S.suggest(e.exerciseId, { sets: e.targetSets, repMin: e.repMin, repMax: e.repMax });
  const start = first?.w ?? sg.w;
  const u = unit();
  const plates = u === 'kg' ? [25, 20, 15, 10, 5, 2.5, 1.25] : [45, 35, 25, 10, 5, 2.5];
  const calc = (total, bar) => {
    let side = (total - bar) / 2;
    if (side < 0) return null;
    const out = [];
    for (const p of plates) while (side >= p - 1e-6) { out.push(p); side -= p; }
    return { out, left: Math.round(side * 2 * 100) / 100 };
  };
  const draw = (sh) => {
    const total = parseFloat($('#pl-total', sh).value), bar = parseFloat($('#pl-bar', sh).value);
    const res = isNaN(total) ? null : calc(total, bar || 0);
    $('#pl-out', sh).innerHTML = !res ? '<p class="muted">Weight is lighter than the bar.</p>'
      : !res.out.length ? '<p class="muted">Just the bar.</p>'
      : `<div class="plates">${res.out.map((p) => `<span class="plate" style="--h:${40 + (p / plates[0]) * 60}%">${p}</span>`).join('')}</div>
         <p class="muted small">Per side: ${res.out.join(' + ')}${res.left ? ` (${res.left} ${u} can't be made)` : ''}</p>`;
  };
  openSheet(`
    <h2 class="sheet-title">Plate math</h2>
    <div class="two-col">
      <label class="field"><span class="field-label">Total (${u})</span><input id="pl-total" class="num" inputmode="decimal" value="${start != null ? fmtW(start) : ''}"></label>
      <label class="field"><span class="field-label">Bar (${u})</span><input id="pl-bar" class="num" inputmode="decimal" value="${st().settings.bar[u]}"></label>
    </div>
    <div id="pl-out"></div>`, {
    onMount: (sh) => { draw(sh); sh.addEventListener('input', () => draw(sh)); },
  });
}

/* ================= exercise picker ================= */

function exercisePicker(onPick) {
  let filter = 'All', q = '';
  const recent = new Map();
  S.finishedWorkouts().forEach((w) => w.entries.forEach((e) => { if (!recent.has(e.exerciseId)) recent.set(e.exerciseId, w.start); }));
  const draw = (sh) => {
    const ql = q.toLowerCase();
    const list = st().exercises
      .filter((e) => !e.archived && (filter === 'All' || (filter === 'Recent' ? recent.has(e.id) : e.muscle === filter)) && (!ql || e.name.toLowerCase().includes(ql)))
      .sort((a, b) => filter === 'Recent' ? recent.get(b.id) - recent.get(a.id) : a.name.localeCompare(b.name));
    $('#pk-list', sh).innerHTML = list.map((e) => `<li><button class="list-row" data-pick="${esc(e.id)}">
        <span class="grow"><strong>${esc(e.name)}</strong><span class="muted small block">${esc(e.muscle)}${recent.has(e.id) ? ' · ' + relDay(recent.get(e.id)) : ''}</span></span>
        <span class="chev">${icon.plus}</span></button></li>`).join('')
      + (q && !list.some((e) => e.name.toLowerCase() === ql) ? `<li><button class="list-row create" data-create><span class="grow"><strong>Create "${esc(q)}"</strong><span class="muted small block">New exercise</span></span></button></li>` : '')
      || '<li class="empty small">Nothing matches.</li>';
    $$('.chip', sh).forEach((c) => c.classList.toggle('active', c.dataset.f === filter));
  };
  openSheet(`
    <h2 class="sheet-title">Add exercise</h2>
    <input id="pk-q" class="search" type="search" placeholder="Search or type a new name" autocomplete="off">
    <div class="chips">${['All', 'Recent', ...MUSCLES].map((m) => `<button class="chip" data-f="${m}">${m}</button>`).join('')}</div>
    <ul class="list pick-list" id="pk-list"></ul>`, {
    tall: true,
    onMount: (sh) => {
      if (recent.size) filter = 'Recent';
      draw(sh);
      $('#pk-q', sh).addEventListener('input', (e) => { q = e.target.value.trim(); if (q) filter = 'All'; draw(sh); });
      sh.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (chip) { filter = chip.dataset.f; draw(sh); return; }
        const p = e.target.closest('[data-pick]');
        if (p) { closeSheet(true); onPick(p.dataset.pick); return; }
        if (e.target.closest('[data-create]')) { closeSheet(true); editExerciseSheet(null, q, (ex) => onPick(ex.id)); }
      });
    },
  });
}

function editExerciseSheet(ex, presetName = '', onSaved) {
  const isNew = !ex;
  const e = ex || { name: presetName, muscle: 'Other', kind: 'weight', repMin: 8, repMax: 12 };
  const r = S.repRange(e);
  openSheet(`
    <h2 class="sheet-title">${isNew ? 'New exercise' : 'Edit exercise'}</h2>
    <label class="field"><span class="field-label">Name</span><input id="ex-name" value="${esc(e.name)}" autocomplete="off"></label>
    <div class="two-col">
      <label class="field"><span class="field-label">Muscle group</span><select id="ex-muscle">${MUSCLES.map((m) => `<option ${m === e.muscle ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label class="field"><span class="field-label">Type</span><select id="ex-kind"><option value="weight" ${e.kind === 'weight' ? 'selected' : ''}>Weight × reps</option><option value="reps" ${e.kind === 'reps' ? 'selected' : ''}>Bodyweight reps</option></select></label>
    </div>
    <div class="three-col">
      <label class="field"><span class="field-label">Min reps</span><input id="ex-min" class="num" inputmode="numeric" value="${r.min}"></label>
      <label class="field"><span class="field-label">Max reps</span><input id="ex-max" class="num" inputmode="numeric" value="${r.max}"></label>
      <label class="field"><span class="field-label">Jump (${unit()})</span><input id="ex-inc" class="num" inputmode="decimal" value="${e.inc ?? ''}" placeholder="${st().settings.increment[unit()]}"></label>
    </div>
    <p class="muted small">When you hit max reps on every set, the app suggests adding the jump. Leave it blank to use your default.</p>
    <div class="sheet-actions">
      ${!isNew ? '<button class="btn ghost danger-text" data-x="archive">Hide</button>' : '<button class="btn ghost" data-sheet-close>Cancel</button>'}
      <button class="btn primary" data-x="save">Save</button>
    </div>`, {
    onMount: (sh) => {
      $('#ex-name', sh).focus();
      $('[data-x="save"]', sh).onclick = () => {
        const name = $('#ex-name', sh).value.trim();
        if (!name) return toast('Give it a name.');
        const min = parseInt($('#ex-min', sh).value, 10) || 8;
        const max = Math.max(min, parseInt($('#ex-max', sh).value, 10) || 12);
        const incRaw = $('#ex-inc', sh).value.trim();
        const data = { name, muscle: $('#ex-muscle', sh).value, kind: $('#ex-kind', sh).value, repMin: min, repMax: max, inc: incRaw === '' ? undefined : parseFloat(incRaw) };
        let saved;
        if (isNew) {
          let id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || uid();
          if (exById(id)) id += '-' + uid().slice(-4);
          saved = { id, ...data };
          st().exercises.push(saved);
        } else { Object.assign(ex, data); saved = ex; }
        save(); closeSheet(true); onSaved?.(saved);
      };
      const ar = $('[data-x="archive"]', sh);
      if (ar) ar.onclick = () => { ex.archived = true; save(); closeSheet(); toast('Hidden from the exercise list. History is kept.'); go('#/progress'); };
    },
  });
}

/* ================= HISTORY ================= */

function renderHistory() {
  const all = S.finishedWorkouts();
  const groups = new Map();
  for (const w of all) {
    const k = new Date(w.start).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(w);
  }
  view.innerHTML = `
    ${header('History', { right: '<button class="btn ghost sm" data-action="log-past">Log past</button>' })}
    ${!all.length ? `<div class="empty card"><p><strong>Nothing logged yet.</strong></p><p class="muted">Finished workouts show up here.</p><a class="btn primary" href="#/workout">Start a workout</a></div>` : ''}
    ${[...groups].map(([month, ws]) => `
      <h2 class="section-label">${esc(month)} <span class="muted">· ${ws.length}</span></h2>
      <ul class="list card">${ws.map((w) => {
        const s = S.workoutStats(w);
        return `<li><a class="list-row" href="#/session/${w.id}">
          <span class="date-chip"><span>${new Date(w.start).toLocaleDateString(undefined, { weekday: 'short' })}</span><strong>${new Date(w.start).getDate()}</strong></span>
          <span class="grow"><strong>${esc(w.name)}</strong><span class="muted small block">${w.entries.map((e) => exById(e.exerciseId)?.name).filter(Boolean).slice(0, 3).map(esc).join(', ')}${w.entries.length > 3 ? ` +${w.entries.length - 3}` : ''}</span></span>
          <span class="muted small right">${s.mins ? fmtMins(s.mins) : ''}<span class="block">${s.sets} sets</span></span>
        </a></li>`;
      }).join('')}</ul>`).join('')}
  `;
}

function renderSession(id) {
  const w = workoutById(id);
  if (!w) { view.innerHTML = header('Not found', { back: '#/history' }) + '<p class="empty">That workout is gone.</p>'; return; }
  const s = S.workoutStats(w);
  view.innerHTML = `
    ${header(w.name, { back: '#/history', right: `<button class="icon-btn" data-action="session-menu" data-id="${w.id}" aria-label="Options">${icon.dots}</button>` })}
    <p class="muted center">${fmtDate(w.start, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · ${fmtTime(w.start)}</p>
    <div class="stat-row card">
      <div><span class="stat-big">${s.mins ? fmtMins(s.mins) : '-'}</span><span class="stat-label">time</span></div>
      <div><span class="stat-big">${s.sets}</span><span class="stat-label">sets</span></div>
      <div><span class="stat-big">${fmtNum(S.toDisplay(s.vol))}</span><span class="stat-label">${unit()} volume</span></div>
    </div>
    ${w.entries.map((e) => {
      const ex = exById(e.exerciseId);
      let n = 0;
      return `<section class="card">
        <div class="card-head"><a class="h3 link-plain" href="#/exercise/${encodeURIComponent(e.exerciseId)}">${esc(ex?.name || e.exerciseId)}</a><span class="muted small">best e1RM ${fmtW(S.entryStats(e).bestE) || '-'}</span></div>
        <table class="sets-table"><tbody>${e.sets.map((x) => `<tr class="${x.warmup ? 'warm' : ''}"><td class="muted">${x.warmup ? 'W' : ++n}</td><td class="mono">${x.w ? fmtW(x.w) + ' ' + unit() : ex?.kind === 'reps' ? 'BW' : '0'}</td><td class="mono">× ${x.r}</td><td>${x.pr?.length ? `<span class="pr-badge inline">${icon.trophy}${esc(x.pr[0])}</span>` : ''}</td></tr>`).join('')}</tbody></table>
      </section>`;
    }).join('')}
    ${w.notes ? `<section class="card"><h2 class="h3">Notes</h2><p class="pre">${esc(w.notes)}</p></section>` : ''}
    <div class="stack">
      <button class="btn ghost block" data-action="repeat" data-id="${w.id}">Do this workout again</button>
    </div>
  `;
}

function sessionMenu(id) {
  const w = workoutById(id);
  openSheet(`
    <h2 class="sheet-title">${esc(w.name)}</h2>
    <div class="stack">
      <button class="btn ghost block" data-x="edit">Edit workout</button>
      <button class="btn danger block" data-x="del">Delete workout</button>
    </div>`, {
    onMount: (sh) => {
      $('[data-x="edit"]', sh).onclick = () => {
        closeSheet(true);
        if (st().active) return toast('Finish the current workout first.');
        const copy = JSON.parse(JSON.stringify(w));
        copy.editing = true;
        copy.entries.forEach((e) => { e.id ||= uid(); e.sets.forEach((s) => (s.done = true)); });
        S.state.active = copy; save(true); go('#/workout');
      };
      $('[data-x="del"]', sh).onclick = async () => {
        closeSheet(true);
        if (await confirmSheet({ title: 'Delete this workout?', body: 'This also removes any PRs it set. It cannot be undone.', confirm: 'Delete', danger: true })) {
          S.state.workouts = S.state.workouts.filter((x) => x.id !== id); save(true); toast('Deleted.'); go('#/history');
        }
      };
    },
  });
}

function repeatWorkout(id) {
  if (st().active) { toast('Finish the current workout first.'); return go('#/workout'); }
  const w = workoutById(id);
  if (w.routineId && routineById(w.routineId)) return startRoutine(w.routineId);
  S.startWorkout(null);
  st().active.name = w.name;
  st().active.entries = w.entries.map((e) => S.newEntry(e.exerciseId, { sets: e.sets.filter((s) => !s.warmup).length, repMin: e.repMin, repMax: e.repMax }));
  save(true);
  go('#/workout');
}

function logPast() {
  if (st().active) { toast('Finish the current workout first.'); return go('#/workout'); }
  const y = new Date(); y.setDate(y.getDate() - 1); y.setHours(18, 0, 0, 0);
  openSheet(`
    <h2 class="sheet-title">Log a past workout</h2>
    <label class="field"><span class="field-label">When</span><input id="lp-date" type="datetime-local" value="${toLocalInput(y.getTime())}"></label>
    <label class="field"><span class="field-label">Routine</span><select id="lp-r"><option value="">None, I'll add exercises</option>${st().routines.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></label>
    <label class="field"><span class="field-label">Duration (min)</span><input id="lp-dur" class="num" inputmode="numeric" value="60"></label>
    <div class="sheet-actions"><button class="btn ghost" data-sheet-close>Cancel</button><button class="btn primary" data-x="go">Continue</button></div>`, {
    onMount: (sh) => {
      $('[data-x="go"]', sh).onclick = () => {
        const t = new Date($('#lp-date', sh).value).getTime() || y.getTime();
        const a = S.startWorkout($('#lp-r', sh).value || null);
        a.start = t; a.end = t + (parseInt($('#lp-dur', sh).value, 10) || 60) * 60000; a.editing = true;
        save(true); closeSheet(true); go('#/workout');
      };
    },
  });
}

/* ================= PROGRESS ================= */

function renderProgress() {
  const recent = new Map();
  S.finishedWorkouts().forEach((w) => w.entries.forEach((e) => { if (!recent.has(e.exerciseId)) recent.set(e.exerciseId, w.start); }));
  const done = [...recent.keys()].map(exById).filter(Boolean);
  const rest = st().exercises.filter((e) => !recent.has(e.id) && !e.archived).sort((a, b) => a.name.localeCompare(b.name));

  view.innerHTML = `
    ${header('Progress', { right: `<button class="btn ghost sm" data-action="new-exercise">${icon.plus} New</button>` })}
    <input class="search" type="search" id="pg-q" placeholder="Search exercises" autocomplete="off">
    ${done.length ? `<h2 class="section-label">Your lifts</h2>
      <ul class="list card" id="pg-done">${done.map((ex) => {
        const h = S.exerciseHistory(ex.id);
        const rec = S.records(ex.id);
        const trend = h.length >= 2 ? (h[0].bestE || h[0].maxR) - (h[Math.min(h.length - 1, 4)].bestE || h[Math.min(h.length - 1, 4)].maxR) : 0;
        return `<li data-name="${esc(ex.name.toLowerCase())}"><a class="list-row" href="#/exercise/${encodeURIComponent(ex.id)}">
          <span class="grow"><strong>${esc(ex.name)}</strong><span class="muted small block">${h.length} session${h.length === 1 ? '' : 's'} · ${relDay(recent.get(ex.id))}</span></span>
          <span class="right"><span class="mono">${rec.topW ? fmtW(rec.topW.w) + ' ' + unit() : rec.maxR ? rec.maxR.r + ' reps' : ''}</span>
          ${trend ? `<span class="small block ${trend > 0 ? 'good' : 'muted'}">${trend > 0 ? '▲' : '▼'} trend</span>` : ''}</span>
        </a></li>`;
      }).join('')}</ul>` : `<div class="card empty"><p class="muted">Finish a workout and your lifts, PRs and charts show up here.</p></div>`}
    <h2 class="section-label">Exercise library</h2>
    <ul class="list card" id="pg-rest">${rest.map((ex) => `<li data-name="${esc(ex.name.toLowerCase())}"><a class="list-row" href="#/exercise/${encodeURIComponent(ex.id)}"><span class="grow">${esc(ex.name)}<span class="muted small block">${esc(ex.muscle)}</span></span><span class="chev">›</span></a></li>`).join('')}</ul>
  `;
  $('#pg-q').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    $$('[data-name]', view).forEach((li) => { li.hidden = q && !li.dataset.name.includes(q); });
  });
}

let chartMetric = 'e1rm';
function renderExercise(id) {
  const ex = exById(id);
  if (!ex) { view.innerHTML = header('Not found', { back: '#/progress' }); return; }
  const hist = S.exerciseHistory(id);
  const rec = S.records(id);
  const r = S.repRange(ex);
  const sg = S.suggest(id);
  const isReps = ex.kind === 'reps';
  if (isReps && chartMetric !== 'reps' && !rec.topW) chartMetric = 'reps';

  view.innerHTML = `
    ${header(ex.name, { back: '#/progress', right: `<button class="btn ghost sm" data-action="edit-exercise" data-id="${esc(ex.id)}">Edit</button>` })}
    <p class="muted center small">${esc(ex.muscle)} · ${r.min} to ${r.max} reps${ex.inc != null ? ` · +${ex.inc} ${unit()} jumps` : ''}</p>
    <section class="card next-time">
      <p class="eyebrow">Next time</p>
      <p class="next-line">${sg.w ? `<strong>${fmtW(sg.w)} ${unit()}</strong> × ${sg.r}+` : isReps ? `<strong>${sg.r} reps</strong>` : '<strong>Pick a starting weight</strong>'}</p>
      <p class="muted small">${esc(sg.note)}</p>
    </section>
    <div class="tiles">
      <div class="tile"><span class="tile-label">Heaviest</span><span class="tile-val">${rec.topW ? fmtW(rec.topW.w) : '-'}<small>${rec.topW ? ' ' + unit() + ' × ' + rec.topW.r : ''}</small></span><span class="tile-sub">${rec.topW ? fmtDate(rec.topW.date, { month: 'short', day: 'numeric' }) : ''}</span></div>
      <div class="tile"><span class="tile-label">Best e1RM</span><span class="tile-val">${rec.bestE ? fmtW(rec.bestE.v) : '-'}<small>${rec.bestE ? ' ' + unit() : ''}</small></span><span class="tile-sub">${rec.bestE ? `${fmtW(rec.bestE.w)} × ${rec.bestE.r}` : ''}</span></div>
      <div class="tile"><span class="tile-label">Most reps</span><span class="tile-val">${rec.maxR ? rec.maxR.r : '-'}</span><span class="tile-sub">${rec.maxR ? (rec.maxR.w ? `at ${fmtW(rec.maxR.w)} ${unit()}` : 'bodyweight') : ''}</span></div>
      <div class="tile"><span class="tile-label">Sessions</span><span class="tile-val">${hist.length}</span><span class="tile-sub">${hist[0] ? 'last ' + relDay(hist[0].workout.start) : ''}</span></div>
    </div>
    <section class="card">
      <div class="card-head">
        <h2 class="h3">Trend</h2>
        <div class="seg" role="tablist">
          ${[['e1rm', 'e1RM'], ['top', 'Top set'], ['reps', 'Reps'], ['vol', 'Volume']].map(([k, l]) => `<button role="tab" class="${chartMetric === k ? 'active' : ''}" data-action="metric" data-m="${k}" aria-selected="${chartMetric === k}">${l}</button>`).join('')}
        </div>
      </div>
      <div id="chart"></div>
      <p class="muted small">${{ e1rm: 'Estimated one-rep max (Epley) from your best set each session.', top: 'Heaviest working set each session.', reps: 'Most reps in a single set each session.', vol: 'Weight × reps across all working sets.' }[chartMetric]}</p>
    </section>
    <h2 class="section-label">Sessions</h2>
    ${hist.length ? `<ul class="list card">${hist.slice(0, 50).map((h) => `<li><a class="list-row" href="#/session/${h.workout.id}">
      <span class="grow"><span class="small muted block">${fmtDate(h.workout.start)} · ${esc(h.workout.name)}</span>${esc(describeSets(h.sets, ex.kind))}</span>
      <span class="mono small right">${h.bestE ? fmtW(h.bestE) : h.maxR}</span></a></li>`).join('')}</ul>` : '<p class="muted empty">No sessions yet.</p>'}
  `;
  const pts = [...hist].reverse().map((h) => {
    const top = h.sets.reduce((a, s) => ((s.w || 0) > (a.w || 0) || ((s.w || 0) === (a.w || 0) && s.r > a.r) ? s : a), h.sets[0]);
    const v = { e1rm: S.toDisplay(h.bestE), top: S.toDisplay(h.topW), reps: h.maxR, vol: S.toDisplay(h.vol) }[chartMetric];
    return { t: h.workout.start, v, label: top.w ? `${fmtW(top.w)} ${unit()} × ${top.r}` : `${top.r} reps` };
  });
  lineChart($('#chart'), pts, { fmt: (v) => (chartMetric === 'vol' ? fmtNum(v) : String(Math.round(v * 10) / 10)), label: `${ex.name} trend` });
}

/* ================= ROUTINES ================= */

function renderRoutines() {
  const rs = st().routines;
  view.innerHTML = `
    ${header('Routines', { back: '#/workout', right: `<button class="btn ghost sm" data-action="new-routine">${icon.plus} New</button>` })}
    ${rs.length ? `
      <p class="muted small pad">The app rotates through these in order. Reorder them with the arrows.</p>
      <ul class="list card">${rs.map((r, i) => `<li class="routine-row">
        <a class="list-row grow" href="#/routine/${r.id}"><span class="grow"><strong>${esc(r.name)}</strong><span class="muted small block">${r.items.length} exercises</span></span></a>
        <button class="icon-btn" data-action="routine-move" data-i="${i}" data-d="-1" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>${icon.up}</button>
        <button class="icon-btn" data-action="routine-move" data-i="${i}" data-d="1" aria-label="Move down" ${i === rs.length - 1 ? 'disabled' : ''}>${icon.down}</button>
      </li>`).join('')}</ul>` : ''}
    <h2 class="section-label">${rs.length ? 'Add a starter plan' : 'Pick a starter plan'}</h2>
    <p class="muted small pad">You can edit any of these after. Swap exercises for what your gym has.</p>
    ${STARTER_PLANS.map((p, i) => `<section class="card plan">
      <div class="card-head"><div><h3 class="h3">${esc(p.name)}</h3><p class="muted small">${esc(p.blurb)}</p></div></div>
      <p class="small">${p.routines.map((r) => `<strong>${esc(r.name)}:</strong> ${r.items.map((it) => esc(exById(it.exerciseId)?.name || '')).join(', ')}`).join('<br>')}</p>
      <button class="btn ghost block" data-action="add-plan" data-i="${i}">Add ${p.routines.length} routines</button>
    </section>`).join('')}
  `;
}

function renderRoutineEdit(id) {
  const r = routineById(id);
  if (!r) return go('#/routines');
  view.innerHTML = `
    ${header('Edit routine', { back: '#/routines', right: `<button class="btn ghost sm danger-text" data-action="delete-routine" data-id="${r.id}">Delete</button>` })}
    <label class="field"><span class="field-label">Name</span><input id="rt-name" value="${esc(r.name)}"></label>
    <ul class="list card" id="rt-items">
      ${r.items.map((it, i) => {
        const ex = exById(it.exerciseId);
        const rr = S.repRange(ex, it);
        return `<li class="rt-item" data-i="${i}">
          <div class="rt-top"><strong class="grow">${esc(ex?.name || 'Missing exercise')}</strong>
            <button class="icon-btn" data-action="rt-move" data-i="${i}" data-d="-1" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>${icon.up}</button>
            <button class="icon-btn" data-action="rt-move" data-i="${i}" data-d="1" aria-label="Move down" ${i === r.items.length - 1 ? 'disabled' : ''}>${icon.down}</button>
            <button class="icon-btn" data-action="rt-del" data-i="${i}" aria-label="Remove">${icon.x}</button>
          </div>
          <div class="rt-fields">
            <label><span>Sets</span><input class="num" inputmode="numeric" data-k="sets" value="${it.sets}"></label>
            <label><span>Reps</span><input class="num" inputmode="numeric" data-k="repMin" value="${rr.min}"></label>
            <span class="rt-dash">to</span>
            <label><span>&nbsp;</span><input class="num" inputmode="numeric" data-k="repMax" value="${rr.max}"></label>
          </div>
        </li>`;
      }).join('')}
    </ul>
    <button class="btn ghost block" data-action="rt-add">${icon.plus} Add exercise</button>
    <button class="btn primary block" data-action="start" data-id="${r.id}">Start this routine</button>
  `;
  $('#rt-name').addEventListener('input', (e) => { r.name = e.target.value || 'Routine'; save(); });
  $('#rt-items').addEventListener('input', (e) => {
    const li = e.target.closest('.rt-item'); if (!li) return;
    const v = parseInt(e.target.value, 10);
    if (v > 0) { r.items[+li.dataset.i][e.target.dataset.k] = v; save(); }
  });
}

/* ================= SETTINGS ================= */

function renderSettings() {
  const s = st().settings;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  view.innerHTML = `
    ${header('Settings')}
    <section class="card form">
      <div class="setting"><span>Units</span><div class="seg">${['lb', 'kg'].map((u) => `<button class="${s.unit === u ? 'active' : ''}" data-action="unit" data-u="${u}">${u}</button>`).join('')}</div></div>
      <div class="setting"><span>Weekly goal<span class="muted small block">Workouts per week for your streak</span></span><div class="stepper"><button data-action="goal" data-d="-1" aria-label="Fewer">−</button><strong>${s.weeklyGoal}</strong><button data-action="goal" data-d="1" aria-label="More">+</button></div></div>
      <div class="setting"><span>Rest timer<span class="muted small block">Starts when you check off a set</span></span><div class="stepper"><button data-action="rest-def" data-d="-15" aria-label="Shorter">−</button><strong>${fmtDur(s.restSeconds * 1000)}</strong><button data-action="rest-def" data-d="15" aria-label="Longer">+</button></div></div>
      <div class="setting"><span>Auto-start rest timer</span><label class="switch"><input type="checkbox" id="set-auto" ${s.autoRest ? 'checked' : ''}><span></span></label></div>
      <div class="setting"><span>Default weight jump<span class="muted small block">Added when you hit the top of your rep range</span></span><input class="num small-input" id="set-inc" inputmode="decimal" value="${s.increment[s.unit]}"> <span class="muted">${s.unit}</span></div>
      <div class="setting"><span>Bar weight</span><input class="num small-input" id="set-bar" inputmode="decimal" value="${s.bar[s.unit]}"> <span class="muted">${s.unit}</span></div>
    </section>

    <h2 class="section-label">Your data</h2>
    <section class="card">
      <p class="muted small">Everything is stored on this device only. Export a backup now and then, especially before clearing your browser or switching phones.</p>
      <div class="stack">
        <button class="btn ghost block" data-action="export-json">Export backup (JSON)</button>
        <button class="btn ghost block" data-action="export-csv">Export sets (CSV for spreadsheets)</button>
        <label class="btn ghost block file-btn">Import backup<input type="file" id="import" accept="application/json,.json"></label>
      </div>
      <p class="muted small" id="persist-status"></p>
    </section>

    ${!standalone ? `<h2 class="section-label">Install on your phone</h2>
    <section class="card small">
      <p><strong>iPhone (Safari):</strong> tap Share, then Add to Home Screen.</p>
      <p><strong>Android (Chrome):</strong> tap the ⋮ menu, then Install app.</p>
      <p class="muted">Once installed it opens full screen and works with no signal in the gym.</p>
    </section>` : ''}

    <h2 class="section-label">Danger zone</h2>
    <section class="card"><button class="btn danger block" data-action="reset">Erase all data</button></section>
    <p class="muted small center">Liftlog · ${st().workouts.length} workouts stored</p>
  `;
  $('#set-auto').addEventListener('change', (e) => { s.autoRest = e.target.checked; save(); });
  $('#set-inc').addEventListener('change', (e) => { const v = parseFloat(e.target.value); if (v > 0) { s.increment[s.unit] = v; save(); } });
  $('#set-bar').addEventListener('change', (e) => { const v = parseFloat(e.target.value); if (v >= 0) { s.bar[s.unit] = v; save(); } });
  $('#import').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const text = await f.text();
      if (!(await confirmSheet({ title: 'Replace all data with this backup?', body: 'Your current data on this device will be overwritten.', confirm: 'Import', danger: true }))) return;
      S.importJSON(text); toast('Backup restored.'); go('#/');
    } catch (err) { toast(err.message || 'Could not read that file.'); }
  });
  navigator.storage?.persisted?.().then((p) => {
    const el = $('#persist-status');
    if (el) el.textContent = p ? 'Storage is marked persistent, so the browser will not clear it on its own.' : 'Tip: install the app to the home screen so the browser keeps your data.';
  });
}

/* ================= REST TIMER ================= */

let restTick = null;
function startRest(secs = st().settings.restSeconds) {
  st().rest = { end: Date.now() + secs * 1000, total: secs };
  save();
  runRest();
}
function stopRest() {
  st().rest = null; save();
  clearInterval(restTick);
  $('#restbar').hidden = true;
  document.body.classList.remove('resting');
}
function runRest() {
  clearInterval(restTick);
  const bar = $('#restbar');
  if (!st().rest) { bar.hidden = true; return; }
  bar.hidden = false;
  document.body.classList.add('resting');
  const tick = () => {
    const r = st().rest;
    if (!r) return stopRest();
    const left = r.end - Date.now();
    $('#rest-time').textContent = fmtDur(Math.max(0, left) + 999);
    bar.style.setProperty('--p', Math.max(0, left / (r.total * 1000)));
    if (left <= 0) { beep(); stopRest(); toast('Rest done. Next set.'); }
  };
  tick();
  restTick = setInterval(tick, 250);
}

/* ================= global actions ================= */

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  const s = st();
  switch (a) {
    case 'start': closeSheet(true); return startRoutine(el.dataset.id);
    case 'start-empty': closeSheet(true); if (s.active) { toast('Finish the current workout first.'); return go('#/workout'); } primeAudio(); S.startWorkout(null); return go('#/workout');
    case 'pick-routine': return pickRoutineSheet();
    case 'log-past': return logPast();
    case 'toggle-set': return toggleSet(el);
    case 'add-set': return addSet(el.dataset.entry);
    case 'set-menu': return setMenu(el);
    case 'entry-menu': return entryMenu(el.dataset.entry);
    case 'workout-menu': return workoutMenu();
    case 'rename-workout': return renameWorkout();
    case 'finish': return finishWorkout();
    case 'add-exercise': return addExercise();
    case 'plates': return platesSheet(el.dataset.entry);
    case 'session-menu': return sessionMenu(el.dataset.id);
    case 'repeat': return repeatWorkout(el.dataset.id);
    case 'metric': chartMetric = el.dataset.m; return rerender();
    case 'edit-exercise': return editExerciseSheet(exById(el.dataset.id), '', () => rerender());
    case 'new-exercise': return editExerciseSheet(null, '', (ex) => go(`#/exercise/${encodeURIComponent(ex.id)}`));
    case 'new-routine': {
      const r = { id: uid(), name: `Routine ${s.routines.length + 1}`, items: [] };
      s.routines.push(r); save(); return go(`#/routine/${r.id}`);
    }
    case 'add-plan': {
      const p = STARTER_PLANS[+el.dataset.i];
      for (const r of p.routines) s.routines.push({ id: uid(), name: r.name, items: r.items.map((it) => ({ ...it })) });
      save(); toast(`Added ${p.routines.length} routines.`); return go('#/');
    }
    case 'routine-move': case 'rt-move': {
      const arr = a === 'rt-move' ? routineById(currentPath.split('/').pop()).items : s.routines;
      const i = +el.dataset.i, j = i + +el.dataset.d;
      if (j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]]; save(); return rerender();
    }
    case 'rt-del': routineById(currentPath.split('/').pop()).items.splice(+el.dataset.i, 1); save(); return rerender();
    case 'rt-add': {
      const r = routineById(currentPath.split('/').pop());
      return exercisePicker((id) => { const ex = exById(id); r.items.push({ exerciseId: id, sets: 3, repMin: ex.repMin, repMax: ex.repMax }); save(); rerender(); });
    }
    case 'delete-routine': {
      if (await confirmSheet({ title: 'Delete this routine?', body: 'Past workouts stay in your history.', confirm: 'Delete', danger: true })) {
        s.routines = s.routines.filter((r) => r.id !== el.dataset.id); save(); go('#/routines');
      }
      return;
    }
    case 'unit': s.settings.unit = el.dataset.u; save(); return rerender();
    case 'goal': s.settings.weeklyGoal = Math.min(7, Math.max(1, s.settings.weeklyGoal + +el.dataset.d)); save(); return rerender();
    case 'rest-def': s.settings.restSeconds = Math.min(600, Math.max(15, s.settings.restSeconds + +el.dataset.d)); save(); return rerender();
    case 'rest-adj': if (s.rest) { s.rest.end += +el.dataset.delta * 1000; s.rest.total = Math.max(s.rest.total, Math.ceil((s.rest.end - Date.now()) / 1000)); save(); runRest(); } return;
    case 'rest-stop': return stopRest();
    case 'export-json': return download(`liftlog-backup-${new Date().toISOString().slice(0, 10)}.json`, S.exportJSON());
    case 'export-csv': return download(`liftlog-sets-${new Date().toISOString().slice(0, 10)}.csv`, S.exportCSV(), 'text/csv');
    case 'reset': {
      if (await confirmSheet({ title: 'Erase everything?', body: 'All workouts, routines and custom exercises on this device will be deleted. Export a backup first if you want one.', confirm: 'Erase', danger: true })) {
        S.resetAll(); stopRest(); toast('All data erased.'); go('#/');
      }
    }
  }
});

/* ================= boot ================= */

route();
if (st().rest) runRest();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Update ready. Reopen the app to get it.', 5000);
        });
      });
    }).catch(() => {});
  });
}
navigator.storage?.persist?.().catch(() => {});
