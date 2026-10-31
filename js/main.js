(function () {
  "use strict";
  // 動きの設定：ふだんは「ふつう」（動きあり）。苦手な人は、フッターの「動き」ボタンで「少なめ」にできる
  var pref = "";
  try { pref = localStorage.getItem("tsuka-motion") || ""; } catch (e) {}
  var reduce = pref === "less";
  document.documentElement.dataset.motion = reduce ? "reduce" : "full";
  var motionBtn = document.getElementById("motion-toggle");
  if (motionBtn) {
    motionBtn.textContent = "動き：" + (reduce ? "少なめ" : "ふつう");
    motionBtn.addEventListener("click", function () {
      try { localStorage.setItem("tsuka-motion", reduce ? "more" : "less"); } catch (e) {}
      location.reload();
    });
  }
  var fine = window.matchMedia("(pointer: fine)").matches;
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var $ = function (s) { return document.querySelector(s); };

  /* ---- ローディング：ブロックが組み上がったら、幕が上がる ---- */
  var root = document.documentElement;
  function ready() {
    root.classList.remove("has-loader"); root.classList.remove("loader-done");
    try { sessionStorage.setItem("tsuka-seen", "1"); } catch (e) {}
    document.dispatchEvent(new Event("tsuka:ready"));
  }
  function onReady(cb) {
    if (!root.classList.contains("has-loader")) cb(); else document.addEventListener("tsuka:ready", cb, { once: true });
  }
  window.tsukaOnReady = onReady;
  if (root.classList.contains("has-loader")) {
    var closed = false, close = function () {
      if (closed) return; closed = true;
      root.classList.add("loader-done");
      setTimeout(ready, 950);
    };
    setTimeout(close, 2000);          // 組み上がる演出のあと
    setTimeout(close, 5000);          // 念のための保険
  }

  /* ---- どのセクションも、スクロールでふわっと出す（AOS風）。段階的に遅らせる ---- */
  document.querySelectorAll("section .wrap > *, .focus-sub, .team > *, .cards > *, .bento > *").forEach(function (el, i) {
    if (el.classList.contains("reveal") || el.hasAttribute("data-fx") || el.classList.contains("words") || el.classList.contains("team") || el.classList.contains("cards") || el.classList.contains("bento")) return;
    el.classList.add("reveal");
  });

  /* ---- チームカード：担当領域とひとことがあれば、ホバー時のカードに出す ---- */
  document.querySelectorAll(".member").forEach(function (m) {
    var more = m.querySelector(".more");
    if (more && m.dataset.role) { var r = document.createElement("p"); r.className = "m-role"; r.textContent = m.dataset.role; more.insertBefore(r, more.firstChild); }
    if (more && m.dataset.comment) { var c = document.createElement("p"); c.className = "m-comment"; c.textContent = m.dataset.comment; more.appendChild(c); }
    m.addEventListener("click", function () { if (!fine) m.classList.toggle("open"); });
  });

  /* ---- ヒーローのガラスのカード：マウスに合わせて傾く ---- */
  var glassEl = $("#glass"), stageEl = $("#hero-logo");
  if (glassEl && stageEl && fine && !reduce) {
    stageEl.addEventListener("pointermove", function (e) {
      var r = stageEl.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
      glassEl.style.setProperty("--ry", (px * 18).toFixed(2) + "deg"); glassEl.style.setProperty("--rx", (-py * 14).toFixed(2) + "deg");
    });
    stageEl.addEventListener("pointerleave", function () { glassEl.style.setProperty("--ry", "0deg"); glassEl.style.setProperty("--rx", "0deg"); });
  }

  /* ---- Fade-and-rise on scroll ---- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
    onReady(function () { revealEls.forEach(function (el) { io.observe(el); }); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---- Count-up ---- */
  var counters = document.querySelectorAll("[data-count]");
  if ("IntersectionObserver" in window && !reduce) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target, to = +el.dataset.count, t0 = performance.now();
        (function tick(t) {
          var p = clamp((t - t0) / 1400, 0, 1);
          el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
          if (p < 1) requestAnimationFrame(tick);
        })(t0);
        cio.unobserve(el);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { cio.observe(el); });
  } else {
    counters.forEach(function (el) { el.textContent = el.dataset.count; });
  }

  /* ---- Scroll-linked words ---- */
  var wordsEl = $("[data-words]"), spans = [];
  if (wordsEl) {
    var chunks = wordsEl.textContent.trim().match(/[^、。\s]+[、。]?/g) || [];
    wordsEl.textContent = "";
    chunks.forEach(function (c) { var s = document.createElement("span"); s.textContent = c; wordsEl.appendChild(s); spans.push(s); });
  }

  /* ---- Floating bricks in the hero ---- */
  var cv = $("#bricks"), hero = $("#hero");
  var mouse = { x: -999, y: -999 }, bricks = [], heroVisible = true, W = 0, H = 0, dpr = 1;
  if (cv && cv.getContext) {
    var ctx = cv.getContext("2d");
    var COLORS = [["#f7931e", "#d9740f"], ["#5bc2e7", "#3ea5cf"], ["#f7931e", "#d9740f"], ["#5bc2e7", "#3ea5cf"], ["#dfe6ec", "#c9d2da"]];
    var resize = function () {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = hero.clientWidth; H = hero.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var count = clamp(Math.round(W / 70), 10, 24);
      bricks = [];
      for (var i = 0; i < count; i++) {
        var z = Math.random();
        bricks.push({
          x: Math.random() * W, y: Math.random() * H, z: z,
          s: 22 + z * 46, a: Math.random() * 6.28, va: (Math.random() - .5) * .006,
          vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25 - .05,
          c: COLORS[i % COLORS.length], studs: 1 + (i % 2)
        });
      }
      if (reduce) draw();
    };
    var brick = function (b) {
      var w = b.s * 1.5, h = b.s, r = h * .2;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
      ctx.globalAlpha = .35 + b.z * .55;
      ctx.fillStyle = b.c[1]; rr(-w / 2, -h / 2 + h * .1, w, h, r); ctx.fill();
      ctx.fillStyle = b.c[0]; rr(-w / 2, -h / 2, w, h, r); ctx.fill();
      var sw = w * .22, sh = h * .2;
      for (var i = 0; i < b.studs; i++) {
        var sx = b.studs === 1 ? -sw / 2 : (i === 0 ? -w * .36 : w * .14);
        ctx.fillStyle = b.c[0]; rr(sx, -h / 2 - sh + 1, sw, sh, sh * .35); ctx.fill();
      }
      ctx.restore();
    };
    var rr = function (x, y, w, h, r) {
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    };
    var draw = function () {
      ctx.clearRect(0, 0, W, H);
      bricks.forEach(function (b) { brick(b); });
    };
    var step = function () {
      if (heroVisible && !document.hidden) {
        bricks.forEach(function (b) {
          var dx = b.x - mouse.x, dy = b.y - mouse.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d < 150) { var f = (150 - d) / 150 * .6; b.vx += dx / d * f * .3; b.vy += dy / d * f * .3; b.va += (dx > 0 ? 1 : -1) * f * .002; }
          b.vx *= .985; b.vy *= .985; b.va *= .99;
          b.x += b.vx * (.5 + b.z); b.y += b.vy * (.5 + b.z); b.a += b.va;
          var m = b.s * 2;
          if (b.x < -m) b.x = W + m; if (b.x > W + m) b.x = -m;
          if (b.y < -m) b.y = H + m; if (b.y > H + m) b.y = -m;
          // gentle drift so they never stall
          b.vx += (Math.random() - .5) * .01; b.vy += (Math.random() - .5) * .01;
        });
        draw();
      }
      requestAnimationFrame(step);
    };
    resize();
    window.addEventListener("resize", resize);
    hero.addEventListener("pointermove", function (e) { var r = hero.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
    hero.addEventListener("pointerleave", function () { mouse.x = mouse.y = -999; });
    if ("IntersectionObserver" in window) new IntersectionObserver(function (en) { heroVisible = en[0].isIntersecting; }).observe(hero);
    if (!reduce) requestAnimationFrame(step);
  }

  /* ---- カーソルのリング（マウスだけ） ---- */
  var ring = $("#cursor");
  if (ring && fine && !reduce) {
    var rx = -100, ry = -100, tx = -100, ty = -100;
    window.addEventListener("pointermove", function (e) { tx = e.clientX; ty = e.clientY; ring.classList.add("on"); }, { passive: true });
    document.addEventListener("pointerleave", function () { ring.classList.remove("on"); });
    document.addEventListener("pointerover", function (e) { ring.classList.toggle("big", !!(e.target.closest && e.target.closest("a, button, .tilt, .h-card, #robot, .curve svg"))); });
    (function follow() {
      rx += (tx - rx) * 0.2; ry += (ty - ry) * 0.2;
      ring.style.transform = "translate3d(" + rx.toFixed(1) + "px," + ry.toFixed(1) + "px,0)";
      requestAnimationFrame(follow);
    })();
  }

  /* ---- Cursor glow, tilt, magnetic buttons (mouse only) ---- */
  var glow = $("#glow");
  if (fine && !reduce) {
    window.addEventListener("pointermove", function (e) {
      glow.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)"; glow.classList.add("on");
    }, { passive: true });
    document.addEventListener("pointerleave", function () { glow.classList.remove("on"); });

    document.querySelectorAll(".tilt").forEach(function (el) {
      el.addEventListener("pointerenter", function () { el.classList.add("tilting"); });
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
        el.style.transform = "perspective(900px) rotateX(" + (-py * 8).toFixed(2) + "deg) rotateY(" + (px * 10).toFixed(2) + "deg) translateY(-6px)";
      });
      el.addEventListener("pointerleave", function () { el.style.transform = ""; el.classList.remove("tilting"); });
    });
    document.querySelectorAll(".magnetic").forEach(function (el) {
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect(), x = (e.clientX - r.left - r.width / 2) * .22, y = (e.clientY - r.top - r.height / 2) * .35;
        el.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) scale(1.04)";
      });
      el.addEventListener("pointerleave", function () { el.style.transform = ""; });
    });
  }

  /* ---- Scroll-driven pieces ---- */
  var nav = $("#nav"), bar = $("#progress"), heroLogo = $("#hero-logo");
  var pin = $("#pin"), stage = pin && pin.querySelector(".stage-blocks"), caps = pin ? pin.querySelectorAll(".cap") : [];
  var hs = $("#record"), track = $("#h-track");
  var circuit = $("#circuit"), why = $("#why");
  var cPaths = circuit ? Array.from(circuit.querySelectorAll("path")) : [];
  var cDots = circuit ? Array.from(circuit.querySelectorAll("circle")) : [];
  cPaths.forEach(function (p) { p.setAttribute("pathLength", "1"); });

  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".nav-links a"));
  var sections = navLinks.map(function (a) { return document.querySelector(a.getAttribute("href")); });
  var photos = Array.prototype.slice.call(document.querySelectorAll(".member .photo img"));
  var lastY = 0;

  function onScroll() {
    var sy = window.scrollY, vh = window.innerHeight;
    nav.classList.toggle("scrolled", sy > 8);
    nav.classList.toggle("hide", sy > lastY && sy > 240 && !reduce);
    lastY = sy;
    var cur = -1;
    sections.forEach(function (sec, i) { if (sec && sec.getBoundingClientRect().top < vh * 0.4) cur = i; });
    navLinks.forEach(function (a, i) { a.classList.toggle("active", i === cur); });
    if (!reduce) photos.forEach(function (img) {
      var r = img.parentNode.getBoundingClientRect();
      if (r.bottom < -50 || r.top > vh + 50) return;
      var p = (r.top + r.height / 2 - vh / 2) / vh;
      img.style.transform = "translate3d(0," + (p * -34).toFixed(1) + "px,0) scale(1.12)";
    });
    var docH = document.documentElement.scrollHeight - vh;
    bar.style.transform = "scaleX(" + (docH > 0 ? clamp(sy / docH, 0, 1) : 0).toFixed(4) + ")";

    if (heroLogo && !reduce && sy < vh * 1.4) {
      heroLogo.style.translate = "0 " + (sy * 0.12).toFixed(1) + "px";
      heroLogo.style.scale = (1 + sy * 0.0002).toFixed(4);
    }

    if (wordsEl && !reduce) {
      var r = wordsEl.getBoundingClientRect();
      var p = clamp((vh * 0.85 - r.top) / (vh * 0.55 + r.height * 0.6), 0, 1);
      var n = Math.round(p * spans.length);
      spans.forEach(function (s, i) { s.classList.toggle("on", i < n); });
    }

    if (pin && stage) {
      var pr = pin.getBoundingClientRect(), q = clamp(-pr.top / (pr.height - vh), 0, 1);
      var join = reduce ? 1 : clamp(q / 0.5, 0, 1), lit = reduce ? 1 : clamp((q - 0.55) / 0.2, 0, 1);
      stage.style.setProperty("--join", (1 - Math.pow(1 - join, 3)).toFixed(3));
      stage.style.setProperty("--lit", lit.toFixed(3));
      var idx = q < 0.3 ? 0 : q < 0.7 ? 1 : 2;
      caps.forEach(function (c, i) { c.classList.toggle("show", i === idx); });
    }

    if (hs && track && window.innerWidth > 760) {
      var hr = hs.getBoundingClientRect(), hq = clamp(-hr.top / (hr.height - vh), 0, 1);
      var dist = Math.max(0, track.scrollWidth - window.innerWidth + 40);
      track.style.transform = "translate3d(" + (-hq * dist).toFixed(1) + "px,0,0)";
    } else if (track) { track.style.transform = ""; }

    if (why && cPaths.length) {
      var wr = why.getBoundingClientRect(), wq = reduce ? 1 : clamp((vh - wr.top) / (vh + wr.height * 0.4), 0, 1);
      cPaths.forEach(function (pth, i) { pth.style.setProperty("--d", (1 - clamp(wq * 1.6 - i * 0.18, 0, 1)).toFixed(3)); });
      cDots.forEach(function (d, i) { d.style.setProperty("--o", clamp(wq * 2 - 0.4 - i * 0.12, 0, 1).toFixed(2)); });
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
