# CheckCheck — Project Context

**Paste this file at the start of any new session so the assistant has full context.**
Last updated: 2026-08-12 · **Phases 0–4 complete. The app works on device.**

---

## 0a. Rollback points

`v1.0` marks the last state that was actually running on the phone and known
good. If something later goes wrong and you want out:

```bash
git checkout v1.0          # look at it / build from it
npm install && npm run sync
cd android && ./gradlew installDebug
git checkout main          # go back to current work
```

`git checkout v1.0` does not delete anything. It moves your working files to
that state; `git checkout main` returns you to the present.

To undo one merged change rather than jumping back wholesale, use
`git revert <commit>` — it creates a new commit undoing that one and keeps the
history honest. That's how the shared shopping list work was removed.

**Tag the next known-good state before starting anything risky:**

```bash
git tag -a v1.1 -m "what works in this one"
git push origin v1.1
```

**A tag only restores source.** Getting that build back onto the phone means
rebuilding (a few minutes). For an instant revert, keep a copy of the built
`.apk` somewhere outside the repo.

### Shared shopping lists — removed, not lost

Built and then reverted, deliberately. The code lives in git history and can be
brought back with `git revert` of the revert, or cherry-picked.

It was never active: the Firestore rules it needs were never published, and the
migration was lazy, so no data ever moved. If you pick it up again, the two
things to know are that it needs those rules published in the Firebase Console
first, and that it should be tested with a second account before being trusted
with real data.

---

## 0. Start here

**Where things stand:** CheckCheck is installed and working on the phone as a debug
build. Google Sign-In works, real data syncs, reminders fire with the app closed,
the icon and splash are correct, and the hardware back button behaves.

**Next up: Phase 5 — a signed release APK.** Currently the app is a *debug* build:
fine for you, but it's signed with a throwaway key and can't be sensibly given to
anyone else. Phase 5 produces a properly signed APK you can hand to family.

Phase 5, in order:

1. Android Studio → **Build → Generate Signed App Bundle / APK → APK**
2. Create a new keystore. Strong password.
3. **Back up the `.jks` file** to two places (not just the repo — it's gitignored
   for good reason). **Save the password and key alias in a password manager.**
   Lose either and you can never update this app on the Play Store, ever.
4. Build the release APK.
5. Get the **release** SHA-1: `cd android && ./gradlew signingReport` — it's a
   *different key* from debug, so it's a different fingerprint.
6. Add that release SHA-1 to Firebase Console alongside the debug one.
7. **Re-download `google-services.json`** into `android/app/` — it must contain
   both fingerprints, or sign-in works in debug and fails in release.
8. Install the release APK on the phone and verify sign-in still works.

Budget about 45 minutes. Step 7 is the one people skip; see §8 for the symptom.

**Before starting, confirm:** `git status` is clean and the `fix-16-reminder-sync`
PR was merged. If `git log --oneline -3` doesn't show "Reschedule reminders after
a Firestore pull", that work is unpushed.

---

## 1. What this project is

CheckCheck is a personal productivity app — work tasks, todos, shopping, chores, habits.
It is a vanilla HTML/CSS/JS web app (no framework, no bundler) that is **also** packaged as
an Android app using Capacitor.

Two deployment targets, one codebase:

| Target | Served from | Purpose |
|---|---|---|
| PWA | GitHub Pages, repo root | Fast iteration surface. Edit → push → refresh. |
| Android APK | Bundled inside the app | The real product. Offline-capable, has an icon. |

Firebase project: **`checkcheck-3d35f`**
Android package id: **`com.avadhani.checkcheck`** — permanent, do not change.
Build machine: **macOS**.

---

## 2. Non-obvious facts that will bite you

Read these before suggesting anything.

1. **The app uses the Firebase COMPAT SDK, not the modular one.**
   Code looks like `firebase.auth()`, `firebase.firestore()`, `_fbAuth.signInWithPopup(...)`.
   It does **not** use `import { getAuth } from 'firebase/auth'`. Any snippet written in
   modular v9+ style will not work here without translation.

