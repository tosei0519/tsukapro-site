(function () {
  "use strict";

  /* ---------- 設定 ---------- */
  // 仮ログイン用。パスコード "tsukapro2026" のSHA-256。変更方法はREADMEを参照。
  var PASS_HASH = "d5cd231d6749f68983f47528a01ce4d3c6cebe71159aec9199d3752ffd684fda";
  var SESSION_KEY = "tsukapro-admin-session";

  var STATUS = ["未着手", "進行中", "完了"];

  // 画面ごとの項目。type: text | date | number | select | textarea
  var MODULES = {
    tasks: {
      label: "今やること", sub: "チームで今取り組むことを並べます。担当と期限を入れておくと迷いません。",
      fields: [
        { key: "title", label: "やること", type: "text", wide: true, required: true },
        { key: "owner", label: "担当", type: "text" },
        { key: "due", label: "期限", type: "date" },
        { key: "status", label: "状態", type: "select", options: STATUS, def: "未着手" }
      ],
      sort: function (a, b) { return STATUS.indexOf(a.status) - STATUS.indexOf(b.status) || (a.due || "9999").localeCompare(b.due || "9999"); },
      rowClass: function (r) { return r.status === "完了" ? "done" : ""; },
      empty: "まだありません。上のフォームから、最初のやることを追加してください。"
    },
    expenses: {
      label: "経費", sub: "内容と金額を入れると、合計と支払先・カテゴリ別の集計が自動で出ます。",
      fields: [
        { key: "date", label: "日付", type: "date", def: "today" },
        { key: "item", label: "内容", type: "text", wide: true, required: true },
        { key: "payee", label: "支払先", type: "text" },
        { key: "cat", label: "カテゴリ", type: "text" },
        { key: "amount", label: "金額（円）", type: "number" }
      ],
      sort: function (a, b) { return (a.date || "").localeCompare(b.date || "") || (a.created || 0) - (b.created || 0); },
      total: "amount",
      groups: [["payee", "支払先別"], ["cat", "カテゴリ別"]],
      importable: true,
      empty: "まだ記録がありません。上のフォームから最初の経費を追加してください。"
    },
    events: {
      label: "予定", sub: "大会や打ち合わせの日程をまとめます。",
      fields: [
        { key: "date", label: "日付", type: "date", def: "today" },
        { key: "title", label: "予定", type: "text", wide: true, required: true },
        { key: "place", label: "場所", type: "text" }
      ],
      sort: function (a, b) { return (a.date || "").localeCompare(b.date || ""); },
      empty: "まだ予定がありません。"
    },
    members: {
      label: "メンバー", sub: "チームの名簿です。連絡先などの個人情報は、公開リポジトリのデータには入れないでください。",
      fields: [
        { key: "name", label: "名前", type: "text", required: true },
        { key: "role", label: "役割", type: "text" },
        { key: "note", label: "メモ", type: "text", wide: true }
      ],
      sort: function (a, b) { return (a.created || 0) - (b.created || 0); },
      seed: [
        { name: "勝野 董成", role: "メンバー", note: "宇土高校1年" },
        { name: "中原 蒼介", role: "メンバー", note: "宇土高校1年" },
        { name: "上田 英雅", role: "メンバー", note: "宇土高校1年" },
        { name: "杉本 達應", role: "担当PM", note: "IPPO" }
      ],
      empty: "メンバーがいません。"
    },
    notes: {
      label: "メモ", sub: "決めたこと、アイデア、共有したいことを残します。",
      fields: [
        { key: "title", label: "タイトル", type: "text", wide: true, required: true },
        { key: "body", label: "内容", type: "textarea", wide: true }
      ],
      sort: function (a, b) { return (b.created || 0) - (a.created || 0); },
      empty: "まだメモがありません。"
    }
  };
  var ORDER = ["tasks", "expenses", "events", "members", "notes"];

  /* ---------- データの保存先 ----------
     今はこのブラウザの localStorage に保存します。
     チームで共有するときは、この4つの関数をFirebaseなどに差し替えます（READMEを参照）。 */
  var Cloud = window.TsukaCloud || { enabled: false };
  var cloudOn = false, userEmail = "", saveTimers = {};
  var Store = {
    load: function (mod) {
      try { var v = JSON.parse(localStorage.getItem("tsukapro-admin-" + mod)); if (v) return v; } catch (e) {}
      return seedRows(mod);
    },
    save: function (mod, rows) {
      if (!cloudOn) { try { localStorage.setItem("tsukapro-admin-" + mod, JSON.stringify(rows)); } catch (e) {} return; }
      // 入力のたびに送らず、手を止めて少ししてから1回だけ送る
      clearTimeout(saveTimers[mod]);
      setSync("保存中…");
      saveTimers[mod] = setTimeout(function () {
        Cloud.save(mod, rows, userEmail).then(function () { setSync("クラウドに保存済み"); }, function () { setSync("保存できませんでした"); toast("保存できませんでした。権限と通信を確認してください。"); });
      }, 600);
    }
  };
  function seedRows(mod) {
    var seed = MODULES[mod].seed;
    return seed ? seed.map(function (s, i) { return Object.assign({ id: uid(), created: Date.now() + i }, s); }) : [];
  }
  function setSync(t) { var e = document.getElementById("sync"); if (e) e.textContent = t; }

  /* ---------- 小さな道具 ---------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
  var yen = function (n) { return Number(n || 0).toLocaleString("ja-JP"); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); };
  var today = function () { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  var toNum = function (s) {
    var t = String(s).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 65248); }).replace(/[^\d\-]/g, "");
    var n = parseInt(t, 10); return isNaN(n) ? 0 : n;
  };
  var toastT;
  function toast(t) {
    var el = $(".toast"); if (el) el.remove();
    el = document.createElement("div"); el.className = "toast"; el.textContent = t; el.setAttribute("role", "status");
    document.body.appendChild(el); clearTimeout(toastT); toastT = setTimeout(function () { el.remove(); }, 2600);
  }

  var data = {};
  ORDER.forEach(function (m) { data[m] = Cloud.enabled ? [] : Store.load(m); });
  var current = "home";

  /* ---------- ログイン ---------- */
  function showApp() { $("#login").hidden = true; $("#app").hidden = false; buildMenu(); go(location.hash.slice(1) || "home"); }
  function showLogin() { $("#app").hidden = true; $("#login").hidden = false; }

  if (Cloud.enabled) {
    // 本物のログイン（Firebase）：メールアドレス＋パスワード
    $("#email-wrap").hidden = false; $("#email").required = true;
    $("#pass-label").textContent = "パスワード"; $("#demo-note").hidden = true;
    $("#login-form").autocomplete = "on";
    var pendingRender = false;
    Cloud.onAuth(function (user, err) {
      if (err) { var m = $("#login-err"); m.textContent = "ログインの部品を読み込めませんでした。通信を確認してください。"; m.hidden = false; return; }
      if (!user) { cloudOn = false; showLogin(); return; }
      cloudOn = true; userEmail = user.email || "";
      $("#who").textContent = userEmail;
      var side = document.querySelector(".side-foot");
      if (!$("#sync")) { var sp = document.createElement("span"); sp.id = "sync"; sp.className = "sync"; side.insertBefore(sp, side.firstChild); }
      ORDER.forEach(function (m) {
        data[m] = [];
        Cloud.subscribe(m, function (rows) { remoteIn(m, rows); setSync("クラウドと同期中"); },
          function () { toast("読み込めませんでした。このメールアドレスに権限があるか確認してください。"); setSync("読み込めません"); });
      });
      showApp();
    });
    $("#login-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var err = $("#login-err"); err.hidden = true;
      Cloud.signIn($("#email").value.trim(), $("#pass").value).then(function () { $("#pass").value = ""; }, function (ex) {
        var code = (ex && ex.code) || "";
        err.textContent = /invalid|wrong|user-not-found|credential/.test(code) ? "メールアドレスかパスワードが違います。" : /too-many/.test(code) ? "失敗が続いたので、少し待ってからやり直してください。" : "ログインできませんでした。（" + code + "）";
        err.hidden = false;
      });
    });
    $("#logout").addEventListener("click", function () { Cloud.signOut(); });
    // 他の人の変更を受け取る。入力中なら、手を止めたあとで画面を更新する
    var remoteIn = function (m, rows) {
      data[m] = rows || seedRows(m);
      buildMenuCounts();
      if (current !== m && current !== "home") return;
      if (isEditing()) { pendingRender = true; return; }
      go(current);
    };
    // 表のセルを編集中、または入力欄に書きかけがあるときは、画面の更新を待つ
    var isEditing = function () {
      var a = document.activeElement; if (!a || !$("#main").contains(a)) return false;
      if (!/INPUT|TEXTAREA|SELECT/.test(a.tagName)) return false;
      var rowsEl = $("#rows"), entry = $("#entry");
      return !!((rowsEl && rowsEl.contains(a)) || (entry && entry.contains(a) && a.value && a.type !== "date"));
    };
    var flush = function () { if (pendingRender && !isEditing()) { pendingRender = false; go(current); } };
    document.addEventListener("visibilitychange", flush); window.addEventListener("focus", flush);
    $("#main").addEventListener("focusout", function () { if (pendingRender) { pendingRender = false; setTimeout(function () { if (!isEditing()) go(current); }, 50); } });
  } else {
    // 仮ログイン（デモ）：パスコードをこのブラウザの中で確かめる
    var signedIn = false;
    try { signedIn = sessionStorage.getItem(SESSION_KEY) === "1"; } catch (e) {}
    if (signedIn) showApp();
    $("#login-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var err = $("#login-err");
      if (!window.crypto || !crypto.subtle) { err.textContent = "このブラウザではログインできません（HTTPSで開いてください）。"; err.hidden = false; return; }
      sha256($("#pass").value).then(function (h) {
        if (h === PASS_HASH) {
          try { sessionStorage.setItem(SESSION_KEY, "1"); } catch (x) {}
          err.hidden = true; $("#pass").value = ""; showApp();
        } else { err.textContent = "パスコードが違います。"; err.hidden = false; $("#pass").select(); }
      });
    });
    $("#logout").addEventListener("click", function () {
      try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
      showLogin(); $("#pass").focus();
    });
  }
  function sha256(text) {
    var enc = new TextEncoder().encode(text);
    return crypto.subtle.digest("SHA-256", enc).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    });
  }

  /* ---------- メニューと画面切り替え ---------- */
  function buildMenu() {
    var items = [["home", "概要", ""]].concat(ORDER.map(function (m) { return [m, MODULES[m].label, data[m].length]; }));
    $("#menu").innerHTML = items.map(function (it) {
      return '<button type="button" data-go="' + it[0] + '"' + (it[0] === current ? ' aria-current="page"' : "") + '>' +
        "<span>" + it[1] + '</span><span class="cnt">' + (it[2] === "" ? "" : it[2]) + "</span></button>";
    }).join("");
  }
  $("#menu").addEventListener("click", function (e) { var b = e.target.closest("[data-go]"); if (b) go(b.dataset.go); });

  function go(name) {
    if (name !== "home" && !MODULES[name]) name = "home";
    current = name;
    try { history.replaceState(null, "", "#" + name); } catch (e) {}
    buildMenu();
    if (name === "home") renderHome(); else renderModule(name);
  }

  /* ---------- 概要 ---------- */
  function renderHome() {
    var open = data.tasks.filter(function (t) { return t.status !== "完了"; });
    var month = today().slice(0, 7);
    var monthSum = data.expenses.filter(function (r) { return (r.date || "").slice(0, 7) === month; }).reduce(function (a, r) { return a + (r.amount || 0); }, 0);
    var total = data.expenses.reduce(function (a, r) { return a + (r.amount || 0); }, 0);
    var upcoming = data.events.filter(function (e) { return (e.date || "") >= today(); }).sort(MODULES.events.sort)[0];
    var tasks = open.slice().sort(MODULES.tasks.sort).slice(0, 6);

    $("#main").innerHTML =
      "<h2>概要</h2><p class=\"sub\">チームの今を、ひと目で。</p>" +
      '<div class="tiles">' +
      tile("tasks", "未完了のやること", open.length + "件", tasks[0] ? tasks[0].title : "なし") +
      tile("expenses", "今月の経費", "¥" + yen(monthSum), "合計 ¥" + yen(total)) +
      tile("events", "次の予定", upcoming ? upcoming.date.slice(5).replace("-", "/") : "—", upcoming ? upcoming.title : "予定なし") +
      tile("members", "メンバー", data.members.length + "人", "") +
      "</div>" +
      '<div class="panel"><h3>今やること</h3>' +
      (tasks.length ? tasks.map(function (t) {
        return '<div class="todo-line"><span class="when">' + esc(t.due ? t.due.slice(5).replace("-", "/") : "期限なし") + "</span><span>" + esc(t.title) +
          (t.owner ? ' <span style="color:var(--muted)">（' + esc(t.owner) + "）</span>" : "") + "</span></div>";
      }).join("") : '<p class="empty">未完了のやることはありません。</p>') + "</div>" +
      (cloudOn ? '<p class="banner">データはクラウドに保存されていて、ログインしたメンバー全員で共有されます。</p>' : '<p class="banner">データは今、このブラウザの中に保存されています。チームで共有するには、READMEの「管理者画面を本物にする」を見てください。</p>');
    $("#main").addEventListener("click", function h(e) {
      var t = e.target.closest("[data-go]"); if (t) { $("#main").removeEventListener("click", h); go(t.dataset.go); }
    });
  }
  function tile(mod, k, v, d) {
    return '<button class="tile" type="button" data-go="' + mod + '"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="d">' + esc(d) + "</div></button>";
  }

  /* ---------- 共通の表画面 ---------- */
  function persist(mod) { Store.save(mod, data[mod]); buildMenuCounts(); }
  function buildMenuCounts() {
    ORDER.forEach(function (m) {
      var b = $('#menu [data-go="' + m + '"] .cnt'); if (b) b.textContent = data[m].length;
    });
  }

  function inputHtml(f, v, inTable) {
    var common = ' data-k="' + f.key + '"';
    if (f.type === "select") {
      return "<select" + common + ">" + f.options.map(function (o) { return '<option' + (o === v ? " selected" : "") + ">" + o + "</option>"; }).join("") + "</select>";
    }
    if (f.type === "textarea") return "<textarea" + common + ">" + esc(v) + "</textarea>";
    if (f.type === "number") return '<input type="text" inputmode="numeric" class="num"' + common + ' value="' + (inTable ? yen(v) : "") + '">';
    return '<input type="' + f.type + '"' + common + ' value="' + esc(v) + '">';
  }

  function renderModule(mod) {
    var M = MODULES[mod], rows = data[mod];
    M.sort && rows.sort(M.sort);

    var form = '<form class="entry" id="entry" autocomplete="off">' + M.fields.map(function (f) {
      var def = f.def === "today" ? today() : (f.def || "");
      var inp;
      if (f.type === "select") inp = inputHtml(f, def, false);
      else if (f.type === "textarea") inp = '<textarea data-k="' + f.key + '"></textarea>';
      else if (f.type === "number") inp = '<input type="text" inputmode="numeric" class="num" data-k="' + f.key + '" placeholder="0">';
      else inp = '<input type="' + f.type + '" data-k="' + f.key + '" value="' + esc(def) + '"' + (f.required ? " required" : "") + ">";
      return '<label class="' + (f.wide ? "wide" : "") + '">' + f.label + inp + "</label>";
    }).join("") + '<button class="add" type="submit">追加</button></form>';

    var head = "<tr>" + M.fields.map(function (f) { return "<th" + (f.type === "number" ? ' style="text-align:right"' : "") + ">" + f.label + "</th>"; }).join("") + "<th></th></tr>";

    $("#main").innerHTML = "<h2>" + M.label + '</h2><p class="sub">' + M.sub + "</p>" + form +
      '<div id="chips"></div><div class="sheet"><table><thead>' + head + '</thead><tbody id="rows"></tbody><tfoot id="foot"></tfoot></table>' +
      '<p class="empty" id="empty" style="padding:16px" hidden>' + M.empty + "</p></div>" +
      '<div class="tools">' +
      (M.importable ? '<button class="ghost" id="import-btn" type="button">表から貼り付けて取り込む</button>' : "") +
      '<button class="ghost" id="copy" type="button">表をコピー（スプレッドシート用）</button>' +
      '<button class="ghost warn" id="clear" type="button">すべて削除</button></div>' +
      '<div id="import-box"></div>';

    drawRows(mod);

    $("#entry").addEventListener("submit", function (e) {
      e.preventDefault();
      var r = { id: uid(), created: Date.now() };
      M.fields.forEach(function (f) {
        var el = $('#entry [data-k="' + f.key + '"]');
        r[f.key] = f.type === "number" ? toNum(el.value) : el.value.trim();
      });
      rows.push(r); persist(mod); M.sort && rows.sort(M.sort); drawRows(mod);
      M.fields.forEach(function (f) {
        var el = $('#entry [data-k="' + f.key + '"]');
        if (f.type === "date" || f.type === "select") return; el.value = "";
      });
      var first = $('#entry [data-k="' + M.fields[0].key + '"]'); var focusEl = M.fields.filter(function (f) { return f.required; })[0];
      if (focusEl) $('#entry [data-k="' + focusEl.key + '"]').focus();
    });

    $("#rows").addEventListener("input", function (e) {
      var t = e.target, tr = t.closest("tr"); if (!tr || !t.dataset.k) return;
      var r = rows.filter(function (x) { return x.id === tr.dataset.id; })[0]; if (!r) return;
      var f = M.fields.filter(function (x) { return x.key === t.dataset.k; })[0];
      r[t.dataset.k] = f.type === "number" ? toNum(t.value) : t.value;
      Store.save(mod, rows);
      if (t.dataset.k === "status") tr.className = M.rowClass ? M.rowClass(r) : "";
      drawSummary(mod);
    });
    $("#rows").addEventListener("focusout", function (e) {
      var t = e.target; if (!t.classList || !t.classList.contains("num")) return;
      t.value = yen(toNum(t.value));
    });
    $("#rows").addEventListener("click", function (e) {
      if (!e.target.dataset.del) return;
      var id = e.target.closest("tr").dataset.id;
      data[mod] = rows = rows.filter(function (x) { return x.id !== id; });
      persist(mod); drawRows(mod);
    });

    $("#copy").addEventListener("click", function () {
      var tsv = [M.fields.map(function (f) { return f.label; }).join("\t")].concat(rows.map(function (r) {
        return M.fields.map(function (f) { return String(r[f.key] == null ? "" : r[f.key]).replace(/\s+/g, " "); }).join("\t");
      })).join("\n");
      var done = function () { toast("コピーしました。スプレッドシートに貼り付けてください。"); };
      var fb = function () { var ta = document.createElement("textarea"); ta.value = tsv; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (x) { toast("コピーできませんでした。"); } ta.remove(); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(tsv).then(done, fb); else fb();
    });

    var armed = false, armT;
    $("#clear").addEventListener("click", function () {
      var b = this;
      if (!armed) { armed = true; b.textContent = "本当に削除する（もう一度押す）"; armT = setTimeout(function () { armed = false; b.textContent = "すべて削除"; }, 4000); return; }
      clearTimeout(armT); data[mod] = rows = []; persist(mod); drawRows(mod); b.textContent = "すべて削除"; armed = false; toast("すべて削除しました。");
    });

    if (M.importable) $("#import-btn").addEventListener("click", function () {
      $("#import-box").innerHTML = '<p class="sub" style="margin-top:14px">日付・内容・支払先・カテゴリ・金額の順で、タブ区切りのまま貼り付けます（このサイトの「表をコピー」や、スプレッドシートからのコピーがそのまま使えます）。</p>' +
        '<textarea class="paste" id="paste" placeholder="2026-10-18&#9;はんだ一式購入&#9;ナフコ&#9;備品&#9;5388"></textarea>' +
        '<div class="tools"><button class="ghost" id="do-import" type="button">取り込む</button></div>';
      $("#paste").focus();
      $("#do-import").addEventListener("click", function () {
        var n = 0;
        $("#paste").value.split(/\r?\n/).forEach(function (line, i) {
          var c = line.split("\t"); if (c.length < 5 || !/^\d{4}-\d{2}-\d{2}$/.test(c[0].trim())) return;
          rows.push({ id: uid(), created: Date.now() + i, date: c[0].trim(), item: c[1].trim(), payee: c[2].trim(), cat: c[3].trim(), amount: toNum(c[4]) }); n++;
        });
        if (!n) { toast("取り込める行がありませんでした。列の順番と、日付の形式（2026-10-18）を確認してください。"); return; }
        persist(mod); M.sort && rows.sort(M.sort); drawRows(mod); $("#import-box").innerHTML = ""; toast(n + "件取り込みました。");
      });
    });
  }

  function drawRows(mod) {
    var M = MODULES[mod], rows = data[mod];
    $("#rows").innerHTML = rows.map(function (r) {
      return '<tr data-id="' + r.id + '" class="' + (M.rowClass ? M.rowClass(r) : "") + '">' +
        M.fields.map(function (f) { return "<td>" + inputHtml(f, r[f.key], true) + "</td>"; }).join("") +
        '<td class="del"><button class="x" type="button" data-del="1" aria-label="この行を削除">×</button></td></tr>';
    }).join("");
    $("#empty").hidden = rows.length > 0;
    drawSummary(mod);
  }

  function drawSummary(mod) {
    var M = MODULES[mod], rows = data[mod];
    if (M.total) {
      var sum = rows.reduce(function (a, r) { return a + (r[M.total] || 0); }, 0);
      $("#foot").innerHTML = '<tr><td colspan="' + (M.fields.length - 1) + '">合計（' + rows.length + '件）</td><td class="r">¥' + yen(sum) + "</td><td></td></tr>";
      $("#chips").innerHTML = (M.groups || []).map(function (g) {
        var by = {}, order = [];
        rows.forEach(function (r) { var k = r[g[0]] || "未入力"; if (!(k in by)) { by[k] = 0; order.push(k); } by[k] += r[M.total] || 0; });
        order.sort(function (a, b) { return by[b] - by[a]; });
        if (!order.length) return "";
        return '<p class="sub" style="margin:14px 0 6px">' + g[1] + '</p><div class="chips" style="margin-top:0">' +
          order.map(function (k) { return '<span class="chipx">' + esc(k) + "<b>¥" + yen(by[k]) + "</b></span>"; }).join("") + "</div>";
      }).join("");
    } else {
      $("#foot").innerHTML = "";
      $("#chips").innerHTML = "";
    }
  }
})();
