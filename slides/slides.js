(function () {
  "use strict";
  var W = 1920, H = 1080;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (id) { return document.getElementById(id); };
  var stage = $("stage"), fx = $("fx");
  var slides = Array.prototype.slice.call(stage.querySelectorAll(".slide"));
  var cur = 0, busy = false;
  // 発表用なので、OSの「視差効果を減らす」設定にかかわらず演出は最初からON（Tキーで切り替え）
  var effectOn = true, quick = false;

  /* ---- 画面に合わせて舞台を拡大縮小 ---- */
  function fit() {
    var s = Math.min(window.innerWidth / W, window.innerHeight / H);
    stage.style.transform = "translate(" + (-W * s / 2) + "px," + (-H * s / 2) + "px) scale(" + s + ")";
  }
  window.addEventListener("resize", fit); fit();

  /* ---- 表示の更新 ---- */
  function show(i) {
    cur = i;
    slides.forEach(function (s, k) { s.classList.toggle("current", k === i); s.classList.remove("next"); s.style.clipPath = ""; });
    $("counter").textContent = (i + 1) + " / " + slides.length;
    $("bar").style.transform = "scaleX(" + ((i + 1) / slides.length) + ")";
    $("notes-panel").textContent = (slides[i].querySelector(".notes") || {}).textContent || "（メモなし）";
    try { history.replaceState(null, "", "#" + (i + 1)); } catch (e) {}
  }

  /* ---- ページ送り ---- */
  function go(to, instant) {
    if (busy || to < 0 || to >= slides.length || to === cur) return;
    var dir = to > cur ? 1 : -1;
    if (instant || !effectOn || Math.abs(to - cur) > 1) { crossfade(to); return; }
    run(to, dir);
  }
  function next() { go(cur + 1); }
  function prev() { go(cur - 1); }

  function crossfade(to) {
    busy = true;
    var nx = slides[to];
    nx.classList.add("next"); nx.style.opacity = "0";
    var a = nx.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" });
    a.onfinish = function () { nx.style.opacity = ""; show(to); busy = false; };
  }

  var ease = {
    out: function (t) { return 1 - Math.pow(1 - t, 3); },
    inOut: function (t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  };

  /* ロボットのSVG（実際の部品の色：シャーシ＝橙、カバー＝青、バイザー＝濃紺） */
  var ROBOT = '<svg viewBox="0 0 220 150" aria-hidden="true">' +
    '<g class="body"><rect x="14" y="60" width="192" height="54" rx="16" fill="#f7931e"/><rect x="14" y="100" width="192" height="14" rx="7" fill="#d9740f"/>' +
    '<rect x="46" y="22" width="116" height="48" rx="14" fill="#5bc2e7"/><rect x="64" y="34" width="80" height="20" rx="10" fill="#2b3a4a"/>' +
    '<circle cx="88" cy="44" r="4.5" fill="#ffd37a"/><circle cx="120" cy="44" r="4.5" fill="#ffd37a"/>' +
    '<rect x="102" y="10" width="4" height="14" fill="#3ea5cf"/><circle cx="104" cy="8" r="7" fill="#ffd37a"/></g>' +
    '<g class="wheel"><circle cx="56" cy="124" r="22" fill="#2b3a4a"/><circle cx="56" cy="124" r="9" fill="#e8eaee"/><rect x="54" y="104" width="4" height="12" rx="2" fill="#e8eaee"/></g>' +
    '<g class="wheel"><circle cx="164" cy="124" r="22" fill="#2b3a4a"/><circle cx="164" cy="124" r="9" fill="#e8eaee"/><rect x="162" y="104" width="4" height="12" rx="2" fill="#e8eaee"/></g></svg>';

  var ROAD_Y = 900;        // ブロックの道の上面
  var N = 12, BW = W / N;  // 道を作るブロックの数と幅

  function run(to, dir) {
    busy = true;
    var k = quick ? 0.5 : 1;
    var nx = slides[to];
    nx.classList.add("next");
    nx.style.clipPath = dir > 0 ? "inset(0 100% 0 0)" : "inset(0 0 0 100%)";

    fx.innerHTML = "";
    var bricks = [], lamp;
    for (var i = 0; i < N; i++) {
      var b = document.createElement("div");
      b.className = "brick " + (i % 2 ? "b" : "o");
      b.style.width = (BW - 6) + "px";
      b.style.left = (i * BW + 3) + "px"; b.style.top = ROAD_Y + "px";
      var pos = dir > 0 ? i : N - 1 - i;      // 進む向きに合わせて「つ」と電球の位置を入れ替える
      if (pos === 0) { b.className = "brick o"; b.innerHTML = '<span class="tsu">つ</span>'; }
      if (pos === N - 1) { b.className = "brick b"; b.innerHTML = '<i class="lamp"></i>'; lamp = b.firstChild; }
      fx.appendChild(b); bricks.push(b);
    }
    var robot = document.createElement("div");
    robot.className = "robot" + (dir < 0 ? " flip" : "");
    robot.innerHTML = ROBOT;
    robot.style.top = (ROAD_Y - 10 - 173) + "px"; robot.style.left = "0px";
    robot.style.transform = "translateX(" + (dir > 0 ? -320 : W + 60) + "px)";
    fx.appendChild(robot);

    // 1) ブロックが飛んできて、かちっと組み上がる
    var order = bricks.map(function (_, i) { return dir > 0 ? i : N - 1 - i; });
    var assembled = 0, tAssemble = 0;
    bricks.forEach(function (b, i) {
      var seed = Math.sin((i + 1) * 12.9898) * 43758.5453; seed -= Math.floor(seed);
      var fromTop = seed > .5;
      var dx = (seed - .5) * 900, dy = fromTop ? -(900 + seed * 300) : 700;
      var delay = order[i] * 42 * k, dur = 560 * k;
      tAssemble = Math.max(tAssemble, delay + dur);
      var anim = b.animate([
        { transform: "translate(" + dx + "px," + dy + "px) rotate(" + (seed * 160 - 80) + "deg)", opacity: 0 },
        { opacity: 1, offset: .25 },
        { transform: "translate(0,-10px) rotate(0deg)", offset: .85 },
        { transform: "translate(0,0) rotate(0deg)", opacity: 1 }
      ], { duration: dur, delay: delay, easing: "cubic-bezier(.2,.8,.3,1)", fill: "both" });
      anim.onfinish = function () { assembled++; };
    });

    // 2) 組み上がったら、ロボットが走り抜けてページをめくる
    setTimeout(function () {
      var dur = 1000 * k, t0 = performance.now(), from = dir > 0 ? -320 : W + 60, to2 = dir > 0 ? W + 60 : -320;
      var lastPuff = 0;
      (function tick(now) {
        var p = Math.min(1, (now - t0) / dur), e = ease.inOut(p);
        var x = from + (to2 - from) * e;
        robot.style.transform = "translateX(" + x.toFixed(1) + "px)";
        var edge = dir > 0 ? x + 120 : x + 140;            // ロボットの後ろ側がページの端
        var pct = Math.max(0, Math.min(100, dir > 0 ? edge / W * 100 : (W - edge) / W * 100));
        nx.style.clipPath = dir > 0 ? "inset(0 " + (100 - pct).toFixed(2) + "% 0 0)" : "inset(0 0 0 " + (100 - pct).toFixed(2) + "%)";
        if (lamp && p > .75) lamp.classList.add("lit");
        if (now - lastPuff > 60 && p < .96) { lastPuff = now; puff(dir > 0 ? x + 20 : x + 240); }
        if (p < 1) requestAnimationFrame(tick);
        else finish();
      })(t0);
    }, tAssemble + 80 * k);

    function puff(px) {
      var d = document.createElement("i");
      d.className = "puff"; d.style.left = px + "px"; d.style.top = (ROAD_Y - 36) + "px";
      fx.appendChild(d);
      d.animate([{ transform: "translate(0,0) scale(.6)", opacity: .9 }, { transform: "translate(" + (dir > 0 ? -50 : 50) + "px,-30px) scale(1.8)", opacity: 0 }], { duration: 520 * k + 100, easing: "ease-out" }).onfinish = function () { d.remove(); };
    }

    // 3) 道が崩れて消え、次のスライドが残る
    function finish() {
      robot.remove();
      var left = bricks.length;
      bricks.forEach(function (b, i) {
        var a = b.animate([{ transform: "translate(0,0)", opacity: 1 }, { transform: "translate(0," + (260 + (i % 3) * 60) + "px) rotate(" + ((i % 2 ? 1 : -1) * 25) + "deg)", opacity: 0 }],
          { duration: 360 * k + 80, delay: i * 18 * k, easing: "ease-in", fill: "forwards" });
        a.onfinish = function () {
          if (--left === 0) { fx.innerHTML = ""; show(to); busy = false; }
        };
      });
      show_next_ready();
    }
    function show_next_ready() { nx.style.clipPath = "none"; }
  }

  /* ---- 操作 ---- */
  var toastT;
  function toast(t) {
    var el = $("toast"); el.textContent = t; el.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { el.hidden = true; }, 1800);
  }
  function setEffect(on) { effectOn = on; $("fx-toggle").textContent = "演出 " + (on ? "ON" : "OFF"); $("fx-toggle").setAttribute("aria-pressed", on); toast("ページ送りの演出：" + (on ? "ON" : "OFF（フェードだけ）")); }
  function setQuick(q) { quick = q; $("speed").textContent = q ? "はやい" : "ふつう"; $("speed").setAttribute("aria-pressed", q); toast("演出の速さ：" + (q ? "はやい" : "ふつう")); }
  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () { toast("全画面にできませんでした"); });
  }

  $("next").addEventListener("click", next);
  $("prev").addEventListener("click", prev);
  $("fx-toggle").addEventListener("click", function () { setEffect(!effectOn); });
  $("speed").addEventListener("click", function () { setQuick(!quick); });
  $("full").addEventListener("click", fullscreen);

  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    if (k === "ArrowRight" || k === "PageDown" || k === " " || k === "Enter") { e.preventDefault(); next(); }
    else if (k === "ArrowLeft" || k === "PageUp" || k === "Backspace") { e.preventDefault(); prev(); }
    else if (k === "Home") go(0, true);
    else if (k === "End") go(slides.length - 1, true);
    else if (k === "f" || k === "F") fullscreen();
    else if (k === "t" || k === "T") setEffect(!effectOn);
    else if (k === "q" || k === "Q") setQuick(!quick);
    else if (k === "n" || k === "N") { var p = $("notes-panel"); p.hidden = !p.hidden; }
    else if (k === "h" || k === "H") { document.body.classList.toggle("hide-hints"); toast(document.body.classList.contains("hide-hints") ? "未記入の目印を隠しました" : "未記入の目印を表示しました"); }
  });

  // タッチ: 左右のスワイプ
  var sx = null;
  document.addEventListener("touchstart", function (e) { sx = e.touches[0].clientX; }, { passive: true });
  document.addEventListener("touchend", function (e) {
    if (sx == null) return; var dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) > 50) (dx < 0 ? next : prev)();
  }, { passive: true });

  // 画面の端をクリックで前後（中央は何もしない）
  stage.addEventListener("click", function (e) {
    var r = stage.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
    if (x > 0.7) next(); else if (x < 0.15) prev();
  });

  // 操作パネルとカーソルは、動かしたときだけ出す
  var idleT;
  function wake() {
    document.body.classList.add("ui"); document.body.classList.remove("idle");
    clearTimeout(idleT); idleT = setTimeout(function () { document.body.classList.remove("ui"); document.body.classList.add("idle"); }, 2500);
  }
  document.addEventListener("mousemove", wake); wake();

  var start = parseInt(location.hash.slice(1), 10);
  show(start >= 1 && start <= slides.length ? start - 1 : 0);
})();
