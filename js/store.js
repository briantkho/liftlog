// State, persistence, and all the training math (PRs, suggestions, streaks).
// Weights are stored in kg internally and converted for display.

import { SEED_EXERCISES } from './seed.js';

const KEY = 'liftlog:v1';
const KG_PER_LB = 0.45359237;

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function defaults() {
  return {
    version: 1,
    settings: {
      unit: 'lb',
      weeklyGoal: 3,
      restSeconds: 120,
      autoRest: true,
      increment: { lb: 5, kg: 2.5 },
      bar: { lb: 45, kg: 20 },
    },
    exercises: SEED_EXERCISES.map((e) => ({ ...e })),
    routines: [],
    workouts: [],
    active: null,
    rest: null,
    createdAt: Date.now(),
  };
}

export let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    return migrate(JSON.parse(raw));
  } catch (err) {
    console.error('Could not read saved data', err);
    return defaults();
  }
}

function migrate(s) {
  const d = defaults();
  s.settings = { ...d.settings, ...(s.settings || {}) };
  s.settings.increment = { ...d.settings.increment, ...(s.settings.increment || {}) };
  s.settings.bar = { ...d.settings.bar, ...(s.settings.bar || {}) };
  s.exercises ||= d.exercises;
  s.routines ||= [];
  s.workouts ||= [];
  s.active ??= null;
  s.rest ??= null;
  return s;
}

let saveTimer = null;
export function save(now = false) {
  clearTimeout(saveTimer);
  const write = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (err) { console.error(err); }
  };
  if (now) write(); else saveTimer = setTimeout(write, 150);
}
window.addEventListener('pagehide', () => save(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });

export function replaceState(next) {
  state = migrate(next);
  save(true);
}

export function resetAll() {
  state = defaults();
  save(true);
}

/* ---------- units ---------- */

export const unit = () => state.settings.unit;

export function toDisplay(kg) {
  if (kg == null || kg === '') return null;
  const v = unit() === 'kg' ? kg : kg / KG_PER_LB;
  return Math.round(v * 10) / 10;
}
export function fromDisplay(v) {
  if (v == null || v === '' || isNaN(v)) return null;
  return unit() === 'kg' ? Number(v) : Number(v) * KG_PER_LB;
}
export function fmtW(kg, withUnit = false) {
  const v = toDisplay(kg);
  if (v == null) return '';
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return withUnit ? `${s} ${unit()}` : s;
}
export function incrementKg(ex) {
  const inc = ex?.inc != null ? ex.inc : state.settings.increment[unit()];
  return fromDisplay(inc);
}

/* ---------- lookups ---------- */

export const exById = (id) => state.exercises.find((e) => e.id === id);
export const routineById = (id) => state.routines.find((r) => r.id === id);
export const workoutById = (id) => state.workouts.find((w) => w.id === id);

export function repRange(ex, item) {
  return {
    min: item?.repMin ?? ex?.repMin ?? 8,
    max: item?.repMax ?? ex?.repMax ?? 12,
  };
}

export function finishedWorkouts() {
  return [...state.workouts].sort((a, b) => b.start - a.start);
}

/* ---------- set math ---------- */

export const isWorking = (s) => s.done && !s.warmup && s.r > 0;
export const e1rm = (w, r) => (w > 0 && r > 0 ? (r === 1 ? w : w * (1 + r / 30)) : 0);

export function entryStats(entry) {
  const sets = entry.sets.filter(isWorking);
  let topW = 0, bestE = 0, maxR = 0, vol = 0;
  for (const s of sets) {
    const w = s.w || 0;
    topW = Math.max(topW, w);
    bestE = Math.max(bestE, e1rm(w, s.r));
    maxR = Math.max(maxR, s.r);
    vol += w * s.r;
  }
  return { sets, topW, bestE, maxR, vol, reps: sets.reduce((a, s) => a + s.r, 0) };
}

export function workoutStats(w) {
  let sets = 0, vol = 0;
  for (const e of w.entries) {
    const st = entryStats(e);
    sets += st.sets.length;
    vol += st.vol;
  }
  return { sets, vol, mins: w.end ? Math.round((w.end - w.start) / 60000) : 0 };
}

// Every finished session for one exercise, newest first.
export function exerciseHistory(exId, { excludeId } = {}) {
  const out = [];
  for (const w of finishedWorkouts()) {
    if (w.id === excludeId) continue;
    for (const e of w.entries) {
      if (e.exerciseId !== exId) continue;
      const st = entryStats(e);
      if (st.sets.length) out.push({ workout: w, entry: e, ...st });
    }
  }
  return out;
}

