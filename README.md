# Liftlog

A workout tracker that remembers your weights so you don't have to. Open it at the gym, tap start, and every exercise already shows what you lifted last time and what to lift today.

It's a PWA: install it to your home screen and it runs full screen and offline. No account, no server. Data lives on your phone.

## What it does

- **Remembers every weight.** Each exercise shows your last session ("135 lb × 12, 12, 11") and a "Previous" column per set.
- **Tells you what to lift next.** Double progression: stay at a weight until you hit the top of the rep range on every set, then it suggests adding the jump (default 5 lb / 2.5 kg, adjustable per exercise). Suggested numbers sit in the inputs as placeholders, so if you hit them you just tap the check.
- **PRs.** Heaviest weight, best estimated 1RM (Epley), most reps. You get a badge the moment a set beats your history, and a list at the end of the workout.
- **Consistency.** Weekly goal ring, week streak, 16 week calendar, days since your last session, and a nudge on the home screen when the week is getting away from you.
- **Routines that rotate.** Save your workouts (or start from a full body, upper/lower or push/pull/legs plan). The home screen shows what's next in the rotation and the weights you'll use.
- **Gym stuff.** Rest timer that starts when you check off a set (beeps and vibrates where supported), warm-up sets that don't count toward PRs, plate calculator, lb or kg.
- **History.** Every session, editable after the fact. Forgot to log yesterday? "Log past" lets you backfill it.
- **Charts** per exercise: e1RM, top set, reps, volume.
- **Backups.** Export JSON (full restore) or CSV (for a spreadsheet). Import a JSON backup on a new phone.

## Install on your phone

1. Open the GitHub Pages URL in Safari (iPhone) or Chrome (Android).
2. iPhone: Share, then Add to Home Screen. Android: menu, then Install app.

Install it before you log much. On iPhone, Safari can clear storage for sites you haven't visited in a while, but home screen apps are exempt. Export a backup now and then regardless.

## Deploy to GitHub Pages

No build step. It's plain HTML, CSS and ES modules.

1. Push this repo to GitHub.
2. Repo Settings, Pages, Source: **Deploy from a branch**, Branch: `main`, folder `/ (root)`.
3. It'll be live at `https://<your-username>.github.io/<repo-name>/` within a minute or two.

All paths are relative, so it works under any repo name.

## Shipping changes

The service worker serves the app offline. It fetches fresh files when online, but bump `VERSION` in `sw.js` when you change files so old caches get cleared. After an update the app shows "Update ready", and reopening it picks up the new version.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Code map

| File | What's in it |
| --- | --- |
| `js/store.js` | State, localStorage persistence, unit conversion, PR detection, progression suggestions, streaks, import/export |
| `js/app.js` | Router and every screen (home, workout, history, progress, routines, settings), rest timer |
| `js/seed.js` | Starter exercise library and plans |
| `js/chart.js` | SVG line chart with hover/tap tooltip |
| `js/ui.js` | DOM helpers, bottom sheets, toasts, rest timer beep |
| `sw.js` | Offline cache |

Weights are stored in kg internally and converted for display, so switching units never corrupts history.