2. **The Firebase SDK is self-hosted in `vendor/firebase/`, not loaded from gstatic.**
   A CDN script tag would leave the app dead on launch with no network — which defeats the
   whole point of bundling it into an APK. If you upgrade the `firebase` npm package,
   re-copy the three compat bundles: `npm run vendor:firebase`.

3. **There is no bundler and no build step for the web app.** Files are loaded with plain
   `<script src>` tags in dependency order. `js/platform.js` → firebase vendor bundles →
   `js/app.js` → `js/nlp.js`. Order matters; nlp.js depends on globals from app.js.

4. **`www/` is generated output. Never edit it.** It is wiped and rebuilt by
   `scripts/build-www.mjs` on every sync, and it is gitignored. Source of truth is the repo root.

5. **`js/app.js` is ~3800 lines and holds nearly everything** — state, storage, rendering,
   event handling. `js/firebase.js` is an empty leftover file. `js/render.js`, `js/ui.js`,
   `js/state.js` exist but are not loaded by `index.html`.

6. **The service worker is disabled on native.** Inside the APK the assets are already local;
   a service worker there is a second stale-cache layer and the single most likely cause of
   "I changed the code and nothing happened".

---

## 3. File layout

```
Checkcheck/
├─ index.html               ← app shell. Script load order lives here.
├─ manifest.json            ← PWA manifest (web only)
├─ sw.js                    ← service worker (web only; skipped on native)
├─ firestore.rules
├─ capacitor.config.json    ← appId, appName, webDir, plugin config
├─ package.json             ← npm scripts live here
├─ CONTEXT.md               ← this file
│
├─ css/
│   ├─ app.css              ← the only stylesheet index.html loads
│   ├─ native.css           ← native-only rules, all scoped to .cc-native
│   ├─ variables/layout/cards/mobile.css   ← not currently loaded
├─ js/
│   ├─ platform.js          ← Platform detection + AUTH BYPASS SWITCH (loads FIRST)
│   ├─ app.js               ← everything else
│   ├─ nlp.js               ← natural-language quick add (loads after app.js)
│   ├─ notify.js            ← local notification scheduling (native only)
│   ├─ native.js            ← back button, status bar, keyboard, splash (native only)
│   ├─ render.js  ui.js  state.js  firebase.js   ← not currently loaded
├─ assets/                  icons (generated by scripts/gen-icons.py)
├─ vendor/firebase/         ← Self-hosted firebase compat bundles (committed)
├─ scripts/
│   ├─ build-www.mjs        ← Copies root web files into www/
│   └─ gen-icons.py         ← Generates every launcher/splash/status icon
│
├─ www/                     ← GENERATED, gitignored. Do not edit.
├─ android/                 ← GENERATED by Capacitor. Mostly do not edit.
│   ├─ variables.gradle     ← EXCEPTION: hand-edited, see §6
│   └─ app/google-services.json   ← you add this manually, gitignored
└─ node_modules/            ← gitignored
```

---

## 4. Commands

Run from the repo root.

```bash
npm run build:www      # copy root web files → www/
npm run sync           # build:www + npx cap sync android   ← use this one
npm run android        # sync, then open Android Studio
npm run run:android    # sync, then build+install to connected device
```

**The rule that catches everyone twice:** editing a file at the repo root and pressing Run in
Android Studio does nothing. Android Studio builds from the *copied* files in
`android/app/src/main/assets/public/`. `npm run sync` is what copies them.

To prove which build is on the device: every build stamps a timestamp. Open Chrome on the
desktop → `chrome://inspect` → inspect the WebView → console shows `CheckCheck build <ISO time>`.

---

## 5. The auth bypass switch

In `js/platform.js`:

```js
window.CC_BYPASS_AUTH = false;
```

Set `true` → app skips the sign-in screen and boots straight to the UI on local data.
Nothing syncs to Firestore while it's on. A **red banner** appears at the top of the screen
so you can't ship it on by accident. It is also force-disabled on any public web host.

Use it to prove the Android toolchain works before debugging OAuth. Turn it off for Phase 2.

---

## 6. How Google Sign-In works on Android

Google blocks OAuth popups inside embedded WebViews, so `signInWithPopup` cannot work in the
APK. The native path instead:

