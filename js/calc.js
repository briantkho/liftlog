// Weight math sheet: plate loading (both directions), warm-ups and percentages, lb/kg.
import * as S from './store.js';
import { exById, fmtW, unit, save } from './store.js';
import { $, $$, esc, openSheet, toast } from './ui.js';
import { PLATE_LOADED, EQUIPMENT } from './seed.js';

const BARS = {
  lb: [[45, 'Olympic 45'], [35, '35'], [25, 'EZ 25'], [15, '15'], [0, 'No bar']],
  kg: [[20, 'Olympic 20'], [15, '15'], [10, 'EZ 10'], [7, '7'], [0, 'No bar']],
};
const ALL_PLATES = { lb: [55, 45, 35, 25, 15, 10, 5, 2.5, 1.25], kg: [25, 20, 15, 10, 5, 2.5, 2, 1.25, 1, 0.5] };
const LB_PER_KG = 2.20462262;

const round1 = (v) => Math.round(v * 100) / 100;
const fmt = (v) => String(round1(v));

/**
 * opts.entry: the workout entry this was opened from (enables "Use" and "Add warm-ups")
 * opts.exerciseId: exercise context without an entry (e.g. from the exercise page)
 * opts.onApply(): called after weights were written to the entry
 */
export function openWeightMath({ entry = null, exerciseId = null, onApply, tab } = {}) {
  const u = unit();
  const settings = S.state.settings;
  const ex = exById(entry?.exerciseId || exerciseId);
  const equipment = ex?.equipment || 'barbell';
  const plateLoaded = PLATE_LOADED.includes(equipment);
  const inventory = () => settings.plates[u].slice().sort((a, b) => b - a);

  // Starting weight: next unchecked set, else today's suggestion, else last session's top set.
  let startKg = null;
  if (entry) {
    const next = entry.sets.find((s) => !s.done && !s.warmup && s.w != null) || entry.sets.find((s) => !s.warmup && s.w != null);
    startKg = next?.w ?? S.suggest(entry.exerciseId, { sets: entry.targetSets, repMin: entry.repMin, repMax: entry.repMax }).w;
  } else if (ex) {
    startKg = S.suggest(ex.id).w;
  }
  const best = ex ? S.records(ex.id).bestE : null;

  const defaultBar = ex?.bar?.[u] ?? (equipment === 'plate' ? 0 : settings.bar[u]);
  const st = {
    tab: tab || (plateLoaded || !ex ? 'plates' : 'percent'),
    bar: defaultBar,
    side: [], // plates on one side, heaviest first
    target: startKg != null ? S.toDisplay(startKg) : null,
    base: startKg != null ? S.toDisplay(startKg) : best ? S.toDisplay(best.v) : null,
    editPlates: false,
    conv: startKg != null ? S.toDisplay(startKg) : null,
  };

  const step = () => {
    if (plateLoaded || !ex) return 2 * Math.min(...inventory());
    return ex.inc ?? settings.increment[u];
  };
  const loadable = (v) => {
    if (v == null || isNaN(v)) return null;
    if (plateLoaded || !ex) { const s = step(); return Math.max(st.bar, st.bar + Math.round((v - st.bar) / s) * s); }
    const s = step(); return Math.round(v / s) * s;
  };
  const greedy = (total) => {
    let left = (total - st.bar) / 2;
    const out = [];
    if (left < 0) return { out, left: null };
    for (const p of inventory()) while (left >= p - 1e-6) { out.push(p); left -= p; }
    return { out, left: round1(left * 2) };
  };
  const total = () => st.bar + 2 * st.side.reduce((a, b) => a + b, 0);
  const fromTarget = () => { const r = greedy(st.target ?? st.bar); st.side = r.out; st.missing = r.left; };
  if (st.target != null) fromTarget();

  const plateH = (p) => 34 + (p / Math.max(...ALL_PLATES[u])) * 66;

  const tabs = [['plates', 'Plates'], ['percent', 'Warm-up & %'], ['convert', 'lb ⇄ kg']];

  const viewPlates = () => {
    const t = total();
    return `
      <div class="wm-total">
        <button class="wm-step" data-wm="minus" aria-label="Lighter">−</button>
        <label class="wm-total-field"><input id="wm-target" class="num" inputmode="decimal" value="${st.target != null ? fmt(st.target) : ''}" placeholder="${fmt(t)}"><span>${u}</span></label>
        <button class="wm-step" data-wm="plus" aria-label="Heavier">+</button>
      </div>
      <div class="chips wm-bars">${BARS[u].map(([v, l]) => `<button class="chip${st.bar === v ? ' active' : ''}" data-bar="${v}">${l}</button>`).join('')}</div>
      <div class="wm-bar-viz" aria-label="Plates on each side">
        <span class="wm-sleeve-end"></span>
        ${st.side.map((p, i) => `<button class="wm-plate" data-remove="${i}" style="--h:${plateH(p)}%" aria-label="Remove ${p}">${fmt(p)}</button>`).join('')}
        <span class="wm-sleeve"></span>
      </div>
      <p class="wm-readout">${st.side.length ? `<strong>Each side:</strong> ${st.side.map(fmt).join(' + ')}` : st.bar ? 'Just the bar.' : 'No plates.'}
        ${st.missing ? `<span class="warn-text block">${fmt(st.missing)} ${u} can't be made with your plates. Closest is ${fmt(t)}.</span>` : ''}
        ${st.target != null && st.target < st.bar ? '<span class="warn-text block">That is lighter than the bar.</span>' : ''}</p>
      <p class="muted small wm-hint">Tap a plate below to add a pair. Tap a plate on the bar to take it off.</p>
      <div class="wm-add">${inventory().map((p) => `<button class="wm-add-plate" data-add="${p}" style="--h:${plateH(p)}%">${fmt(p)}</button>`).join('')}</div>
      <button class="link small" data-wm="edit-plates">${st.editPlates ? 'Done' : 'Plates at my gym'}</button>
      ${st.editPlates ? `<div class="chips wrap">${ALL_PLATES[u].map((p) => `<button class="chip${settings.plates[u].includes(p) ? ' active' : ''}" data-inv="${p}">${fmt(p)}</button>`).join('')}</div>` : ''}
      ${entry ? `<button class="btn primary block" data-wm="use">Use ${fmt(t)} ${u} for remaining sets</button>` : ''}`;
  };

  const viewPercent = () => {
    const base = st.base;
    const ramp = base ? warmups(base) : [];
    return `
      <label class="field"><span class="field-label">Working weight or max (${u})</span>
        <input id="wm-base" class="num" inputmode="decimal" value="${base != null ? fmt(base) : ''}" placeholder="e.g. ${u === 'kg' ? 100 : 225}"></label>
      ${best ? `<div class="chips">
        ${startKg != null ? `<button class="chip${base === S.toDisplay(startKg) ? ' active' : ''}" data-base="${S.toDisplay(startKg)}">Today ${fmtW(startKg)}</button>` : ''}
        <button class="chip${base === S.toDisplay(best.v) ? ' active' : ''}" data-base="${S.toDisplay(best.v)}">Best e1RM ${fmtW(best.v)}</button>
      </div>` : ''}
      ${base ? `
        <h3 class="wm-h">Warm-up ramp</h3>
        <ul class="list wm-table">${ramp.map((r) => `<li class="list-row" data-goto="${r.w}"><span class="grow">${r.label}</span><span class="mono">${fmt(r.w)} ${u} × ${r.reps}</span></li>`).join('')}</ul>
        ${entry ? '<button class="btn ghost block" data-wm="add-warmups">Add these as warm-up sets</button>' : ''}
        <h3 class="wm-h">Percent of ${fmt(base)} ${u}</h3>
        <ul class="list wm-table">${[50, 60, 70, 75, 80, 85, 90, 95, 100].map((pc) => {
          const w = loadable((base * pc) / 100);
          return `<li class="list-row" data-goto="${w}"><span class="grow">${pc}%</span><span class="mono">${fmt(w)} ${u}</span></li>`;
        }).join('')}</ul>
        <p class="muted small">${plateLoaded || !ex ? 'Rounded to what your bar and plates can make. Tap a row to see the plates.' : `Rounded to ${fmt(step())} ${u} jumps.`}</p>` : '<p class="muted">Enter a weight to see a warm-up ramp and percentages.</p>'}`;
  };

  const viewConvert = () => `
    <div class="two-col">
      <label class="field"><span class="field-label">lb</span><input id="wm-lb" class="num" inputmode="decimal" value="${st.conv != null ? fmt(u === 'lb' ? st.conv : st.conv * LB_PER_KG) : ''}"></label>
      <label class="field"><span class="field-label">kg</span><input id="wm-kg" class="num" inputmode="decimal" value="${st.conv != null ? fmt(u === 'kg' ? st.conv : st.conv / LB_PER_KG) : ''}"></label>
    </div>
    <p class="muted small">Handy when a machine or dumbbell rack is marked in the other unit.</p>`;

  const warmups = (work) => {
    const out = [];
    const bar = plateLoaded || !ex ? st.bar : 0;
    if (bar > 0 && work > bar * 1.3) out.push({ label: 'Empty bar', w: bar, reps: 10 });
    for (const [pc, reps] of [[40, 8], [60, 5], [80, 3]]) {
      const w = loadable((work * pc) / 100);
      if (w > (out[out.length - 1]?.w ?? 0) && w < work) out.push({ label: `${pc}%`, w, reps });
    }
    return out;
  };

  const draw = (sh) => {
    $('#wm-body', sh).innerHTML = st.tab === 'plates' ? viewPlates() : st.tab === 'percent' ? viewPercent() : viewConvert();
    $$('.seg button', sh).forEach((b) => b.classList.toggle('active', b.dataset.tab === st.tab));
  };

  const applyToEntry = (displayW) => {
    const kg = S.fromDisplay(displayW);
    let n = 0;
    for (const s of entry.sets) if (!s.done && !s.warmup) { s.w = kg; n++; }
    if (!n) { entry.sets.push({ w: kg, r: null, done: false }); n = 1; }
    save(); onApply?.();
    toast(n > 1 ? `Filled in ${fmt(displayW)} ${u} for your next ${n} sets.` : `Filled in ${fmt(displayW)} ${u} for your next set.`);
  };

  openSheet(`
    <div class="wm-head">
      <h2 class="sheet-title">Weight math</h2>
      ${ex ? `<span class="muted small">${esc(ex.name)} · ${esc(EQUIPMENT[equipment] || '')}</span>` : ''}
    </div>
    <div class="seg wm-tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-tab="${k}">${l}</button>`).join('')}</div>
    <div id="wm-body"></div>`, {
    tall: true,
    onMount: (sh) => {
      draw(sh);
      sh.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value.replace(',', '.'));
        if (e.target.id === 'wm-target') {
          st.target = isNaN(v) ? null : v; fromTarget();
          // Redraw everything except the field being typed in.
          const pos = e.target.selectionStart;
          draw(sh); const inp = $('#wm-target', sh); inp.focus(); inp.setSelectionRange(pos, pos);
        } else if (e.target.id === 'wm-base') {
          st.base = isNaN(v) ? null : v;
          const pos = e.target.selectionStart;
          draw(sh); const inp = $('#wm-base', sh); inp.focus(); inp.setSelectionRange(pos, pos);
        } else if (e.target.id === 'wm-lb' || e.target.id === 'wm-kg') {
          const other = e.target.id === 'wm-lb' ? $('#wm-kg', sh) : $('#wm-lb', sh);
          other.value = isNaN(v) ? '' : fmt(e.target.id === 'wm-lb' ? v / LB_PER_KG : v * LB_PER_KG);
        }
      });
      sh.addEventListener('click', (e) => {
        const t = e.target.closest('button, [data-goto]');
        if (!t) return;
        if (t.dataset.tab) { st.tab = t.dataset.tab; return draw(sh); }
        if (t.dataset.bar != null) {
          st.bar = +t.dataset.bar;
          if (ex) { ex.bar = { ...(ex.bar || {}), [u]: st.bar }; save(); }
          if (st.target != null) fromTarget();
          return draw(sh);
        }
        if (t.dataset.add) { st.side.push(+t.dataset.add); st.side.sort((a, b) => b - a); st.target = total(); st.missing = 0; navigator.vibrate?.(8); return draw(sh); }
        if (t.dataset.remove != null) { st.side.splice(+t.dataset.remove, 1); st.target = total(); st.missing = 0; return draw(sh); }
        if (t.dataset.inv) {
          const p = +t.dataset.inv, inv = settings.plates[u];
          settings.plates[u] = inv.includes(p) ? inv.filter((x) => x !== p) : [...inv, p].sort((a, b) => b - a);
          if (!settings.plates[u].length) settings.plates[u] = [p];
          save(); if (st.target != null) fromTarget(); return draw(sh);
        }
        if (t.dataset.base) { st.base = +t.dataset.base; return draw(sh); }
        if (t.dataset.goto) { st.tab = 'plates'; st.target = +t.dataset.goto; fromTarget(); return draw(sh); }
        const a = t.dataset.wm;
        if (a === 'minus' || a === 'plus') {
          const cur = st.target ?? total();
          st.target = Math.max(st.bar, loadable(cur) + (a === 'plus' ? step() : -step()));
          fromTarget(); return draw(sh);
        }
        if (a === 'edit-plates') { st.editPlates = !st.editPlates; return draw(sh); }
        if (a === 'use') return applyToEntry(total());
        if (a === 'add-warmups') {
          const ramp = warmups(st.base);
          entry.sets = [...ramp.map((r) => ({ w: S.fromDisplay(r.w), r: r.reps, done: false, warmup: true })), ...entry.sets.filter((s) => !(s.warmup && !s.done))];
          save(); onApply?.(); toast(`Added ${ramp.length} warm-up set${ramp.length > 1 ? 's' : ''}.`);
        }
      });
    },
  });
}
