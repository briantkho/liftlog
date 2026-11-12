// Measures the real app height and exposes it as --app-h.
//
// iPhone home screen apps with viewport-fit=cover and a black-translucent status bar
// report 100%, 100dvh, innerHeight and fixed bottom: 0 about one status bar short of the
// real screen (59pt on Dynamic Island phones), while still drawing to the bottom edge.
// That leaves a dead band under anything pinned to the bottom. In that mode the app
// always fills the whole screen, so screen height is the true app height.

const isIPhone = /iPhone|iPod/.test(navigator.userAgent);
const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

export const viewportInfo = { screen: 0, inner: 0, fixed: 0, used: 0, patched: false };

function measure() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;bottom:0;left:0;width:1px;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const fixed = probe.getBoundingClientRect().height;
  probe.remove();

  const inner = window.innerHeight;
  let used = Math.max(fixed, inner);
  let patched = false;
  const portrait = matchMedia('(orientation: portrait)').matches;
  const full = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);

  if (isIPhone && standalone() && full > used && full - used <= 120) {
    used = full;
    patched = true;
  }
  Object.assign(viewportInfo, { screen: full, inner, fixed: Math.round(fixed), used, patched });
  document.documentElement.style.setProperty('--app-h', `${used}px`);
}

export function watchViewport() {
  measure();
  for (const ev of ['resize', 'orientationchange', 'pageshow']) window.addEventListener(ev, () => requestAnimationFrame(measure));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) requestAnimationFrame(measure); });
  window.visualViewport?.addEventListener('resize', () => requestAnimationFrame(measure));
  // iOS sometimes settles the viewport a moment after launch.
  setTimeout(measure, 500);
  setTimeout(measure, 1500);
}
