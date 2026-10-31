/* 文字のアニメーション集（素のJavaScriptで実装）
   data-fx="blur | split | scramble | rotate | vprox | focus | velocity | curve | shiny | agrad"
   「動きを少なめ」のときは、ふわっと出るだけにする */
(function () {
  "use strict";
  var reduce = document.documentElement.dataset.motion === "reduce";
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var seg = window.Intl && Intl.Segmenter ? new Intl.Segmenter("ja", { granularity: "word" }) : null;

  /* ---- 文字を<span>に分ける（<br>はそのまま残す） ---- */
  function split(el, by) {
    var label = el.textContent.replace(/\s+/g, " ").trim();
    if (!el.hasAttribute("aria-label")) el.setAttribute("aria-label", label);
    var out = [], idx = 0;
    Array.prototype.slice.call(el.childNodes).forEach(function (n) {
      if (n.nodeType === 3) {
        var text = n.textContent, parts;
        if (by === "word" && seg) parts = Array.from(seg.segment(text)).map(function (s) { return s.segment; });
        else parts = Array.from(text);
        var frag = document.createDocumentFragment();
        parts.forEach(function (p) {
          if (!p.trim()) { frag.appendChild(document.createTextNode(p)); return; }
          var s = document.createElement("span");
          s.className = "ch"; s.textContent = p; s.setAttribute("aria-hidden", "true"); s.style.setProperty("--i", idx++);
          frag.appendChild(s); out.push(s);
        });
        el.replaceChild(frag, n);
      } else if (n.nodeType === 1 && n.tagName !== "BR") {
        // <span class="grad"> のような中身も分ける
        var inner = split(n, by);
        inner.forEach(function (s) { s.style.setProperty("--i", idx++); out.push(s); });
      }
    });
    out.forEach(function (s) { s.style.setProperty("--n", Math.max(1, out.length - 1)); });
    return out;
  }

  /* ---- 画面に入ったら始める ---- */
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      var el = e.target;
      (window.tsukaOnReady || function (f) { f(); })(function () { el._start && el._start(); });
    });
  }, { threshold: 0.25 }) : null;
  function whenVisible(el, fn) {
    if (!io) { fn(); return; }
    el._start = fn; io.observe(el);
  }

  function finish(spans) { spans.forEach(function (s) { s.style.opacity = ""; s.style.filter = ""; s.style.transform = ""; }); }

  /* ---- blur: ぼかしから、ひと言ずつ現れる ---- */
  $$('[data-fx="blur"]').forEach(function (el) {
    var spans = split(el, el.dataset.by || "word"), step = +(el.dataset.step || (el.dataset.by === "char" ? 45 : 110));
    if (reduce) return;
    spans.forEach(function (s) { s.style.display = "inline-block"; s.style.opacity = 0; });
    whenVisible(el, function () {
      var last;
      spans.forEach(function (s, i) {
        last = s.animate([
          { opacity: 0, filter: "blur(12px)", transform: "translateY(-36px)" },
          { opacity: .55, filter: "blur(5px)", transform: "translateY(6px)", offset: .55 },
          { opacity: 1, filter: "blur(0)", transform: "translateY(0)" }
        ], { duration: 820, delay: i * step, easing: "cubic-bezier(.2,.7,.2,1)", fill: "both" });
      });
      if (last) last.onfinish = function () { finish(spans); };
    });
  });

  /* ---- split: 1文字ずつ、奥から起き上がる ---- */
  $$('[data-fx="split"]').forEach(function (el) {
    var spans = split(el, "char");
    if (reduce) return;
    el.style.perspective = "600px";
    spans.forEach(function (s) { s.style.display = "inline-block"; s.style.opacity = 0; });
    whenVisible(el, function () {
      var last;
      spans.forEach(function (s, i) {
        last = s.animate([
          { opacity: 0, transform: "rotateX(-90deg) translateY(40%)" },
          { opacity: 1, transform: "rotateX(0) translateY(0)" }
        ], { duration: 700, delay: i * 55, easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" });
      });
      if (last) last.onfinish = function () { finish(spans); };
    });
  });

  /* ---- scramble: ばらばらの文字から、正しい文字に落ち着く ---- */
  var GLYPHS = "アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789#$%&";
  $$('[data-fx="scramble"]').forEach(function (el) {
    var final = el.textContent.trim(), chars = Array.from(final);
    if (reduce) return;
    el.setAttribute("aria-label", final);
    el.textContent = chars.map(function (c) { return GLYPHS[(Math.random() * GLYPHS.length) | 0]; }).join("");
    whenVisible(el, function () {
      var t0 = performance.now(), dur = 900 + chars.length * 70;
      (function tick(now) {
        var p = clamp((now - t0) / dur, 0, 1), settled = Math.floor(p * chars.length);
        el.textContent = chars.map(function (c, i) { return i < settled ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0]; }).join("");
        if (p < 1) requestAnimationFrame(tick); else el.textContent = final;
      })(t0);
    });
  });

  /* ---- rotate: 言葉が入れ替わり続ける ---- */
  $$('[data-fx="rotate"]').forEach(function (el) {
    var words = el.dataset.words.split("|"), i = 0;
    el.setAttribute("aria-live", "off");
    var show = function () {
      el.textContent = words[i];
      if (reduce) return;
      el.animate([{ opacity: 0, transform: "translateY(60%)", filter: "blur(6px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }], { duration: 520, easing: "cubic-bezier(.2,.8,.2,1)" });
    };
    show();
    if (words.length < 2) return;
    setInterval(function () {
      if (document.hidden) return;
      var out = reduce ? null : el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-60%)" }], { duration: 280, easing: "ease-in", fill: "forwards" });
      var next = function () { i = (i + 1) % words.length; show(); if (out) out.cancel(); };
      if (out) out.onfinish = next; else next();
    }, 2600);
  });

  /* ---- vprox: カーソルが近づくと文字が太くなる ---- */
  $$('[data-fx="vprox"]').forEach(function (el) {
    var spans = split(el, "char");
    if (reduce || !window.matchMedia("(pointer: fine)").matches) return;
    var mx = -999, my = -999, raf = 0, R = 130;
    var cache = [];
    var measure = function () { cache = spans.map(function (s) { var r = s.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }); };
    var update = function () {
      raf = 0;
      spans.forEach(function (s, i) {
        var c = cache[i], d = Math.hypot(mx - c[0], my - c[1]), w = 400 + 500 * Math.pow(clamp(1 - d / R, 0, 1), 1.4);
        s.style.fontVariationSettings = "'wght' " + Math.round(w);
      });
    };
    spans.forEach(function (s) { s.style.fontVariationSettings = "'wght' 400"; });
    window.addEventListener("pointermove", function (e) {
      mx = e.clientX; my = e.clientY; if (!raf) { measure(); raf = requestAnimationFrame(update); }
    }, { passive: true });
  });

  /* ---- focus: 枠がことばを順に追いかける ---- */
  $$('[data-fx="focus"]').forEach(function (el) {
    var words = el.dataset.words.split("|"), frame = document.createElement("i"), spans = [], cur = 0;
    frame.className = "tf-frame"; frame.setAttribute("aria-hidden", "true");
    el.setAttribute("aria-label", words.join("、"));
    el.textContent = "";
    words.forEach(function (w) { var s = document.createElement("span"); s.className = "tf-word"; s.textContent = w; s.setAttribute("aria-hidden", "true"); el.appendChild(s); spans.push(s); });
    el.appendChild(frame);
    var place = function () {
      spans.forEach(function (s, i) { s.classList.toggle("on", i === cur); });
      var r = spans[cur].getBoundingClientRect(), p = el.getBoundingClientRect(), pad = 12;
      frame.style.transform = "translate(" + (r.left - p.left - pad) + "px," + (r.top - p.top - pad) + "px)";
      frame.style.width = r.width + pad * 2 + "px"; frame.style.height = r.height + pad * 2 + "px";
      frame.style.opacity = 1;
    };
    place(); window.addEventListener("resize", place);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
    if (reduce) { spans.forEach(function (s) { s.classList.add("on"); }); frame.style.display = "none"; return; }
    setInterval(function () { if (!document.hidden) { cur = (cur + 1) % spans.length; place(); } }, 1700);
  });

  /* ---- velocity: スクロールの速さで、流れる文字帯が速くなる ---- */
  $$('[data-fx="velocity"]').forEach(function (box) {
    if (reduce) return;
    box.classList.add("vel");
    var rows = $$(".m-row", box).map(function (row) {
      var track = row.querySelector(".m-track");
      return { track: track, dir: row.classList.contains("rev") ? 1 : -1, x: 0, half: 0 };
    });
    var measure = function () { rows.forEach(function (r) { r.half = r.track.scrollWidth / 2; }); };
    measure(); window.addEventListener("resize", measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    var lastY = window.scrollY, vel = 0, visible = true, last = performance.now();
    if (io) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(box);
    (function loop(now) {
      requestAnimationFrame(loop);
      var dt = Math.min(50, now - last) / 1000; last = now;
      var y = window.scrollY, dv = (y - lastY) / Math.max(dt, .001); lastY = y;
      vel += (dv - vel) * 0.12;
      if (!visible) return;
      var boost = clamp(Math.abs(vel) / 900, 0, 6);
      rows.forEach(function (r) {
        if (!r.half) return;
        r.x += r.dir * (70 + 70 * boost) * dt;
        if (r.dir < 0 && r.x <= -r.half) r.x += r.half;
        if (r.dir > 0 && r.x >= 0) r.x -= r.half;
        r.track.style.transform = "translate3d(" + r.x.toFixed(1) + "px,0,0)";
      });
    })(last);
  });

  /* ---- curve: 曲線の上を、文字が流れる ---- */
  $$('[data-fx="curve"]').forEach(function (box) {
    var svg = box.querySelector("svg"), tp = box.querySelector("textPath"), text = box.querySelector("text");
    if (!svg || !tp) return;
    var unit = 0, offset = 0, speed = reduce ? 0 : 1.1, dragging = false, lastX = 0, dir = 1;
    var measure = function () { unit = text.getComputedTextLength() / (+box.dataset.repeat || 6); };
    var go = function () { measure(); if (!unit) return setTimeout(go, 200); (function loop() { requestAnimationFrame(loop); if (!dragging) offset -= speed * dir; if (offset <= -unit) offset += unit; if (offset > 0) offset -= unit; tp.setAttribute("startOffset", offset.toFixed(1)); })(); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); else go();
    if (reduce) return;
    svg.style.touchAction = "pan-y"; svg.style.cursor = "grab";
    svg.addEventListener("pointerdown", function (e) { dragging = true; lastX = e.clientX; svg.setPointerCapture(e.pointerId); svg.style.cursor = "grabbing"; });
    svg.addEventListener("pointermove", function (e) { if (!dragging) return; var dx = e.clientX - lastX; lastX = e.clientX; offset += dx * 1.4; if (dx) dir = dx > 0 ? -1 : 1; });
    var up = function () { dragging = false; svg.style.cursor = "grab"; };
    svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);
  });
})();
