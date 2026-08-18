/* ================================================================
   CheckCheck — share.js
   ----------------------------------------------------------------
   Shared shopping lists. Loads AFTER app.js.

   THE PROBLEM THIS SOLVES
   Everywhere else in CheckCheck, a collection is stored as ONE
   Firestore document containing the whole array. That is fine for one
   person: the occasional lost edit when two of your own devices write
   at once is rare enough to live with.

   It is not fine for two people. You tick "milk" off in the shop while
   your partner adds "jam" at home; both write the entire array; one
   write lands second and silently erases the other's change. Sharing
   would turn a rare annoyance into a weekly one, at exactly the moment
   the feature is meant to be useful.

   So a shared list is stored differently: ONE DOCUMENT PER ITEM.
   Two people editing different items never touch the same document,
   so there is nothing to clobber.

   HOW IT STAYS COMPATIBLE
   The rest of the app reads shopping items with DB.get('shopping').
   Rather than rewrite search, backup, the widget snapshot and the
   render path, a Firestore listener MIRRORS the shared items into that
   same local array. Reads are unchanged everywhere. Only writes are
   rerouted, through the small facade at the bottom of this file.

   MIGRATION IS LAZY
   None of this exists until you press Share. Until then the app
   behaves exactly as it did, and a bug in here cannot touch the data
   of anyone who never shared.
================================================================ */