```
User taps "Continue with Google"
   ↓
Capacitor plugin → native Google Sign-In SDK → account chooser
   ↓
returns an idToken            ← NATIVE layer is now authenticated
   ↓
firebase.auth.GoogleAuthProvider.credential(idToken)
   ↓
_fbAuth.signInWithCredential(cred)   ← JS layer now authenticated too
   ↓
onAuthStateChanged fires → app boots → Firestore reads succeed
```

**If you skip the last two steps, every Firestore read returns `permission-denied`,** because
Firestore in this app is the JS SDK and it knows nothing about the native session. This is the
single most common failure mode. The code lives in `signInNative()` in `js/app.js`.

Sign-out must also end **both** sessions, or the native SDK silently reuses the cached Google
account and you can never switch accounts.

`window.CC_NATIVE` decides which path runs. Web keeps the original popup/redirect flow untouched.

### Required Gradle config

`android/variables.gradle` has hand-added entries the auth plugin requires:

```gradle
rgcfaIncludeGoogle = true
rgcfaIncludeFacebook = false
```

Without them, Gradle sync fails with `Could not get unknown property 'rgcfaIncludeGoogle'`.
These are **not** regenerated by `cap sync` — but `variables.gradle` can be overwritten by a
Capacitor major upgrade, so re-check after one.

The `com.google.gms.google-services` Gradle plugin is already wired up in
`android/app/build.gradle` and applies itself automatically once `google-services.json` exists.
No further Gradle edits needed.

---

## 7. Manual steps that cannot be automated

These need a human in the Firebase Console / Android Studio.

- [ ] Android Studio → SDK Manager → install **Android SDK Platform 36**
- [ ] Get the debug SHA-1: Gradle panel → `android` → Tasks → android → **`signingReport`**
- [ ] Firebase Console → `checkcheck-3d35f` → Project Settings → **Add app → Android**
      package name `com.avadhani.checkcheck`, paste the debug SHA-1
- [ ] Download **`google-services.json`** → place at `android/app/google-services.json`
- [ ] Enable **Developer Options** and **USB debugging** on the phone
- [ ] Phase 5 only: get the **release** SHA-1 and add it to Firebase too — debug and release
      are different keys, and sign-in working in debug tells you nothing about release

---

## 7b. Notifications (Phase 4)

**Local, not push.** No server, no FCM. The phone's alarm manager holds dated
alarms; they fire with the app closed and survive a reboot.

**Opt-in per item.** Any chore, to-do, task or habit with a `reminderTime`
(`"HH:MM"`) set gets reminders. Blank means silent. That field syncs through
Firestore, so you can set reminders on your laptop and receive them on the phone.

**Why it reschedules constantly.** Android can't run your JavaScript while the
app is closed, so it can't evaluate "is this chore still due?" at 9am. Everything
must be decided up front. So on every launch, resume, and data write, `notify.js`
cancels all its alarms and rebuilds them from current data. That's what keeps a
reminder from firing for a chore you already ticked off.

**The trade-off:** reminders are scheduled 14 days ahead (7 for habits, since
they recur daily and would otherwise eat the alarm budget). Don't open the app
for two weeks and they run out until you next open it.

**Permission** is requested when you first tick a reminder box — never on first
launch, because a permission prompt before the user knows what it's for is the
fastest route to a permanent deny.

**To test delivery:** open `chrome://inspect`, then in the console run
`CCNotify.test()` and background the app. It fires in 10 seconds.
`CCNotify.buildSchedule()` shows what's currently planned.

The old web reminder loop (`setInterval` + `new Notification()`) still runs in
the browser but is disabled on native — running both would double every reminder.

---

## 7c. Icons

`python3 scripts/gen-icons.py` regenerates **everything** — launcher icons,
adaptive foregrounds, monochrome (themed) icons, splash screens at all densities,
status-bar icons, and the PWA icons in `assets/`. It draws the ✓✓ mark from the
same coordinates as the SVG in `index.html`, so the app icon can't drift from
the in-app logo.

Run it after any brand colour change, then `npm run sync`.

Note the status-bar icon must be a **white silhouette on transparent** — Android
discards the colour and keeps only the alpha. A coloured icon becomes a white blob.

---

## 8. Debugging

