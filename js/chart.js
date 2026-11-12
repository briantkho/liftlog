// Single-series line chart in SVG with a crosshair tooltip.
import { esc } from './ui.js';

export function lineChart(el, points, { fmt = (v) => v, label = '' } = {}) {
  if (points.length < 2) {
    el.innerHTML = `<div class="chart-empty">Log this ${points.length ? 'one more time' : 'a couple of times'} to see a trend.</div>`;
    return;
  }
  const W = 340, H = 180, pad = { l: 40, r: 12, t: 12, b: 26 };
  const xs = points.map((p) => p.t), ys = points.map((p) => p.v);
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x0 === x1) { x0 -= 864e5; x1 += 864e5; }
  let lo = Math.min(...ys), hi = Math.max(...ys);
  const span = hi - lo || hi * 0.1 || 1;
  lo -= span * 0.15; hi += span * 0.15;
  const ticks = niceTicks(lo, hi, 4);
  lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);

  const X = (t) => pad.l + ((t - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join('');
  const area = `${path}L${X(xs[xs.length - 1]).toFixed(1)},${H - pad.b}L${X(xs[0]).toFixed(1)},${H - pad.b}Z`;
  const dateTicks = [points[0], points[Math.floor((points.length - 1) / 2)], points[points.length - 1]]
    .filter((p, i, a) => a.indexOf(p) === i);
  const showDots = points.length <= 24;

  el.innerHTML = `
    <div class="chart-wrap">
      <svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(label)}">
        ${ticks.map((v) => `
          <line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/>
          <text x="${pad.l - 6}" y="${Y(v) + 3.5}" class="axis" text-anchor="end">${esc(fmt(v))}</text>`).join('')}
        ${dateTicks.map((p, i) => `<text x="${X(p.t)}" y="${H - 8}" class="axis" text-anchor="${i === 0 ? 'start' : i === dateTicks.length - 1 ? 'end' : 'middle'}">${new Date(p.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</text>`).join('')}
        <path d="${area}" class="area"/>
        <path d="${path}" class="line"/>
        ${showDots ? points.map((p) => `<circle cx="${X(p.t)}" cy="${Y(p.v)}" r="3.5" class="dot"/>`).join('') : ''}
        <line class="cross" y1="${pad.t}" y2="${H - pad.b}" x1="0" x2="0" visibility="hidden"/>
        <circle class="hover-dot" r="5" visibility="hidden"/>
        <rect x="${pad.l}" y="0" width="${W - pad.l - pad.r}" height="${H}" fill="transparent" class="hit"/>
      </svg>
      <div class="chart-tip" hidden></div>
    </div>`;

  const svg = el.querySelector('svg'), tip = el.querySelector('.chart-tip');
  const cross = svg.querySelector('.cross'), hd = svg.querySelector('.hover-dot');
  const move = (clientX) => {
    const r = svg.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * W;
    let best = points[0], bd = Infinity;
    for (const p of points) { const d = Math.abs(X(p.t) - sx); if (d < bd) { bd = d; best = p; } }
    const px = X(best.t), py = Y(best.v);
    cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
    hd.setAttribute('cx', px); hd.setAttribute('cy', py); hd.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.innerHTML = `<strong>${esc(fmt(best.v))}</strong><span>${esc(best.label || '')}</span><span class="muted">${new Date(best.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>`;
    const left = (px / W) * r.width;
    tip.style.left = `${Math.min(Math.max(left, 70), r.width - 70)}px`;
  };
  const leave = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); hd.setAttribute('visibility', 'hidden'); };
  svg.addEventListener('pointermove', (e) => move(e.clientX));
  svg.addEventListener('pointerdown', (e) => move(e.clientX));
  svg.addEventListener('pointerleave', leave);
}

function niceTicks(lo, hi, n) {
  const raw = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.01; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}
