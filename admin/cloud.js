/* Firebase（ログイン＋データの共有）。設定が空のときは何もしません。 */
(function () {
  "use strict";
  var cfg = window.TSUKA_FIREBASE;
  if (!cfg || !cfg.apiKey) { window.TsukaCloud = { enabled: false }; return; }

  var base = "https://www.gstatic.com/firebasejs/10.12.2/";
  var ready = Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]).then(function (m) {
    var app = m[0].initializeApp(cfg);
    return { A: m[1], F: m[2], auth: m[1].getAuth(app), db: m[2].getFirestore(app) };
  });
  var ref = function (c, mod) { return c.F.doc(c.db, "teams", "tsukapro", "modules", mod); };

  window.TsukaCloud = {
    enabled: true,
    onAuth: function (cb) { ready.then(function (c) { c.A.onAuthStateChanged(c.auth, cb); }, function () { cb(null, new Error("load")); }); },
    signIn: function (email, pass) { return ready.then(function (c) { return c.A.signInWithEmailAndPassword(c.auth, email, pass); }); },
    signOut: function () { return ready.then(function (c) { return c.A.signOut(c.auth); }); },
    // 変更があるたびに rows（配列）を渡す。まだ何も保存されていなければ null
    subscribe: function (mod, cb, err) {
      return ready.then(function (c) { return c.F.onSnapshot(ref(c, mod), function (s) { cb(s.exists() ? (s.data().rows || []) : null); }, err); });
    },
    save: function (mod, rows, who) {
      return ready.then(function (c) { return c.F.setDoc(ref(c, mod), { rows: rows, updatedAt: c.F.serverTimestamp(), updatedBy: who || "" }); });
    }
  };
})();
