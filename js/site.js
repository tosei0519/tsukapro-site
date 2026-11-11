(function () {
  "use strict";
  var root = document.documentElement;
  var reduce = root.dataset.motion === "reduce";
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var hasIO = "IntersectionObserver" in window;

  /* ---- 動きの設定：フッターのボタンで「ふつう／少なめ」を切り替える ---- */
  var motionBtn = $("#motion-toggle");
  if (motionBtn) {
    motionBtn.textContent = "動き：" + (reduce ? "少なめ" : "ふつう");
    motionBtn.addEventListener("click", function () {
      try { localStorage.setItem("tsuka-motion", reduce ? "more" : "less"); } catch (e) {}
      location.reload();
    });
  }

  /* ---- メニュー（スマホ） ---- */
  var menuBtn = $("#menu-btn"), sheet = $("#sheet");
  function setMenu(open) {
    root.classList.toggle("menu-open", open);
    menuBtn.setAttribute("aria-expanded", open);
    menuBtn.setAttribute("aria-label", open ? "メニューを閉じる" : "メニューを開く");
    sheet.setAttribute("aria-hidden", !open);
  }
  if (menuBtn && sheet) {
    $$("a", sheet).forEach(function (a, i) { a.style.setProperty("--i", i); a.addEventListener("click", function () { setMenu(false); }); });
    menuBtn.addEventListener("click", function () { setMenu(!root.classList.contains("menu-open")); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });
    window.addEventListener("resize", function () { if (window.innerWidth > 900) setMenu(false); });
  }

  /* ---- 見出しを1行ずつに分ける（下からせり上がる動きのため） ---- */
  $$("[data-lines]").forEach(function (h) {
    h.innerHTML = h.innerHTML.split(/<br\s*\/?>/i).map(function (l) { return '<span class="ln"><span>' + l.trim() + "</span></span>"; }).join("");
  });

  /* ---- チーム：担当とひとことがあれば出す ---- */
  $$(".member").forEach(function (m) {
    if (m.dataset.role) $(".role", m).textContent = m.dataset.role;
    if (m.dataset.comment) { var c = document.createElement("p"); c.className = "comment"; c.textContent = m.dataset.comment; $(".who", m).appendChild(c); }
  });

  /* ---- スクロールで、ふわっと出す ---- */
  var revealEls = $$(".rise, [data-lines]");
  if (hasIO && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -7% 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---- 数字のカウントアップ ---- */
  var counters = $$("[data-count]");
  if (hasIO && !reduce) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target, to = +el.dataset.count, t0 = performance.now();
        (function tick(t) {
          var p = clamp((t - t0) / 1500, 0, 1);
          el.textContent = Math.round(to * (1 - Math.pow(1 - p, 4)));
          if (p < 1) requestAnimationFrame(tick);
        })(t0);
        cio.unobserve(el);
      });
    }, { threshold: 0.7 });
    counters.forEach(function (el) { el.textContent = "0"; cio.observe(el); });
  }

  /* ---- 文章が、スクロールに合わせて濃くなる ---- */
  var wordsEl = $("#words"), spans = [];
  if (wordsEl) {
    var chunks = wordsEl.textContent.trim().match(/[^、。\s]+[、。]?/g) || [];
    wordsEl.textContent = "";
    chunks.forEach(function (c) { var s = document.createElement("span"); s.textContent = c; wordsEl.appendChild(s); spans.push(s); });
  }

  /* ================= マス目とロボット ================= */
  var NAME = { F: "前へ", B: "後ろへ", R: "右をむく", L: "左をむく" };
  var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // 上・右・下・左
  var NS = "http://www.w3.org/2000/svg";

  function chip(k, tag) {
    var el = document.createElement(tag || "li");
    el.className = "blk"; el.dataset.k = k;
    el.innerHTML = '<svg aria-hidden="true"><use href="#i-' + k + '"/></svg><b>' + NAME[k] + "</b>";
    return el;
  }

  function Board(host, cfg) {
    var C = 100, cols = cfg.cols, rows = cfg.rows, walls = cfg.walls || [];
    var isWall = function (x, y) { return walls.some(function (w) { return w[0] === x && w[1] === y; }); };
    var h = '<svg viewBox="0 0 ' + cols * C + " " + rows * C + '" xmlns="' + NS + '">';
    for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
      if (isWall(x, y)) {
        h += '<rect class="wall" x="' + (x * C + 5) + '" y="' + (y * C + 5) + '" width="90" height="90" rx="18"/>';
        h += '<rect class="wall-top" x="' + (x * C + 5) + '" y="' + (y * C - 3) + '" width="90" height="88" rx="18"/>';
      } else {
        h += '<rect class="tile' + ((x + y) % 2 ? " alt" : "") + '" x="' + (x * C + 5) + '" y="' + (y * C + 5) + '" width="90" height="90" rx="18"/>';
      }
    }
    h += '<circle class="start-dot" cx="' + (cfg.start.x * C + 50) + '" cy="' + (cfg.start.y * C + 50) + '" r="12"/>';
    if (cfg.goal) {
      h += '<g transform="translate(' + (cfg.goal.x * C + 50) + " " + (cfg.goal.y * C + 50) + ')">' +
        '<circle class="goal-ring" r="30"/><path d="M-11 28V-27" stroke="#1d1d1f" stroke-width="6" stroke-linecap="round"/>' +
        '<path d="M-8 -26h32l-9 12 9 12h-32z" fill="#f7931e"/></g>';
    }
    h += '<polyline class="trail" points=""/>';
    h += '<g class="bot"><g transform="scale(1.22)">' +
      '<rect x="-26" y="-30" width="10" height="38" rx="4.5" fill="#22252b"/><rect x="16" y="-30" width="10" height="38" rx="4.5" fill="#22252b"/>' +
      '<rect x="-19" y="-27" width="38" height="56" rx="10" fill="#fff" stroke="#cfd6dd" stroke-width="1.5"/>' +
      '<rect x="-12" y="-23" width="24" height="7" rx="3.5" fill="#22252b"/><rect x="-10" y="6" width="20" height="16" rx="5" fill="#f7931e"/>' +
      "</g></g></svg>";
    host.innerHTML = h;
    var bot = $(".bot", host), trail = $(".trail", host);
    var st = {}, pts = [], token = 0;

    function draw() {
      bot.setAttribute("transform", "translate(" + (st.x * C + 50).toFixed(1) + " " + (st.y * C + 50).toFixed(1) + ") rotate(" + st.a.toFixed(1) + ")");
      trail.setAttribute("points", pts.concat([[st.x, st.y]]).map(function (p) { return (p[0] * C + 50).toFixed(1) + "," + (p[1] * C + 50).toFixed(1); }).join(" "));
    }
    function reset() {
      token++;
      st = { x: cfg.start.x, y: cfg.start.y, d: cfg.start.d, a: cfg.start.d * 90 };
      pts = [[st.x, st.y]]; draw();
    }
    function tween(ms, fn, my) {
      return new Promise(function (res) {
        var t0 = performance.now();
        (function f(t) {
          if (my !== token) return res(false);
          var p = clamp((t - t0) / ms, 0, 1), e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
          fn(e); draw();
          if (p < 1) requestAnimationFrame(f); else res(true);
        })(t0);
      });
    }
    // 1つの命令を進める。ぶつかるときは null を返す
    function next(c) {
      if (c === "R" || c === "L") return { turn: c === "R" ? 1 : -1 };
      var s = c === "F" ? 1 : -1, v = DIRS[st.d], nx = st.x + v[0] * s, ny = st.y + v[1] * s;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || isWall(nx, ny)) return { hit: [v[0] * s, v[1] * s] };
      return { to: [nx, ny] };
    }
    function atGoal() { return !!cfg.goal && Math.round(st.x) === cfg.goal.x && Math.round(st.y) === cfg.goal.y; }

    async function run(cmds, onStep, speed) {
      reset();
      var my = token, k = speed || 1;
      await sleep(250 * k);
      for (var i = 0; i < cmds.length; i++) {
        if (my !== token) return { cancelled: true };
        if (onStep) onStep(i);
        var n = next(cmds[i]), x0 = st.x, y0 = st.y, a0 = st.a;
        if (n.turn) {
          await tween(420 * k, function (e) { st.a = a0 + 90 * n.turn * e; }, my);
          st.d = (st.d + n.turn + 4) % 4;
        } else if (n.hit) {
          await tween(170, function (e) { st.x = x0 + n.hit[0] * .2 * e; st.y = y0 + n.hit[1] * .2 * e; }, my);
          await tween(260, function (e) { st.x = x0 + n.hit[0] * .2 * (1 - e); st.y = y0 + n.hit[1] * .2 * (1 - e); }, my);
          return my === token ? { ok: false, hit: true, at: i } : { cancelled: true };
        } else {
          await tween(520 * k, function (e) { st.x = x0 + (n.to[0] - x0) * e; st.y = y0 + (n.to[1] - y0) * e; }, my);
          if (my === token) pts.push([st.x, st.y]);
        }
        await sleep(90 * k);
      }
      if (my !== token) return { cancelled: true };
      if (onStep) onStep(cmds.length);
      return { ok: atGoal() };
    }
    // 動きなしで、最後の姿だけを出す
    function jump(cmds) {
      reset();
      cmds.forEach(function (c) {
        var n = next(c);
        if (n.turn) { st.d = (st.d + n.turn + 4) % 4; st.a += 90 * n.turn; }
        else if (n.to) { st.x = n.to[0]; st.y = n.to[1]; pts.push([st.x, st.y]); }
      });
      draw();
    }
    reset();
    return { run: run, reset: reset, jump: jump };
  }

  function mark(list, i) {
    $$(".blk", list).forEach(function (b, k) { b.classList.toggle("now", k === i); b.classList.toggle("did", k < i); });
  }
  // 画面に見えているあいだだけ true
  function watch(el) {
    var s = { on: !hasIO };
    if (hasIO) new IntersectionObserver(function (en) { s.on = en[0].isIntersecting; }, { threshold: 0.25 }).observe(el);
    return s;
  }

  /* ---- ヒーロー：ブロックが並んで、ロボットが走る（くり返し） ---- */
  (function () {
    var host = $("#hero-board"), chain = $("#hero-chain"), done = $("#hero-done");
    if (!host || !chain) return;
    var prog = ["F", "F", "L", "F", "R", "F", "F"];
    var board = Board(host, { cols: 6, rows: 3, start: { x: 0, y: 2, d: 1 }, goal: { x: 4, y: 1 }, walls: [[3, 2], [5, 0], [1, 0]] });
    if (reduce) { prog.forEach(function (k) { chain.appendChild(chip(k)); }); board.jump(prog); return; }
    var seen = watch($("#hero-demo"));
    (async function loop() {
      await sleep(1200);
      for (;;) {
        while (!seen.on || document.hidden) await sleep(400);
        chain.innerHTML = ""; chain.classList.remove("running"); done.classList.remove("show"); board.reset();
        for (var i = 0; i < prog.length; i++) { chain.appendChild(chip(prog[i])); await sleep(230); }
        await sleep(500);
        chain.classList.add("running");
        await board.run(prog, function (k) { mark(chain, k); });
        done.classList.add("show");
        await sleep(2400);
        done.classList.remove("show");
        await sleep(500);
      }
    })();
  })();

  /* ---- しくみ：説明に合わせて、左の絵を切り替える ---- */
  (function () {
    var visual = $("#how-visual"), steps = $$("#steps .step"), host = $("#how-board");
    if (!visual || !steps.length) return;
    var prog = ["F", "R", "F", "L"], cur = 1, running = false;
    var board = host ? Board(host, { cols: 3, rows: 2, start: { x: 0, y: 1, d: 0 } }) : null;
    async function play() {
      if (running || !board) return; running = true;
      while (cur === 3) { await board.run(prog, null, 1.1); await sleep(1400); }
      running = false;
    }
    function set(n) {
      cur = n; visual.dataset.step = n;
      steps.forEach(function (s) { s.classList.toggle("active", +s.dataset.step === n); });
      if (n === 3 && !reduce) play(); else if (board && reduce) board.jump(prog);
    }
    if (hasIO) {
      var sio = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) set(+e.target.dataset.step); });
      }, { rootMargin: window.innerWidth > 900 ? "-50% 0px -50% 0px" : "-72% 0px -28% 0px", threshold: 0 });
      steps.forEach(function (s) { sio.observe(s); });
    }
    set(1);
  })();

  /* ---- ためす：ブロックを並べて、ロボットを旗まで動かす ---- */
  (function () {
    var host = $("#pg-board");
    if (!host) return;
    var LEVELS = [
      { cols: 5, rows: 4, start: { x: 0, y: 3, d: 0 }, goal: { x: 0, y: 1 }, walls: [[2, 2], [3, 0]], hint: "まずは「前へ」を2つ。旗までまっすぐ進もう。" },
      { cols: 5, rows: 4, start: { x: 0, y: 3, d: 0 }, goal: { x: 3, y: 1 }, walls: [[2, 3], [1, 2], [4, 0]], hint: "こんどは、とちゅうで向きを変えよう。" },
      { cols: 5, rows: 4, start: { x: 0, y: 3, d: 0 }, goal: { x: 4, y: 3 }, walls: [[1, 3], [2, 3], [3, 3], [2, 1]], hint: "かべをよけて、ぐるっと回りこもう。" }
    ];
    var MAX = 10, lv = 0, prog = [], busy = false, board;
    var tray = $("#tray"), msg = $("#pg-msg"), runBtn = $("#pg-run"), count = $("#pg-count"), course = $("#pg-course");
    var lvBtns = $$("#pg-levels button"), conf = $("#confetti");

    function say(text, cls) { msg.className = "pg-msg" + (cls ? " " + cls : ""); msg.textContent = text; }
    function render() {
      tray.innerHTML = "";
      prog.forEach(function (k, i) {
        var c = chip(k); c.setAttribute("role", "button"); c.tabIndex = 0;
        c.setAttribute("aria-label", (i + 1) + "ばんめ " + NAME[k] + "。押すと消せます");
        var del = function () { if (busy) return; prog.splice(i, 1); board.reset(); render(); };
        c.addEventListener("click", del);
        c.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); del(); } });
        tray.appendChild(c);
      });
      tray.classList.remove("running");
      count.textContent = prog.length + " / " + MAX;
      runBtn.disabled = !prog.length || busy;
    }
    function load(n) {
      lv = n; prog = []; busy = false;
      board = Board(host, LEVELS[lv]);
      course.textContent = "コース " + (lv + 1);
      lvBtns.forEach(function (b, i) { b.setAttribute("aria-pressed", i === lv); });
      say(LEVELS[lv].hint); render();
    }
    function burst() {
      if (reduce || !conf) return;
      var colors = ["#f7931e", "#5bc2e7", "#e9780a", "#1e93c8", "#ffd08a"];
      for (var i = 0; i < 26; i++) {
        var p = document.createElement("i"), a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 220;
        p.style.background = colors[i % colors.length];
        p.style.setProperty("--x", (Math.cos(a) * d).toFixed(0) + "px");
        p.style.setProperty("--y", (Math.sin(a) * d - 60).toFixed(0) + "px");
        p.style.setProperty("--r", (Math.random() * 720 - 360).toFixed(0) + "deg");
        conf.appendChild(p);
      }
      setTimeout(function () { conf.innerHTML = ""; }, 1500);
    }
    $$("#palette .blk").forEach(function (b) {
      b.addEventListener("click", function () {
        if (busy) return;
        if (prog.length >= MAX) { say("ブロックは" + MAX + "個までです。並んだブロックを押すと、消せます。", "bad"); return; }
        prog.push(b.dataset.k); board.reset(); render();
        if (prog.length === 1) say("いいね。並べ終わったら「うごかす」を押そう。");
      });
    });
    $("#pg-clear").addEventListener("click", function () { if (busy) return; prog = []; board.reset(); render(); say(LEVELS[lv].hint); });
    lvBtns.forEach(function (b) { b.addEventListener("click", function () { board.reset(); load(+b.dataset.l); }); });
    runBtn.addEventListener("click", async function () {
      if (busy || !prog.length) return;
      busy = true; runBtn.disabled = true; tray.classList.add("running"); say("ロボットが動いています…");
      var my = lv, res = await board.run(prog, function (i) { mark(tray, i); }, reduce ? .5 : 1);
      if (res.cancelled || my !== lv) return;
      busy = false; runBtn.disabled = false; tray.classList.remove("running"); mark(tray, -1);
      if (res.ok) {
        burst(); lvBtns[lv].classList.add("clear");
        if (lv < LEVELS.length - 1) {
          msg.className = "pg-msg good"; msg.textContent = "できた！ ロボットが旗に着きました。 ";
          var nb = document.createElement("button"); nb.type = "button"; nb.textContent = "つぎのコースへ";
          nb.addEventListener("click", function () { load(lv + 1); }); msg.appendChild(nb);
        } else say("ぜんぶクリア！ 本物のつかプロでは、これを手で並べます。", "good");
      } else if (res.hit) say("かべにぶつかりました。" + (res.at + 1) + "ばんめのブロックを見直してみよう。", "bad");
      else say("旗まで、あと少し。ブロックを足すか、入れかえてみよう。", "bad");
    });
    load(0);
  })();

  /* ---- 実績：横に送るボタン ---- */
  (function () {
    var rail = $("#rail"), prev = $("#rail-prev"), next = $("#rail-next");
    if (!rail || !prev || !next) return;
    var stepW = function () { var c = rail.firstElementChild; return c ? c.getBoundingClientRect().width + 16 : 320; };
    var upd = function () { prev.disabled = rail.scrollLeft < 8; next.disabled = rail.scrollLeft > rail.scrollWidth - rail.clientWidth - 8; };
    prev.addEventListener("click", function () { rail.scrollBy({ left: -stepW(), behavior: reduce ? "auto" : "smooth" }); });
    next.addEventListener("click", function () { rail.scrollBy({ left: stepW(), behavior: reduce ? "auto" : "smooth" }); });
    rail.addEventListener("scroll", upd, { passive: true });
    window.addEventListener("resize", upd); upd();
  })();

  /* ---- スクロールに合わせて動くもの ---- */
  var nav = $("#nav"), heroCopy = $("#hero-copy"), finalTitle = $("#final-title");
  var darks = $$('[data-nav="dark"]'), grows = $$("[data-grow]"), plx = $$("[data-plx]");
  var navLinks = $$(".nav-links a"), navSecs = navLinks.map(function (a) { return $(a.getAttribute("href")); });

  function onScroll() {
    var sy = window.scrollY, vh = window.innerHeight;
    nav.classList.toggle("scrolled", sy > 8);
    nav.classList.toggle("dark", darks.some(function (s) { var r = s.getBoundingClientRect(); return r.top <= 26 && r.bottom > 26; }));
    var cur = -1;
    navSecs.forEach(function (s, i) { if (s && s.getBoundingClientRect().top < vh * .4) cur = i; });
    navLinks.forEach(function (a, i) { a.classList.toggle("active", i === cur); });
    if (reduce) return;

    if (heroCopy && sy < vh * 1.2) {
      heroCopy.style.opacity = clamp(1 - sy / (vh * .62), 0, 1).toFixed(3);
      heroCopy.style.transform = "translate3d(0," + (sy * .18).toFixed(1) + "px,0) scale(" + (1 - clamp(sy / vh, 0, 1) * .06).toFixed(4) + ")";
    }
    grows.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < vh * 1.2 && r.bottom > -200) el.style.setProperty("--g", clamp((vh - r.top) / (vh * .7), 0, 1).toFixed(3));
    });
    if (wordsEl) {
      var wr = wordsEl.getBoundingClientRect();
      var p = clamp((vh * .82 - wr.top) / (vh * .5 + wr.height * .55), 0, 1), n = Math.round(p * spans.length);
      spans.forEach(function (s, i) { s.classList.toggle("on", i < n); });
    }
    plx.forEach(function (img) {
      var r = img.parentNode.getBoundingClientRect();
      if (r.bottom < -60 || r.top > vh + 60) return;
      img.style.transform = "translate3d(0," + (((r.top + r.height / 2 - vh / 2) / vh) * -36).toFixed(1) + "px,0)";
    });
    if (finalTitle) {
      var fr = finalTitle.getBoundingClientRect();
      if (fr.top < vh * 1.2) finalTitle.style.setProperty("--s", (.86 + .14 * clamp((vh - fr.top) / (vh * .6), 0, 1)).toFixed(4));
    }
  }
  var ticking = false;
  window.addEventListener("scroll", function () {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () { onScroll(); ticking = false; });
  }, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();
})();
