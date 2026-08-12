/* ================================================================
   CheckCheck — native.js
   ----------------------------------------------------------------
   Everything that only makes sense inside the Android app:
   hardware back button, status bar, keyboard, splash screen.

   Loads AFTER app.js because it calls into its functions
   (closeModal, closeSearchTray, render, state, ...).

   On the web every line here is skipped — the whole file is wrapped
   in a CC_NATIVE check. The PWA is completely unaffected.
================================================================ */

(function () {
  'use strict';

  if (!window.CC_NATIVE) return;

  var P = (window.Capacitor && window.Capacitor.Plugins) || {};

  /* ── Status bar ──────────────────────────────────────────────────
     Your app's header is light, so the status bar icons must be dark
     to stay readable. Capacitor's naming is a trap here: Style.Light
     means "light CONTENT" (white icons). We want Style.Dark.        */
  if (P.StatusBar) {
    P.StatusBar.setStyle({ style: 'DARK' }).catch(noop);
    // Capacitor 8 draws edge-to-edge, so a background colour would sit
    // under the content anyway. Overlay keeps the app in control.
    P.StatusBar.setOverlaysWebView({ overlay: false }).catch(noop);
    P.StatusBar.setBackgroundColor({ color: '#FFFFFF' }).catch(noop);
  }

  /* ── Keyboard ────────────────────────────────────────────────────
     Default Android behaviour resizes the whole window when the
     keyboard opens, which makes your add-item sheet jump and the
     header slide off screen. 'native' resizing keeps the layout
     stable and lets the focused input scroll into view instead.     */
  if (P.Keyboard) {
    P.Keyboard.setResizeMode({ mode: 'native' }).catch(noop);
    P.Keyboard.setScroll({ isDisabled: false }).catch(noop);

    // Tag the body while the keyboard is up, so CSS can react
    // (e.g. hiding a bottom bar that would otherwise sit on top of it).
    window.addEventListener('keyboardWillShow', function (e) {
      document.body.classList.add('keyboard-open');
      var h = (e && e.keyboardHeight) || 0;
      document.documentElement.style.setProperty('--keyboard-height', h + 'px');
    });
    window.addEventListener('keyboardWillHide', function () {
      document.body.classList.remove('keyboard-open');
      document.documentElement.style.setProperty('--keyboard-height', '0px');
    });
  }

  /* ── Splash screen ───────────────────────────────────────────────
     Hidden only once the app has actually rendered, so you never see
     a white gap between the splash and the UI. init() sets this flag. */
  function hideSplash() {
    if (P.SplashScreen) P.SplashScreen.hide().catch(noop);
  }
  // Belt and braces: hide on first paint, and force it after 3s in case
  // something upstream throws and we'd otherwise be stuck on the splash.
  requestAnimationFrame(function () { setTimeout(hideSplash, 150); });
  setTimeout(hideSplash, 3000);

  /* ── Hardware back button ────────────────────────────────────────
     Android's back button closes the app by default, which feels
     broken when a modal is open. This walks back through the UI one
     layer at a time, and only exits from the root view.

     Order matters: most transient thing first.                      */

  function isOpen(id) { return !!document.getElementById(id); }

  function handleBack() {
    // 1. Account dropdown
    var dd = document.getElementById('account-dropdown');
    if (dd) { dd.remove(); return true; }

    // 2. Modal (add/edit task, todo, chore, habit...)
    var backdrop = document.getElementById('modal-backdrop');
    if (backdrop && backdrop.classList.contains('open')) {
      if (typeof closeModal === 'function') closeModal();
      return true;
    }

    // 3. Slide-in trays
    if (isOpen('search-tray')) {
      if (typeof closeSearchTray === 'function') closeSearchTray();
      return true;
    }
    if (isOpen('inbox-tray')) {
      if (typeof closeInboxTray === 'function') closeInboxTray();
      return true;
    }

    // 4. Detail views — back out to the list they came from
    if (typeof state === 'undefined') return false;

    if (state.activeChore) { state.activeChore = null; render(); return true; }
    if (state.activeHabit) { state.activeHabit = null; render(); return true; }
    if (state.activeProject) { state.activeProject = null; render(); return true; }

    // 5. Reports → board
    if (state.mode === 'work' && state.workView === 'reports') {
      state.workView = 'board';
      render();
      return true;
    }

    // 6. Personal tabs → back to the todo tab, then to work
    if (state.mode === 'personal') {
      if (state.personalTab !== 'todo') {
        state.personalTab = 'todo';
        render();
        return true;
      }
      state.mode = 'work';
      render();
      return true;
    }

    // 7. Work board is home. Nothing left to close.
    return false;
  }

  /* Double-tap-to-exit. Closing an app on a single stray back press is
     jarring, and Android users expect this confirmation pattern.     */
  var exitArmed = false;
  var exitTimer = null;

  function armExit() {
    if (exitArmed) {
      if (P.App) P.App.exitApp();
      return;
    }
    exitArmed = true;
    toast('Press back again to exit');
    clearTimeout(exitTimer);
    exitTimer = setTimeout(function () { exitArmed = false; }, 2000);
  }

  if (P.App) {
    P.App.addListener('backButton', function () {
      var consumed = false;
      try {
        consumed = handleBack();
      } catch (e) {
        console.warn('[CheckCheck] back handler threw:', e);
      }
      if (!consumed) armExit();
      else { exitArmed = false; clearTimeout(exitTimer); }
    });

    /* ── Resume ──────────────────────────────────────────────────────
       Coming back to the app after hours (or days) means the data may
       be stale and any date-sensitive view is showing yesterday. Also
       the moment to reschedule notifications.                        */
    P.App.addListener('appStateChange', function (st) {
      if (!st || !st.isActive) return;
      if (typeof render === 'function') { try { render(); } catch (e) {} }
      if (window.CCNotify && CCNotify.rescheduleAll) CCNotify.rescheduleAll();
    });
  }

  /* Minimal toast. The app has no toast component, and pulling one in
     for a single string isn't worth it. */
  function toast(msg) {
    var existing = document.getElementById('cc-toast');
    if (existing) existing.remove();
    var el = document.createElement('div');
    el.id = 'cc-toast';
    el.textContent = msg;
    el.style.cssText =
      'position:fixed;left:50%;bottom:calc(32px + env(safe-area-inset-bottom));' +
      'transform:translateX(-50%);z-index:11000;background:rgba(15,23,42,.92);color:#fff;' +
      'font:500 .82rem/1.4 system-ui,sans-serif;padding:10px 18px;border-radius:99px;' +
      'pointer-events:none;opacity:0;transition:opacity .18s ease';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.style.opacity = '1'; });
    setTimeout(function () {
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 200);
    }, 1600);
  }

  window.CCToast = toast;

  function noop() {}
})();
