/* ================================================================
   CheckCheck — platform.js
   ----------------------------------------------------------------
   Loads BEFORE firebase and app.js. Two jobs:

     1. Tell the rest of the app whether it's running inside the
        Android APK or in a normal browser tab.
     2. Hold the Phase 1 auth bypass switch.

   Keep this file tiny and dependency-free. It runs first, so if it
   throws, nothing else loads.
================================================================ */

(function () {
  'use strict';

  // ── Platform detection ─────────────────────────────────────────
  // Capacitor injects a global `Capacitor` object into the WebView.
  // In a browser tab it simply doesn't exist.
  var cap = window.Capacitor;

  // isNativePlatform() exists in Capacitor 4+. The fallback covers
  // older/edge cases where only the platform string is available.
  var isNative = !!(cap && (
    (typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) ||
    (cap.platform && cap.platform !== 'web')
  ));

  window.CC_NATIVE   = isNative;
  window.CC_PLATFORM = isNative ? (cap.getPlatform ? cap.getPlatform() : cap.platform) : 'web';

  // Lets CSS target the app without any JS: see css/native.css.
  // Set on <html> because <body> may not exist yet depending on load order.
  if (isNative) document.documentElement.classList.add('cc-native');

  // ── PHASE 1 AUTH BYPASS ────────────────────────────────────────
  // Set to true and the app skips the Google sign-in screen entirely,
  // booting straight to the UI with whatever is in localStorage.
  // Nothing syncs to Firestore while this is on.
  //
  // Purpose: prove the Android toolchain works before fighting OAuth.
  // TURN THIS BACK TO false BEFORE PHASE 2. If you forget, the symptom
  // is "my data is empty on my phone" — because you're not signed in.
  //
  // A red banner appears at the top of the app whenever this is true,
  // so you can't ship a build with it on by accident.
  window.CC_BYPASS_AUTH = false;

  // Safety net: never allow the bypass on a real web deployment.
  // Localhost and the APK only.
  var host = location.hostname;
  var isLocalish = host === 'localhost' || host === '127.0.0.1' || host === '';
  if (window.CC_BYPASS_AUTH && !isNative && !isLocalish) {
    console.warn('[CheckCheck] Auth bypass ignored on a public host.');
    window.CC_BYPASS_AUTH = false;
  }

  console.log('[CheckCheck] platform=' + window.CC_PLATFORM +
              ' native=' + window.CC_NATIVE +
              ' bypassAuth=' + window.CC_BYPASS_AUTH);
})();