export function records(exId, opts) {
  const hist = exerciseHistory(exId, opts);
  const r = { topW: null, bestE: null, maxR: null, vol: null, sessions: hist.length };
  for (const h of hist) {
    for (const s of h.sets) {
      const w = s.w || 0;
      if (w > 0 && (!r.topW || w > r.topW.w || (w === r.topW.w && s.r > r.topW.r))) r.topW = { w, r: s.r, date: h.workout.start };
      const e = e1rm(w, s.r);
      if (e > 0 && (!r.bestE || e > r.bestE.v)) r.bestE = { v: e, w, r: s.r, date: h.workout.start };
      if (!r.maxR || s.r > r.maxR.r) r.maxR = { r: s.r, w, date: h.workout.start };
    }
    if (h.vol > 0 && (!r.vol || h.vol > r.vol.v)) r.vol = { v: h.vol, date: h.workout.start };
  }
  return r;
}

// Which PRs a just-completed set beats, compared to history before this workout.
export function setPRs(exId, set, workoutId, priorSetsInWorkout = []) {
  if (!isWorking(set)) return [];
  const rec = records(exId, { excludeId: workoutId });
  if (!rec.sessions) return [];
  let topW = rec.topW?.w || 0, bestE = rec.bestE?.v || 0, maxR = rec.maxR?.r || 0;
  for (const s of priorSetsInWorkout.filter(isWorking)) {
    topW = Math.max(topW, s.w || 0);
    bestE = Math.max(bestE, e1rm(s.w || 0, s.r));
    maxR = Math.max(maxR, s.r);
  }
  const ex = exById(exId);
  const out = [];
  const w = set.w || 0;
  if (w > 0 && w > topW + 1e-6) out.push('Heaviest');
  else if (w > 0 && e1rm(w, set.r) > bestE + 1e-6) out.push('Best e1RM');
  if ((ex?.kind === 'reps' || !w) && set.r > maxR) out.push('Most reps');
  return out;
}

/* ---------- progression ---------- */

// Double progression: stay at a weight until every working set hits the top of
// the rep range, then add the increment and drop back to the bottom.
export function suggest(exId, item) {
  const ex = exById(exId);
  const range = repRange(ex, item);
  const hist = exerciseHistory(exId, { excludeId: state.active?.id });
  const last = hist[0];
  const targetSets = item?.sets || (last ? last.sets.length : 3);

  if (!last) {
    return {
      w: null, r: range.min, sets: targetSets, last: null, range,
      note: ex?.kind === 'reps'
        ? `First time logging this. Do what you can, aim for ${range.min} to ${range.max}.`
        : `First time logging this. Pick a weight you can lift for ${range.min} to ${range.max} reps.`,
    };
  }

  const top = last.topW;
  const atTop = last.sets.filter((s) => (s.w || 0) === top);
  const minReps = Math.min(...atTop.map((s) => s.r));

  if (ex?.kind === 'reps' && !top) {
    const r = Math.max(...last.sets.map((s) => s.r)) + 1;
    return { w: null, r, sets: targetSets, last, range, note: `Last best set was ${r - 1}. Try for ${r}.`, up: false };
  }

  if (minReps >= range.max && atTop.length >= Math.min(targetSets, last.sets.length)) {
    const w = top + incrementKg(ex);
    return {
      w, r: range.min, sets: targetSets, last, range, up: true,
      note: `You hit ${range.max}+ on every set last time. Go up to ${fmtW(w, true)}.`,
    };
  }
  const r = Math.min(range.max, Math.max(range.min, minReps + 1));
  return {
    w: top || null, r, sets: targetSets, last, range, up: false,
    note: minReps < range.min
      ? `Stay at ${fmtW(top, true)} and get every set to ${range.min}.`
      : `Stay at ${fmtW(top, true)}. Beat last time, aim for ${r}+ reps a set.`,
  };
}

/* ---------- workouts ---------- */

export function newEntry(exId, item) {
  const sg = suggest(exId, item);
  const sets = [];
  for (let i = 0; i < sg.sets; i++) sets.push({ w: null, r: null, done: false });
  return { id: uid(), exerciseId: exId, sets, repMin: sg.range.min, repMax: sg.range.max, targetSets: sg.sets };
}

export function startWorkout(routineId = null) {
  const routine = routineId ? routineById(routineId) : null;
  state.active = {
    id: uid(),
    routineId,
    name: routine ? routine.name : 'Workout',
    start: Date.now(),
    notes: '',
    entries: [],
  };
  if (routine) {
    for (const it of routine.items) {
      if (!exById(it.exerciseId)) continue;
      state.active.entries.push(newEntry(it.exerciseId, it));
    }
  }
  save(true);
  return state.active;
}