**Logcat** (Android Studio, bottom panel) is the native-side log — crashes, Gradle/runtime
errors, plugin failures. Filter by `Capacitor` or by the package name.

**chrome://inspect** on the desktop with the phone plugged in gives you the real DevTools
console for the WebView. This is where your `console.log` output goes. Use this first for
anything that looks like a JS problem.

| Symptom | Almost always |
|---|---|
| My change didn't appear | Forgot `npm run sync` |
| White screen on launch | JS error before render — check chrome://inspect console |
| Sign-in does nothing / "not secure" | Native path not taken; check `window.CC_NATIVE` |
| `permission-denied` on Firestore | Missing `signInWithCredential` JS handoff (§6) |
| Sign-in fails only on device | SHA-1 not in Firebase, or stale `google-services.json` |
| Works in debug, fails in release | Release SHA-1 not registered |
| Gradle "unknown property rgcfa..." | `variables.gradle` entries lost (§6) |
| No notifications arrive | Permission denied, or nothing has a `reminderTime` set |
| Notification icon is a white square | `smallIcon` must be a white-on-transparent silhouette (§7c) |
| Reminder fired for a done item | Schedule went stale — open the app, it rebuilds |
| First Gradle sync seems frozen | It isn't. 5–15 min. Do not cancel. |

---

## 9. Firestore data model

Unchanged from web. Per-user documents:

```
users/{uid}/data/{key}   →   { items: [...], updatedAt: <ms> }
```

where `key` is one of: `projects`, `tasks`, `chores`, `todos`, `shopping`, `habits`.
localStorage mirrors the same data under `cc_<key>`. Security rules are unchanged and
require nothing new for Android.

---

## 10. Phase status

| Phase | Status |
|---|---|
| 0 — Toolchain | ✅ Node, Android Studio, SDK 36, phone paired (SM-S931U) |
| 1 — First APK | ✅ Installed and launching on device |
| 2 — Google Sign-In | ✅ Native sign-in works, real data loads |
| 3 — Native polish | ✅ Back button, status bar, keyboard, splash, icons |
| 4 — Local notifications | ✅ Per-item opt-in reminders, verified firing on device |
| 5 — Signed release APK | ⬅ **next** — see §0 |
| 6 — Play Store | Deferred. 12 testers × 14 continuous days gate applies. |

### What was done on 2026-08-12

Everything above, in one session. Notable decisions and discoveries:

- **The app uses the Firebase compat SDK**, so all auth code is written in that
  style. Modular v9+ snippets need translating.
- **Firebase is vendored into `vendor/`** rather than loaded from gstatic. A CDN
  script tag would leave the APK dead on launch with no network.
- **`google-services.json` needed a second download.** The first one had no
  Android OAuth client because the SHA-1 hadn't been registered yet. Symptom
  would have been sign-in failing on device only.
- **Two bugs found and fixed after the app was "working":**
  - `fsPull()` bypassed `DB.set`, so reminders set on another device synced but
    were never scheduled on the phone.
  - `--` inside an XML comment broke `mergeDebugResources`.
- **Habits get a 7-day scheduling horizon** while everything else gets 14, because
  daily habits would otherwise consume the whole 60-alarm budget.

### Known limitations (accepted, not bugs)

- **Sync is pull-on-launch, push-on-change** — not live. Editing the same
  collection on two devices at once loses one side's changes, because each
  collection is written as one whole array. Fixable later with Firestore
  realtime listeners.
- **Reminders need the app opened** at least once between setting one and its
  fire time, and they run out after 14 days of not opening the app.
- **`js/firebase.js` is an empty leftover.** `render.js`, `ui.js`, `state.js`
  exist but aren't loaded by `index.html`.

---

## 11. Versions

Capacitor 8.5 · firebase (JS) 12.17 · @capacitor-firebase/authentication 8.3
compileSdk / targetSdk 36 · minSdk 24 · Gradle 8.14.3 · AGP 8.13 · Java 21

Java 21 is required by Capacitor 8 — use Android Studio's **bundled JDK**, don't fight it.

Play Store note: from **31 Aug 2026** new apps and updates must target Android 16 (API 36).
Already satisfied.
