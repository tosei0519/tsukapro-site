(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 設定 ---------- */
  var CODES = { 後: "B", 右: "R", 前: "F", 左: "L" };
  var LEARN_ORDER = ["後", "右", "前", "左"];          // 「覚える」で上から並べる順番
  var P = 360;                                          // 読み取りに使う画像の長辺(px)
  var GRID = 20;                                        // 形を比べるときの格子の細かさ
  var NECK = 0.28;                                      // これより細い行は「つなぎ目」とみなす（最大幅に対する割合）
  var UNKNOWN_DIST = 0.5;                               // これより離れた形は「？」にする
  var MARGIN = 0.04;                                    // 1番目と2番目の差がこれより小さければ「？」にする
  var TKEY = "tsukapro-reader-templates-v1";

  var params = { hmin: 16, hmax: 44, smin: 50, vmin: 40, rot: 0 };
  var mode = "none";               // none | camera | sample
  var stream = null, timer = null;
  var templates = null;
  var current = [];                // 最後に読めた命令（["前","右",…] 。読めなかったものは "？"）
  var pending = "", pendingN = 0, committed = "";

  try { templates = JSON.parse(localStorage.getItem(TKEY)); } catch (e) { templates = null; }

  var video = $("video"), sample = $("sample"), shot = $("shot"), overlay = $("overlay");
  var shotCtx = shot.getContext("2d"), ovCtx = overlay.getContext("2d");
  var work = document.createElement("canvas"), workCtx = work.getContext("2d", { willReadFrequently: true });

  /* ---------- 画像から「オレンジ」を抜き出して、ブロックごとの形にする ---------- */
  function rgb2hsv(r, g, b) {
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d) {
      if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [h, mx ? d / mx : 0, mx / 255];
  }

  function analyze(img, W, H) {
    var d = img.data, N = W * H, mask = new Uint8Array(N);
    for (var i = 0, p = 0; i < N; i++, p += 4) {
      var hsv = rgb2hsv(d[p], d[p + 1], d[p + 2]);
      if (hsv[0] >= params.hmin && hsv[0] <= params.hmax && hsv[1] * 100 >= params.smin && hsv[2] * 100 >= params.vmin) mask[i] = 1;
    }
    // つながった塊に分ける
    var label = new Int32Array(N), comps = [], stack = [];
    for (var s = 0; s < N; s++) {
      if (!mask[s] || label[s]) continue;
      var id = comps.length + 1, c = { id: id, area: 0, x0: W, x1: 0, y0: H, y1: 0 };
      label[s] = id; stack.push(s);
      while (stack.length) {
        var q = stack.pop(), x = q % W, y = (q / W) | 0;
        c.area++; if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
        if (x > 0 && mask[q - 1] && !label[q - 1]) { label[q - 1] = id; stack.push(q - 1); }
        if (x < W - 1 && mask[q + 1] && !label[q + 1]) { label[q + 1] = id; stack.push(q + 1); }
        if (y > 0 && mask[q - W] && !label[q - W]) { label[q - W] = id; stack.push(q - W); }
        if (y < H - 1 && mask[q + W] && !label[q + W]) { label[q + W] = id; stack.push(q + W); }
      }
      comps.push(c);
    }
    var minArea = N * 0.004, segs = [];
    comps.forEach(function (c) {
      if (c.area < minArea) return;
      // 行ごとの幅 → 細い所（凸の部分）でブロックを分ける
      var rows = [], maxW = 0, y, x;
      for (y = c.y0; y <= c.y1; y++) {
        var w = 0;
        for (x = c.x0; x <= c.x1; x++) if (label[y * W + x] === c.id) w++;
        rows.push(w); if (w > maxW) maxW = w;
      }
      var thr = maxW * NECK, runStart = -1;
      for (var k = 0; k <= rows.length; k++) {
        var wide = k < rows.length && rows[k] >= thr;
        if (wide && runStart < 0) runStart = k;
        if (!wide && runStart >= 0) {
          if (k - runStart >= 6) segs.push(makeSeg(label, W, c, c.y0 + runStart, c.y0 + k - 1));
          runStart = -1;
        }
      }
    });
    segs.sort(function (a, b) { return a.y0 - b.y0; });
    return { mask: mask, segs: segs };
  }

  function makeSeg(label, W, c, y0, y1) {
    var x0 = c.x1, x1 = c.x0, x, y;
    for (y = y0; y <= y1; y++) for (x = c.x0; x <= c.x1; x++) if (label[y * W + x] === c.id) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
    var bw = x1 - x0 + 1, bh = y1 - y0 + 1, feat = new Float32Array(GRID * GRID), cnt = new Float32Array(GRID * GRID);
    for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) {
      var gx = Math.min(GRID - 1, ((x - x0) / bw * GRID) | 0), gy = Math.min(GRID - 1, ((y - y0) / bh * GRID) | 0);
      cnt[gy * GRID + gx]++; if (label[y * W + x] === c.id) feat[gy * GRID + gx]++;
    }
    for (var i = 0; i < feat.length; i++) feat[i] = cnt[i] ? feat[i] / cnt[i] : 0;
    return { x0: x0, x1: x1, y0: y0, y1: y1, feat: Array.from(feat), aspect: bw / bh };
  }

  function distance(seg, t) {
    var s = 0;
    for (var i = 0; i < seg.feat.length; i++) { var d = seg.feat[i] - t.feat[i]; s += d * d; }
    return Math.sqrt(s / seg.feat.length) + 0.25 * Math.abs(Math.log(seg.aspect / t.aspect));
  }
  function classify(seg) {
    if (!templates) return { name: "？", dist: 1 };
    var best = "？", bd = 9, second = 9;
    LEARN_ORDER.forEach(function (n) {
      var d = distance(seg, templates[n]);
      if (d < bd) { second = bd; bd = d; best = n; } else if (d < second) second = d;
    });
    // 絶対的にかけ離れている、または2番目とほとんど差がないときは「？」にする
    var unsure = bd > UNKNOWN_DIST || second - bd < MARGIN;
    return { name: unsure ? "？" : best, dist: bd, second: second, guess: best };
  }

  /* ---------- 画面に出す ---------- */
  function frameSize(sw, sh) {
    var rot = params.rot, w = rot % 180 ? sh : sw, h = rot % 180 ? sw : sh, k = P / Math.max(w, h);
    return { pw: Math.round(w * k), ph: Math.round(h * k) };
  }
  function drawSource(src, sw, sh) {
    var f = frameSize(sw, sh), rot = params.rot * Math.PI / 180;
    work.width = f.pw; work.height = f.ph;
    shot.width = f.pw * 2; shot.height = f.ph * 2;
    overlay.width = f.pw; overlay.height = f.ph;
    [workCtx, shotCtx].forEach(function (cx, i) {
      var k = i ? 2 : 1;
      cx.save(); cx.setTransform(1, 0, 0, 1, 0, 0); cx.translate(f.pw * k / 2, f.ph * k / 2); cx.rotate(rot);
      var dw = (params.rot % 180 ? f.ph : f.pw) * k, dh = (params.rot % 180 ? f.pw : f.ph) * k;
      cx.drawImage(src, -dw / 2, -dh / 2, dw, dh); cx.restore();
    });
    $("stage").style.aspectRatio = f.pw + " / " + f.ph;
    shot.style.opacity = 1;
    return f;
  }

  // 傾き補正：読めないブロックがあるとき、画像を少しずつ回して一番よく読める角度を探す
  var tilt = 0, lastSearch = 0, tmp = document.createElement("canvas"), tmpCtx = tmp.getContext("2d", { willReadFrequently: true });
  function process(f, angle) {
    var data;
    if (!angle) data = workCtx.getImageData(0, 0, f.pw, f.ph);
    else {
      tmp.width = f.pw; tmp.height = f.ph;
      tmpCtx.fillStyle = "#000"; tmpCtx.fillRect(0, 0, f.pw, f.ph);
      tmpCtx.save(); tmpCtx.translate(f.pw / 2, f.ph / 2); tmpCtx.rotate(angle * Math.PI / 180); tmpCtx.drawImage(work, -f.pw / 2, -f.ph / 2); tmpCtx.restore();
      data = tmpCtx.getImageData(0, 0, f.pw, f.ph);
    }
    var res = analyze(data, f.pw, f.ph), unsure = 0, sum = 0;
    res.segs.forEach(function (sg) { sg.cls = classify(sg); if (sg.cls.name === "？") unsure++; sum += sg.cls.dist; });
    res.unsure = unsure; res.angle = angle;
    res.score = res.segs.length ? unsure + sum / res.segs.length : 9;
    return res;
  }

  function tick() {
    var src, sw, sh;
    if (mode === "camera") { if (video.readyState < 2) return; src = video; sw = video.videoWidth; sh = video.videoHeight; }
    else if (mode === "sample") { src = sample; sw = sample.naturalWidth; sh = sample.naturalHeight; }
    else return;
    var f = drawSource(src, sw, sh);
    var res = process(f, tilt), now = Date.now();
    if (res.unsure && templates && now - lastSearch > 500) {
      lastSearch = now;
      [-2, 2, -4, 4, -6, 6, -8, 8, -10, 10].forEach(function (a) {
        var r = process(f, a);
        if (r.segs.length === res.segs.length && r.score < res.score - 0.03) res = r;
      });
      tilt = res.angle;
    }

    ovCtx.clearRect(0, 0, f.pw, f.ph);
    ovCtx.save();
    ovCtx.translate(f.pw / 2, f.ph / 2); ovCtx.rotate(-res.angle * Math.PI / 180); ovCtx.translate(-f.pw / 2, -f.ph / 2);
    if ($("show-mask").checked) {
      var im = ovCtx.createImageData(f.pw, f.ph);
      for (var i = 0; i < res.mask.length; i++) if (res.mask[i]) { im.data[i * 4] = 91; im.data[i * 4 + 1] = 194; im.data[i * 4 + 2] = 231; im.data[i * 4 + 3] = 150; }
      tmp.width = f.pw; tmp.height = f.ph; tmpCtx.putImageData(im, 0, 0); ovCtx.drawImage(tmp, 0, 0);
    }
    var names = [];
    ovCtx.lineWidth = 2; ovCtx.font = "700 16px 'Noto Sans JP', sans-serif"; ovCtx.textBaseline = "top";
    res.segs.forEach(function (s) {
      var c = s.cls; names.push(c.name);
      ovCtx.strokeStyle = c.name === "？" ? "#ef7d70" : "#4fbf94";
      ovCtx.strokeRect(s.x0, s.y0, s.x1 - s.x0 + 1, s.y1 - s.y0 + 1);
      var label = c.name + " " + c.dist.toFixed(2), tw = ovCtx.measureText(label).width + 8;
      ovCtx.fillStyle = c.name === "？" ? "#ef7d70" : "#1f8f5f"; ovCtx.fillRect(s.x0, s.y0, tw, 20);
      ovCtx.fillStyle = "#fff"; ovCtx.fillText(label, s.x0 + 4, s.y0 + 2);
    });
    ovCtx.restore();
    lastSegs = res.segs;
    settle(names);
  }
  var lastSegs = [];

  // 同じ結果が続いたら「読めた」とする（手ぶれ対策）
  function settle(names) {
    var key = names.join(",");
    if (key === pending) pendingN++; else { pending = key; pendingN = 1; }
    if ((pendingN >= 3 || mode === "sample") && key !== committed) { committed = key; current = names; renderProgram(); }
  }
  function renderProgram() {
    var ol = $("program");
    if (!current.length) { ol.innerHTML = '<li class="empty">ブロックが見つかりません</li>'; }
    else ol.innerHTML = current.map(function (n) { return '<li class="' + (n === "？" ? "unk" : "") + '">' + n + "</li>"; }).join("");
    updateSend();
  }

  /* ---------- 読み取りの開始・停止 ---------- */
  function stopStream() { if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; } }
  function setMode(m) {
    mode = m; clearInterval(timer);
    $("placeholder").hidden = m !== "none";
    committed = pending = ""; pendingN = 0;
    if (m !== "none") { timer = setInterval(tick, m === "camera" ? 200 : 400); setTimeout(tick, 30); }
  }
  function camMsg(t, cls) { var e = $("cam-msg"); e.textContent = t; e.className = "msg " + (cls || ""); }

  $("btn-cam").addEventListener("click", function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { camMsg("このブラウザではカメラを使えません。HTTPSのページで、ChromeかEdgeで開いてください。", "err"); return; }
    stopStream();
    var cons = { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false };
    var sel = $("cams"); if (!sel.hidden && sel.value) cons.video = { deviceId: { exact: sel.value }, width: { ideal: 1280 } };
    navigator.mediaDevices.getUserMedia(cons).then(function (s) {
      stream = s; video.srcObject = s; return video.play();
    }).then(function () {
      camMsg("カメラを読み取り中です。", "ok"); setMode("camera"); listCams();
    }).catch(function (e) {
      camMsg(e && e.name === "NotAllowedError" ? "カメラの許可がありません。アドレスバーのカメラのマークから許可してください。" : "カメラを開けませんでした。（" + (e && e.name) + "）", "err");
    });
  });
  function listCams() {
    navigator.mediaDevices.enumerateDevices().then(function (list) {
      var cams = list.filter(function (d) { return d.kind === "videoinput"; }), sel = $("cams");
      if (cams.length < 2) return;
      var cur = stream && stream.getVideoTracks()[0].getSettings().deviceId;
      sel.innerHTML = cams.map(function (c, i) { return '<option value="' + c.deviceId + '"' + (c.deviceId === cur ? " selected" : "") + ">" + (c.label || "カメラ " + (i + 1)) + "</option>"; }).join("");
      sel.hidden = false;
    });
  }
  $("cams").addEventListener("change", function () { $("btn-cam").click(); });

  $("btn-sample").addEventListener("click", function () {
    stopStream(); camMsg("");
    sample.onload = function () {
      setMode("sample");
      if (!templates) { setTimeout(function () { learn(true); }, 120); }
    };
    sample.src = "sample-chain.png?" + Date.now();
  });

  /* ---------- 形を覚える ---------- */
  function learn(auto) {
    var segs = lastSegs;
    if (segs.length !== LEARN_ORDER.length) {
      $("learn-msg").textContent = "4つ見つかりませんでした（" + segs.length + "個）。上から 後ろ・右・前・左 の順に4つつなげて、もう一度押してください。";
      return;
    }
    templates = {};
    LEARN_ORDER.forEach(function (n, i) { templates[n] = { feat: segs[i].feat, aspect: segs[i].aspect }; });
    try { localStorage.setItem(TKEY, JSON.stringify(templates)); } catch (e) {}
    $("learn-msg").textContent = auto ? "サンプル画像で形を覚えました。カメラでは、実物を並べて「この4つを覚える」を押し直してください。" : "4つの形を覚えました。";
    committed = ""; tick();
  }
  $("btn-learn").addEventListener("click", function () { if (mode === "none") { $("learn-msg").textContent = "先にカメラかサンプル画像を始めてください。"; return; } learn(false); });

  /* ---------- 動きの見本 ---------- */
  var sim = $("sim"), sx = sim.getContext("2d"), CELL = 40, SIMN = 9, simTimer = null;
  var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  function colors() { var cs = getComputedStyle(document.documentElement); return { line: cs.getPropertyValue("--line").trim() || "#ccc", orange: "#f7931e", blue: "#5bc2e7" }; }
  function drawSim(path, pos, dir) {
    var c = colors(); sx.clearRect(0, 0, sim.width, sim.height);
    sx.strokeStyle = c.line; sx.lineWidth = 1;
    for (var i = 0; i <= SIMN; i++) { sx.beginPath(); sx.moveTo(i * CELL, 0); sx.lineTo(i * CELL, SIMN * CELL); sx.moveTo(0, i * CELL); sx.lineTo(SIMN * CELL, i * CELL); sx.stroke(); }
    sx.strokeStyle = c.blue; sx.lineWidth = 4; sx.lineCap = "round"; sx.lineJoin = "round"; sx.beginPath();
    path.forEach(function (p, k) { var x = p[0] * CELL + CELL / 2, y = p[1] * CELL + CELL / 2; k ? sx.lineTo(x, y) : sx.moveTo(x, y); }); sx.stroke();
    sx.save(); sx.translate(pos[0] * CELL + CELL / 2, pos[1] * CELL + CELL / 2); sx.rotate(dir * Math.PI / 2);
    sx.fillStyle = c.orange; sx.beginPath(); sx.moveTo(0, -15); sx.lineTo(12, 12); sx.lineTo(0, 6); sx.lineTo(-12, 12); sx.closePath(); sx.fill(); sx.restore();
  }
  function runSim(names) {
    clearInterval(simTimer);
    var pos = [4, 4], dir = 0, path = [pos.slice()], k = 0;
    drawSim(path, pos, dir);
    simTimer = setInterval(function () {
      if (k >= names.length) { clearInterval(simTimer); return; }
      var n = names[k++];
      if (n === "右") dir = (dir + 1) % 4; else if (n === "左") dir = (dir + 3) % 4;
      else if (n === "前" || n === "後") {
        var s = n === "前" ? 1 : -1;
        pos = [Math.max(0, Math.min(SIMN - 1, pos[0] + DIRS[dir][0] * s)), Math.max(0, Math.min(SIMN - 1, pos[1] + DIRS[dir][1] * s))]; path.push(pos.slice());
      }
      drawSim(path, pos, dir);
    }, 550);
  }
  $("btn-sim").addEventListener("click", function () { runSim(current.filter(function (n) { return n !== "？"; })); });
  drawSim([[4, 4]], [4, 4], 0);

  /* ---------- Bluetoothで送る ---------- */
  var chr = null, device = null;
  function bleMsg(t, cls) { var e = $("ble-msg"); e.textContent = t; e.className = "msg " + (cls || ""); }
  function updateSend() { $("btn-send").disabled = !(chr && current.length && current.indexOf("？") < 0); }
  $("btn-ble").addEventListener("click", function () {
    if (!navigator.bluetooth) { bleMsg("このブラウザはBluetoothに対応していません。Chromebook・Windows・AndroidのChromeかEdgeで開いてください（iPadのSafariは使えません）。", "err"); return; }
    var svc = $("svc").value.trim().toLowerCase(), uuid = $("chr").value.trim().toLowerCase();
    bleMsg("ロボットをさがしています…");
    navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [svc] }).then(function (d) {
      device = d; d.addEventListener("gattserverdisconnected", function () { chr = null; updateSend(); bleMsg("ロボットとの接続が切れました。", "err"); });
      return d.gatt.connect();
    }).then(function (s) { return s.getPrimaryService(svc); })
      .then(function (s) { return s.getCharacteristic(uuid); })
      .then(function (c) { chr = c; bleMsg("つながりました：" + (device.name || "ロボット"), "ok"); updateSend(); })
      .catch(function (e) { chr = null; updateSend(); bleMsg(e && e.name === "NotFoundError" ? "ロボットが選ばれませんでした、またはUUIDが合っていません。" : "つなげませんでした。（" + (e && e.message) + "）", "err"); });
  });
  $("btn-send").addEventListener("click", function () {
    if (!chr) return;
    var text = current.map(function (n) { return CODES[n]; }).join("") + "\n", bytes = new TextEncoder().encode(text), i = 0;
    (function next() {
      if (i >= bytes.length) { bleMsg("送りました：" + text.trim(), "ok"); return; }
      var part = bytes.slice(i, i + 20); i += 20;
      var w = chr.writeValueWithoutResponse ? chr.writeValueWithoutResponse(part) : chr.writeValue(part);
      w.then(next).catch(function (e) { bleMsg("送れませんでした。（" + (e && e.message) + "）", "err"); });
    })();
  });

  /* ---------- 調整つまみ ---------- */
  [["h-min", "hmin", "o-hmin"], ["h-max", "hmax", "o-hmax"], ["s-min", "smin", "o-smin"], ["v-min", "vmin", "o-vmin"]].forEach(function (a) {
    $(a[0]).addEventListener("input", function () { params[a[1]] = +this.value; $(a[2]).textContent = this.value; if (mode !== "none") tick(); });
  });
  $("rot").addEventListener("change", function () { params.rot = +this.value; if (mode !== "none") tick(); });
  $("show-mask").addEventListener("change", function () { if (mode !== "none") tick(); });

  // ページのURLに #sample を付けると、最初からサンプル画像で始まる
  if (location.hash === "#sample") $("btn-sample").click();
})();