export function finishActive() {
  const w = state.active;
  if (!w) return null;
  // Drop sets never completed and exercises with nothing logged.
  w.entries = w.entries
    .map((e) => ({ ...e, sets: e.sets.filter((s) => s.done && s.r > 0) }))
    .filter((e) => e.sets.length);
  w.end ||= Date.now();
  delete w.editing;
  const idx = state.workouts.findIndex((x) => x.id === w.id);
  if (idx >= 0) state.workouts[idx] = w; else state.workouts.push(w);
  state.active = null;
  state.rest = null;
  save(true);
  return w;
}

export function discardActive() {
  state.active = null;
  state.rest = null;
  save(true);
}

/* ---------- consistency ---------- */

export function startOfWeek(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d.getTime();
}
const WEEK = 7 * 864e5;

export function weekCounts() {
  const map = new Map();
  for (const w of state.workouts) {
    const k = startOfWeek(w.start);
    map.set(k, (map.get(k) || 0) + 1);
  }
  return map;
}

export function streak() {
  const goal = state.settings.weeklyGoal;
  const counts = weekCounts();
  let wk = startOfWeek(Date.now());
  const thisWeek = counts.get(wk) || 0;
  let n = thisWeek >= goal ? 1 : 0;
  // The current week only breaks the streak once it is over.
  for (wk = wk - WEEK; ; wk -= WEEK) {
    // Handle DST drift by re-normalising.
    wk = startOfWeek(wk + 12 * 36e5);
    if ((counts.get(wk) || 0) >= goal) n++; else break;
  }
  let best = 0, run = 0;
  const keys = [...counts.keys()].sort((a, b) => a - b);
  if (keys.length) {
    for (let k = keys[0]; k <= startOfWeek(Date.now()); k = startOfWeek(k + WEEK + 12 * 36e5)) {
      if ((counts.get(k) || 0) >= goal) { run++; best = Math.max(best, run); } else run = 0;
    }
  }
  return { current: n, best: Math.max(best, n), thisWeek, goal };
}

export function nextRoutine() {
  if (!state.routines.length) return null;
  const last = finishedWorkouts().find((w) => w.routineId && routineById(w.routineId));
  if (!last) return state.routines[0];
  const i = state.routines.findIndex((r) => r.id === last.routineId);
  return state.routines[(i + 1) % state.routines.length];
}

export function lastDoneRoutine(routineId) {
  return finishedWorkouts().find((w) => w.routineId === routineId) || null;
}

export function recentPRs(days = 30) {
  const since = Date.now() - days * 864e5;
  const out = [];
  // Walk forward in time so each set is compared to what came before it.
  const ordered = [...state.workouts].sort((a, b) => a.start - b.start);
  const best = new Map();
  for (const w of ordered) {
    for (const e of w.entries) {
      const b = best.get(e.exerciseId) || { topW: 0, bestE: 0, maxR: 0, seen: false };
      const ex = exById(e.exerciseId);
      let hit = null;
      for (const s of e.sets.filter(isWorking)) {
        const wt = s.w || 0, est = e1rm(wt, s.r);
        if (b.seen && w.start >= since) {
          if (wt > b.topW + 1e-6) hit = { type: 'Heaviest', s };
          else if (wt > 0 && est > b.bestE + 1e-6 && !hit) hit = { type: 'Best e1RM', s };
          else if ((ex?.kind === 'reps' || !wt) && s.r > b.maxR && !hit) hit = { type: 'Most reps', s };
        }
        b.topW = Math.max(b.topW, wt); b.bestE = Math.max(b.bestE, est); b.maxR = Math.max(b.maxR, s.r);
      }
      b.seen = true;
      best.set(e.exerciseId, b);
      if (hit) out.push({ workout: w, exerciseId: e.exerciseId, ...hit });
    }
  }
  return out.reverse();
}

/* ---------- import / export ---------- */

export function exportJSON() {
  return JSON.stringify({ app: 'liftlog', exportedAt: new Date().toISOString(), data: state }, null, 2);
}

export function exportCSV() {
  const rows = [['date', 'workout', 'exercise', 'set', 'warmup', `weight_${unit()}`, 'reps', 'e1rm_' + unit()]];
  for (const w of [...state.workouts].sort((a, b) => a.start - b.start)) {
    const date = new Date(w.start).toISOString().slice(0, 10);
    for (const e of w.entries) {
      const name = exById(e.exerciseId)?.name || e.exerciseId;
      e.sets.forEach((s, i) => {
        rows.push([date, w.name, name, i + 1, s.warmup ? 'y' : '', fmtW(s.w), s.r, s.w ? fmtW(e1rm(s.w, s.r)) : '']);
      });
    }
  }
  return rows.map((r) => r.map((c) => {
    const v = String(c ?? '');
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(',')).join('\n');
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  const data = parsed.data || parsed;
  if (!Array.isArray(data.workouts) || !Array.isArray(data.exercises)) {
    throw new Error('That file does not look like a Liftlog backup.');
  }
  replaceState(data);
}
