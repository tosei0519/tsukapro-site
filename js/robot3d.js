// ロボットの全パーツ（外装5つ＋基板）が、スクロールで「ばらばら → 分解図 → 1台に組み上がる」。
// 部品名を押すと光る。ドラッグで回転、ボタン／Ctrl+ホイール／ピンチでズーム。「内部」で外装を透かす。
import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const section = document.getElementById("parts");
const canvas = document.getElementById("robot");
if (section && canvas) init().catch(() => { section.hidden = true; });

/* 組み上がったときの位置（mm）。印刷データは、高さ(z)の位置が失われているので、
   重ね方は「推定」です。実機と違うときは、ここの数字を変えてください。
   z = その部品の下面の高さ。flip = 上下をひっくり返して取り付ける。x,y は印刷データの位置をそのまま使う。 */
const ASSEMBLY = {
  "1_chassis.stl":     { z: 0 },                 // 土台（脚が下、板が上）
  "3_motor_cap.stl":   { z: 15.5 },              // 土台の下側、中央
  "2_cover.stl":       { z: 21.5, flip: true },  // 上の板。柱を下向きにして、土台に立てる
  "4_battery_lid.stl": { z: 46 },                // 電池ふた（上の板の上）
  "5_visor.stl":       { z: 48 },                // バイザー
  pcb:                 { z: 22.5, x: 0, y: -29 } // 基板：土台の中央、2枚の板のあいだ
};
// 分解図のとき、組み上がりの位置から、上下にどれだけ離すか（mm）
const EXPLODE = { "3_motor_cap.stl": -85, "1_chassis.stl": -48, pcb: 6, "2_cover.stl": 52, "4_battery_lid.stl": 92, "5_visor.stl": 128 };

