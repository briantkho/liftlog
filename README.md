# Liftlog

A workout tracker that remembers your weights so you don't have to. Open it at the gym, tap start, and every exercise already shows what you lifted last time and what to lift today.

It's a PWA: install it to your home screen and it runs full screen and offline. Sign in with Google and your workouts sync to your account, so a new phone picks up right where the old one left off.

## What it does

- **Remembers every weight.** Each exercise shows your last session ("135 lb × 12, 12, 11") and a "Previous" column per set.
- **Tells you what to lift next.** Double progression: stay at a weight until you hit the top of the rep range on every set, then it suggests adding the jump (default 5 lb / 2.5 kg, adjustable per exercise). Suggested numbers sit in the inputs as placeholders, so if you hit them you just tap the check.
- **PRs.** Heaviest weight, best estimated 1RM (Epley), most reps. You get a badge the moment a set beats your history, and a list at the end of the workout.
- **Consistency.** Weekly goal ring, week streak, 16 week calendar, days since your last session, and a nudge on the home screen when the week is getting away from you.
- **Routines that rotate.** Save your workouts (or start from a full body, upper/lower or push/pull/legs plan). The home screen shows what's next in the rotation and the weights you'll use.
- **Weight math.** One tap from any exercise or the workout header: type a total to see the plates per side, or tap plates to build a load and see the total. Pick the bar (Olympic, EZ, none for plate-loaded machines) and which plates your gym has. Warm-up ramp and percentage table rounded to weights you can actually load, a button to drop those warm-ups into your workout, and lb/kg conversion.
- **Equipment-aware exercises.** Every exercise is tagged barbell, dumbbell, cable, machine, plate-loaded or bodyweight, so look-alikes like Cable fly and Pec deck stay separate with their own history and PRs.
- **Gym stuff.** Rest timer that starts when you check off a set (beeps and vibrates where supported), warm-up sets that don't count toward PRs, lb or kg.
- **History.** Every session, editable after the fact. Forgot to log yesterday? "Log past" lets you backfill it.
- **Charts** per exercise: e1RM, top set, reps, volume.
- **Google sign-in and cloud sync.** Workouts save to Firestore under your account. An offline copy stays on the device so you can log sets with no signal; changes upload when you reconnect.
- **Backups.** Export JSON (full restore) or CSV (for a spreadsheet).

## Install on your phone

1. Open the GitHub Pages URL in Safari (iPhone) or Chrome (Android).
2. iPhone: Share, then Add to Home Screen. Android: menu, then Install app.

Sign in once inside the installed app. On iPhone the home screen app has its own storage, separate from Safari.

## Deploy to GitHub Pages

No build step. It's plain HTML, CSS and ES modules.

1. Push this repo to GitHub.
2. Repo Settings, Pages, Source: **Deploy from a branch**, Branch: `main`, folder `/ (root)`.
3. It'll be live at `https://<your-username>.github.io/<repo-name>/` within a minute or two.

All paths are relative, so it works under any repo name.

## Accounts and sync (Firebase)

Auth and storage run on Firebase's free Spark plan. One-time setup:

1. Create a project at https://console.firebase.google.com (Analytics off).
2. Authentication: enable the **Google** provider. Under Settings, Authorized domains, add `briantkho.github.io`.
3. Firestore Database: create it in production mode, then paste `firestore.rules` from this repo into the Rules tab and publish. Each account can only read and write `users/{its uid}`.
4. Project settings, Your apps, Web: register an app and paste its `firebaseConfig` into `js/firebase-config.js`. Those values are public by design; the rules are what protect the data.

With `firebaseConfig = null` the app runs without accounts and keeps data in the browser only.

Data layout:

```
users/{uid}                 settings, exercises, routines, active workout
users/{uid}/workouts/{id}   one document per finished workout
```

The first time someone signs in, anything saved in that browser from before accounts existed is uploaded to their account and then removed from local storage. Signing out deletes the offline copy on that device.

### Testing against the emulators

```sh
npm i -g firebase-tools
firebase emulators:start --project demo-liftlog --only auth,firestore
python3 -m http.server 8000
# open http://localhost:8000/?emulator
```

In emulator mode, `window.__testSignIn('you@example.com')` signs in without a Google popup.

### Updating the Firebase SDK

`js/vendor/firebase.js` is a single-file bundle so the app needs no build step and works offline. To rebuild:

```sh
npm i firebase@<version> esbuild
npx esbuild js/vendor/firebase-entry.js --bundle --format=esm --minify --platform=browser --target=es2020 --outfile=js/vendor/firebase.js
```

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
| `js/store.js` | State, save hook, unit conversion, PR detection, progression suggestions, streaks, import/export |
| `js/sync.js` | Google sign-in, Firestore load, live sync and offline queueing |
| `js/firebase-config.js` | Your Firebase web config (null = no accounts) |
| `js/vendor/firebase.js` | Bundled Firebase SDK |
| `js/app.js` | Router, sign-in screen, every app screen, rest timer |
| `js/seed.js` | Starter exercise library and plans |
| `js/calc.js` | Weight math sheet: plates, warm-ups and percentages, lb/kg |
| `js/chart.js` | SVG line chart with hover/tap tooltip |
| `js/ui.js` | DOM helpers, bottom sheets, toasts, rest timer beep |
| `js/viewport.js` | Measures the real app height (works around the iOS home screen short-viewport bug) |
| `sw.js` | Offline cache |

Weights are stored in kg internally and converted for display, so switching units never corrupts history.