(function () {
  'use strict';

  var LIST_KEY = 'cc_sharedListId';   // cached so the UI knows before the query returns
  var listId = null;
  var listData = null;
  var unsubItems = null;
  var unsubList = null;

  function store() { return (typeof _fbStore !== 'undefined') ? _fbStore : null; }
  function me() { return (typeof _fbUser !== 'undefined') ? _fbUser : null; }
  function listRef() { return store().collection('lists').doc(listId); }
  function itemsRef() { return listRef().collection('items'); }

  function isShared() { return !!listId; }

  /* Ambiguous characters removed: no O/0, I/1, so a code read aloud or
     copied off a screen can't be mistyped into someone else's list. */
  function makeCode() {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < 8; i++) {
      out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return out;
  }

  function shortName(user) {
    if (!user) return 'Someone';
    if (user.displayName) return user.displayName.split(' ')[0];
    return (user.email || 'Someone').split('@')[0];
  }

  /* ── Finding the list you're in ──────────────────────────────────
     No pointer document: query the lists you're a member of. The rules
     permit exactly this query and nothing broader, so it can't be used
     to discover lists you don't belong to. */
  function attach() {
    var user = me();
    if (!user || !store()) return Promise.resolve(false);

    return store().collection('lists')
      .where('memberIds', 'array-contains', user.uid)
      .limit(1)
      .get()
      .then(function (snap) {
        if (snap.empty) {
          detach();
          localStorage.removeItem(LIST_KEY);
          return false;
        }
        listId = snap.docs[0].id;
        listData = snap.docs[0].data();
        localStorage.setItem(LIST_KEY, listId);
        subscribe();
        return true;
      })
      .catch(function (e) {
        console.warn('[CheckCheck] could not look up shared list:', e);
        return false;
      });
  }

  function detach() {
    if (unsubItems) { unsubItems(); unsubItems = null; }
    if (unsubList) { unsubList(); unsubList = null; }
    listId = null;
    listData = null;
  }

  /* ── Live mirror ─────────────────────────────────────────────────
     This is what makes a shared list feel shared: changes made by the
     other person appear without reopening the app. Everywhere else in
     CheckCheck sync is pull-on-launch, which would be useless here. */
  function subscribe() {
    if (unsubItems) unsubItems();
    unsubItems = itemsRef().onSnapshot(function (snap) {
      var items = snap.docs.map(function (d) {
        var v = d.data() || {};
        return {
          id: d.id,
          title: v.title || '',
          done: !!v.done,
          createdAt: v.createdAt || 0,
          addedBy: v.addedBy || '',
          addedByName: v.addedByName || '',
        };
      });
      items.sort(function (a, b) { return a.createdAt - b.createdAt; });
      mirrorLocally(items);
    }, function (e) {
      console.warn('[CheckCheck] shared list listener failed:', e);
    });

    if (unsubList) unsubList();
    unsubList = listRef().onSnapshot(function (doc) {
      if (!doc.exists) {
        // Owner deleted the list. Keep whatever items we last saw so the
        // user isn't left staring at an empty screen with no explanation.
        detach();
        localStorage.removeItem(LIST_KEY);
        rerender();
        return;
      }
      listData = doc.data();
      var uid = me() && me().uid;
      if (uid && (listData.memberIds || []).indexOf(uid) === -1) {
        detach();                       // removed by the owner
        localStorage.removeItem(LIST_KEY);
      }
      rerender();
    }, function () {});
  }

  /* Writes straight to localStorage rather than through DB.set, because
     DB.set would push a whole-array copy up to users/{uid}/data/shopping
     and we'd have two competing sources of truth. The side effects that
     DB.set normally triggers still need to happen, so they're done here
     explicitly. */
  function mirrorLocally(items) {
    localStorage.setItem('cc_shopping', JSON.stringify(items));
    if (window.CCWidget && window.CCWidget.available) window.CCWidget.pushSoon();
    rerender();
  }

  function rerender() {
    try {
      if (typeof state !== 'undefined' && state.mode === 'personal' &&
          state.personalTab === 'shopping' && typeof renderShoppingPanel === 'function') {
        renderShoppingPanel();
      }
    } catch (e) { /* rendering is best-effort; never break the listener */ }
  }

  /* ── Start sharing ───────────────────────────────────────────────
     Moves the current local list into a shared list and returns the
     code. Everything is one batch so a half-migrated state can't exist. */
  function startSharing() {
    var user = me();
    if (!user) return Promise.reject(new Error('Sign in first'));
    if (isShared()) return Promise.resolve(listData.code);

    var code = makeCode();
    var ref = store().collection('lists').doc();
    var batch = store().batch();
    var members = {};
    members[user.uid] = { name: shortName(user), email: user.email || '', role: 'owner' };

    batch.set(ref, {
      name: 'Shopping',
      ownerUid: user.uid,
      memberIds: [user.uid],
      members: members,
      code: code,
      createdAt: Date.now(),
    });

    DB.get('shopping').forEach(function (i) {
      batch.set(ref.collection('items').doc(i.id), {
        title: i.title,
        done: !!i.done,
        createdAt: i.createdAt || Date.now(),
        addedBy: user.uid,
        addedByName: shortName(user),
      });
    });

    batch.set(store().collection('invites').doc(code), {
      listId: ref.id,
      ownerUid: user.uid,
      createdAt: Date.now(),
    });

    return batch.commit().then(function () {
      listId = ref.id;
      localStorage.setItem(LIST_KEY, listId);
      return attach().then(function () { return code; });
    });
  }

  /* ── Join with a code ────────────────────────────────────────────
     Two steps, in this order on purpose: become a member first, then
     merge your items in. The reverse order would try to write items
     into a list you don't yet belong to, which the rules refuse. */
  function join(code) {
    var user = me();
    if (!user) return Promise.reject(new Error('Sign in first'));
    code = String(code || '').trim().toUpperCase();
    if (!code) return Promise.reject(new Error('Enter a code'));

    return store().collection('invites').doc(code).get()
      .then(function (doc) {
        if (!doc.exists) throw new Error('No list found for that code');
        var targetId = doc.data().listId;
        var target = store().collection('lists').doc(targetId);

        var patch = {
          memberIds: firebase.firestore.FieldValue.arrayUnion(user.uid),
        };
        patch['members.' + user.uid] =
          { name: shortName(user), email: user.email || '', role: 'editor' };

        return target.update(patch).then(function () {
          // Merge, never replace — this is irreversible from their side.
          var mine = DB.get('shopping');
          if (!mine.length) return;
          var batch = store().batch();
          mine.forEach(function (i) {
            batch.set(target.collection('items').doc(i.id), {
              title: i.title,
              done: !!i.done,
              createdAt: i.createdAt || Date.now(),
              addedBy: user.uid,
              addedByName: shortName(user),
            });
          });
          return batch.commit();
        }).then(function () {
          listId = targetId;
          localStorage.setItem(LIST_KEY, listId);
          return attach();
        });
      });
  }

  /* ── Leaving ─────────────────────────────────────────────────────
     A member leaves. The items stay in the shared list; a copy is kept
     locally so they don't lose the list they were using a second ago. */
  function leave() {
    var user = me();
    if (!user || !isShared()) return Promise.resolve();

    var keep = DB.get('shopping').map(function (i) {
      return { id: i.id, title: i.title, done: !!i.done, createdAt: i.createdAt || Date.now() };
    });

    var patch = { memberIds: firebase.firestore.FieldValue.arrayRemove(user.uid) };
    patch['members.' + user.uid] = firebase.firestore.FieldValue.delete();

    return listRef().update(patch).then(function () {
      detach();
      localStorage.removeItem(LIST_KEY);
      DB.set('shopping', keep);         // back to the private, array-based path
      rerender();
    });
  }

  /* ── Owner stops sharing ─────────────────────────────────────────
     Deletes the list and its items, keeping a local copy for the owner.
     Everyone else's listener sees the deletion and falls back to their
     own local copy — nobody is left with an empty screen. */
  function stopSharing() {
    var user = me();
    if (!user || !isShared()) return Promise.resolve();
    if (listData.ownerUid !== user.uid) return leave();

    var keep = DB.get('shopping').map(function (i) {
      return { id: i.id, title: i.title, done: !!i.done, createdAt: i.createdAt || Date.now() };
    });
    var code = listData.code;

    return itemsRef().get().then(function (snap) {
      var batch = store().batch();
      snap.docs.forEach(function (d) { batch.delete(d.ref); });
      batch.delete(listRef());
      if (code) batch.delete(store().collection('invites').doc(code));
      return batch.commit();
    }).then(function () {
      detach();
      localStorage.removeItem(LIST_KEY);
      DB.set('shopping', keep);
      rerender();
    });
  }

  /* ── The write facade ────────────────────────────────────────────
     app.js calls these instead of DB directly for shopping. Each
     returns true if it handled the write, false to fall through to the
     ordinary local path. That keeps the solo code path untouched. */
  function addItem(title) {
    if (!isShared()) return false;
    var user = me();
    itemsRef().doc(uid()).set({
      title: title,
      done: false,
      createdAt: Date.now(),
      addedBy: user.uid,
      addedByName: shortName(user),
    }).catch(function (e) { console.warn('[CheckCheck] add failed:', e); });
    return true;
  }

  function toggleItem(id, done) {
    if (!isShared()) return false;
    // Only the done flag is written. Sending the whole item back would
    // reintroduce exactly the overwrite problem this design avoids.
    itemsRef().doc(id).update({
      done: !!done,
      doneBy: done ? (me() && me().uid) : null,
      updatedAt: Date.now(),
    }).catch(function (e) { console.warn('[CheckCheck] toggle failed:', e); });
    return true;
  }

  function removeItem(id) {
    if (!isShared()) return false;
    itemsRef().doc(id).delete()
      .catch(function (e) { console.warn('[CheckCheck] delete failed:', e); });
    return true;
  }

  function clearDone() {
    if (!isShared()) return false;
    var batch = store().batch();
    DB.get('shopping').forEach(function (i) {
      if (i.done) batch.delete(itemsRef().doc(i.id));
    });
    batch.commit().catch(function (e) { console.warn('[CheckCheck] clear failed:', e); });
    return true;
  }

  function members() {
    if (!isShared() || !listData) return [];
    var m = listData.members || {};
    return Object.keys(m).map(function (k) {
      return { uid: k, name: m[k].name, email: m[k].email, role: m[k].role };
    });
  }

  window.CCShare = {
    isShared: isShared,
    listId: function () { return listId; },
    code: function () { return listData && listData.code; },
    isOwner: function () { return !!(listData && me() && listData.ownerUid === me().uid); },
    members: members,
    attach: attach,
    detach: detach,
    startSharing: startSharing,
    join: join,
    leave: leave,
    stopSharing: stopSharing,
    // write facade
    addItem: addItem,
    toggleItem: toggleItem,
    removeItem: removeItem,
    clearDone: clearDone,
  };
})();