async function init() {
  const reduce = document.documentElement.dataset.motion === "reduce";
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 3000);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4458, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(120, 180, 160); scene.add(key);
  const rim = new THREE.DirectionalLight(0x5bc2e7, 1.4); rim.position.set(-160, 60, -120); scene.add(rim);

  const defs = [
    { id: "1_chassis.stl", name: "シャーシ", color: 0xf7931e },
    { id: "2_cover.stl", name: "カバー", color: 0x5bc2e7 },
    { id: "3_motor_cap.stl", name: "モーターキャップ", color: 0xe8eaee },
    { id: "4_battery_lid.stl", name: "電池ふた", color: 0xd9740f },
    { id: "5_visor.stl", name: "バイザー", color: 0x2b3a4a },
    { id: "pcb", name: "基板", color: 0x1f8f5f }
  ];
  const group = new THREE.Group();
  scene.add(group);
  const loader = new STLLoader();
  const baseMat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.08, transparent: true, opacity: 1, emissive: 0xf7931e, emissiveIntensity: 0 });

  // ---- 外装（STL） ----
  const stl = await Promise.all(defs.slice(0, 5).map((d) => new Promise((resolve, reject) => {
    loader.load("assets/model/" + d.id, (geo) => {
      geo.computeBoundingBox();
      const bb = geo.boundingBox.clone(), size = new THREE.Vector3(); bb.getSize(size);
      geo.center(); geo.computeVertexNormals();
      resolve({ d, geo, bb, size });
    }, undefined, reject);
  })));

  // ---- 基板（外形を押し出し、表の文字の絵を重ねる） ----
  const pcbInfo = await (await fetch("assets/model/pcb.json")).json();
  const shape = new THREE.Shape(pcbInfo.outline.map((p) => new THREE.Vector2(p[0], p[1])));
  const pcbGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.6, bevelEnabled: false });
  pcbGeo.translate(0, 0, -0.8);
  const pcb = new THREE.Mesh(pcbGeo, baseMat(0x1d6b46));
  const silkMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, depthWrite: false });
  const silk = new THREE.Mesh(new THREE.PlaneGeometry(pcbInfo.w, pcbInfo.h), silkMat);
  silk.position.z = 0.82;
  pcb.add(silk);
  new THREE.ImageLoader().load("assets/model/pcb-silk.svg", (img) => {
    const c = document.createElement("canvas"); c.width = Math.round(pcbInfo.w * 20); c.height = Math.round(pcbInfo.h * 20);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    silkMat.map = tex; silkMat.needsUpdate = true;
  });
  pcb.userData.size = new THREE.Vector3(pcbInfo.w, pcbInfo.h, 1.6);

  // ---- 部品のまとめ（名前・大きさ・位置） ----
  const parts = [];
  stl.forEach(({ d, geo, bb, size }) => {
    const mesh = new THREE.Mesh(geo, baseMat(d.color));
    const a = ASSEMBLY[d.id];
    const c = new THREE.Vector3((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, a.z + size.z / 2);
    parts.push({ d, mesh, size, asm: c, flip: !!a.flip, extra: [] });
  });
  {
    const a = ASSEMBLY.pcb;
    parts.push({ d: defs[5], mesh: pcb, size: pcb.userData.size, asm: new THREE.Vector3(a.x, a.y, a.z + 0.8), flip: false, extra: [silkMat] });
  }
  // 組み上がった全体の中心を、原点に合わせる
  const box = new THREE.Box3();
  parts.forEach((p) => {
    const hs = new THREE.Vector3(p.size.x / 2, p.size.y / 2, p.size.z / 2);
    box.expandByPoint(p.asm.clone().sub(hs)).expandByPoint(p.asm.clone().add(hs));
  });
  const center = box.getCenter(new THREE.Vector3());
  parts.forEach((p) => { p.asm.sub(center); group.add(p.mesh); });

  // 分解図の位置と、ひっくり返す向き
  const flipQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const idQ = new THREE.Quaternion();
  const rand = (n) => { const x = Math.sin(n * 91.7) * 43758.5453; return x - Math.floor(x); };
  parts.forEach((p, i) => {
    p.exploded = p.asm.clone(); p.exploded.z += EXPLODE[p.d.id] || 0;
    p.start = new THREE.Vector3((rand(i + 1) - .5) * 560, (rand(i + 7) - .5) * 420, (rand(i + 3) - .5) * 360 + p.exploded.z);
    p.startQ = new THREE.Quaternion().setFromEuler(new THREE.Euler((rand(i + 11) - .5) * 5, (rand(i + 13) - .5) * 5, (rand(i + 17) - .5) * 5));
    p.mats = [p.mesh.material].concat(p.extra);
  });

  // ---- 画面まわりの部品 ----
  const items = Array.from(document.querySelectorAll("#part-list li"));
  const info = document.getElementById("part-info");
  const HINT = "部品の名前を押すと、その部品が光ります。";
  let selected = -1, xray = false;

  function select(i) {
    selected = i === selected ? -1 : i;
    items.forEach((li, k) => li.classList.toggle("sel", k === selected));
    if (!info) return;
    if (selected < 0) { info.textContent = HINT; return; }
    const s = parts[selected].size, r = (v) => (Math.round(v * 10) / 10).toString().replace(/\.0$/, "");
    info.innerHTML = "<b>" + parts[selected].d.name + "</b><em>" + r(s.x) + " × " + r(s.y) + " × " + r(s.z) + " mm</em>" + (parts[selected].d.id === "pcb" ? "（基板のデータ）" : "（印刷データの大きさ）");
  }
  items.forEach((li, k) => li.querySelector("button").addEventListener("click", () => select(k)));
  const xr = document.getElementById("xray");
  if (xr) xr.addEventListener("click", () => { xray = !xray; xr.setAttribute("aria-pressed", xray); xr.classList.toggle("on", xray); });

  // ---- 大きさ・ドラッグ・ズーム ----
  let w = 0, h = 0, wide = true;
  const resize = () => {
    w = canvas.clientWidth; h = canvas.clientHeight;
    wide = window.innerWidth > 760;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    group.position.set(wide ? 46 : 0, wide ? 0 : -34, 0);
  };
  resize();
  window.addEventListener("resize", resize);

  let dragX = 0, dragY = 0, zoom = 1, zoomT = 1, dragging = false, lx = 0, ly = 0;
  const pointers = new Map();
  let pinch0 = 0, pinchZoom0 = 1;
  const setZoom = (z) => { zoomT = clamp(z, 0.5, 1.7); };
  canvas.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, [e.clientX, e.clientY]); canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); pinchZoom0 = zoomT; dragging = false; }
    else { dragging = true; lx = e.clientX; ly = e.clientY; }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2 && pinch0) { const [a, b] = [...pointers.values()]; setZoom(pinchZoom0 * pinch0 / Math.max(10, Math.hypot(a[0] - b[0], a[1] - b[1]))); return; }
    if (!dragging) return;
    dragX += (e.clientX - lx) * 0.008; dragY = clamp(dragY + (e.clientY - ly) * 0.006, -0.9, 0.9);
    lx = e.clientX; ly = e.clientY;
  });
  const up = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = 0; if (!pointers.size) dragging = false; };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(zoomT * (e.deltaY > 0 ? 1.06 : 0.94)); } }, { passive: false });
  canvas.addEventListener("dblclick", () => { setZoom(1); dragX = 0; dragY = 0; });
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener("click", fn); };
  on("z-in", () => setZoom(zoomT * 0.84));
  on("z-out", () => setZoom(zoomT * 1.2));
  on("z-reset", () => { setZoom(1); dragX = 0; dragY = 0; if (selected >= 0) select(selected); });

  let visible = false;
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; }).observe(section);

  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const easeIO = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  let t = 0;

  const render = () => {
    requestAnimationFrame(render);
    if (!visible || document.hidden) return;
    t += 0.016;
    zoom += (zoomT - zoom) * 0.14;
    const r = section.getBoundingClientRect();
    const q = reduce ? 1 : clamp(-r.top / (r.height - window.innerHeight), 0, 1);
    const gather = ease(clamp(q / 0.3, 0, 1));             // ばらばら → 分解図
    const close = easeIO(clamp((q - 0.38) / 0.4, 0, 1));    // 分解図 → 1台に組み上がる

    parts.forEach((p, i) => {
      const m = p.mesh;
      m.position.lerpVectors(p.start, p.exploded, gather).lerp(p.asm, close);
      // 向き：ばらばら → 印刷データの向き → （カバーは）ひっくり返して取り付け
      m.quaternion.slerpQuaternions(p.startQ, idQ, gather);
      if (p.flip) m.quaternion.slerp(flipQ, close);

      const isSel = i === selected, any = selected >= 0;
      const shell = p.d.id !== "pcb";
      const tgtOpacity = any && !isSel ? 0.16 : (xray && shell && !isSel ? 0.2 : 1);
      const tgtEmis = isSel ? 0.55 + 0.2 * Math.sin(t * 4) : 0;
      p.mats.forEach((mat) => { mat.opacity += (tgtOpacity - mat.opacity) * 0.15; });
      p.mesh.material.emissiveIntensity += (tgtEmis - p.mesh.material.emissiveIntensity) * 0.2;
      const sc = isSel ? 1.05 : 1;
      m.scale.x += (sc - m.scale.x) * 0.15; m.scale.y = m.scale.z = m.scale.x;
    });
    const shown = Math.floor(clamp((q - 0.08) / 0.45, 0, 1) * (items.length + 0.999));
    items.forEach((li, i) => li.classList.toggle("on", i < shown || reduce));

    const orbit = (reduce ? 0.6 : q * Math.PI * 1.2) + dragX + (dragging ? 0 : t * 0.06);
    const tilt = 0.5 + dragY - q * 0.15;
    const dist = (wide ? 640 : 780) * zoom * (1 - close * 0.42);
    camera.position.set(Math.sin(orbit) * dist * Math.cos(tilt), Math.sin(tilt) * dist, Math.cos(orbit) * dist * Math.cos(tilt));
    camera.lookAt(0, 0, 0);
    group.rotation.x = -Math.PI / 2;
    renderer.render(scene, camera);
  };
  render();
}
