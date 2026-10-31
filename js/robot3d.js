// ロボットの全パーツ（外装・基板・マイコン・電池・モーター・タイヤ）が、スクロールで「ばらばら → 分解図 → 1台に組み上がる」。
// 部品名を押すと光る。ドラッグで回転、ボタン／Ctrl+ホイール／ピンチでズーム。「内部」で外装を透かす。
import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const section = document.getElementById("parts");
const canvas = document.getElementById("robot");
if (section && canvas) init().catch(() => { section.hidden = true; });

/* 3Dデータ（assets/model/asm/*.stl）は、すべて「組み上がった位置」のまま書き出したもの（mm、z が上、+y が前）。
   なので、組み立ての位置は、データの座標そのままです。基板だけは、外形と文字の絵から作っています（位置は同じ）。
   explode = 分解図のとき、上下にどれだけ離すか（mm）。delay = 組み上がる順番（小さいほど先）。 */
const PARTS = [
  { name: "シャーシ", css: "#f7931e", explode: 0, delay: 0,
    meshes: [{ f: "chassis", color: 0x4a5160 }], shell: true },
  { name: "カバー", css: "#5bc2e7", explode: 64, delay: 0.42,
    meshes: [{ f: "cover", color: 0xf4f4f2 }], shell: true },
  { name: "モーターキャップ", css: "#e8eaee", explode: 18, delay: 0.26,
    meshes: [{ f: "motorcap", color: 0x6a7080 }], shell: true },
  { name: "電池ふた", css: "#d9740f", explode: -46, delay: 0.12,
    meshes: [{ f: "lid", color: 0xf7901e }], shell: true },
  { name: "バイザー", css: "#2b3a4a", explode: 64, delay: 0.5,
    meshes: [{ f: "visor", color: 0x2b3038 }], shell: true },
  { name: "基板・マイコン", css: "#1f8f5f", explode: 34, delay: 0.32,
    pcb: true,
    meshes: [{ f: "tb6612", color: 0x2c4e8c }, { f: "xiao", color: 0x555c66 }, { f: "switch", color: 0xd0d0d0 }] },
  { name: "電池", css: "#c8b560", explode: -22, delay: 0.06,
    meshes: [{ f: "batbox", color: 0x2a2c30 }, { f: "battery", color: 0xc8b560 }] },
  { name: "モーター・タイヤ", css: "#c0c6cc", explode: -14, delay: 0.02,
    meshes: [{ f: "motor", color: 0xc0c6cc }, { f: "tire", color: 0x34363c }] }
];
const PCB_AT = { x: 0, y: -25.85, z: 40.0 }; // 基板の中心（データのとおり）

async function init() {
  const reduce = document.documentElement.dataset.motion === "reduce";
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 3000);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4458, 1.35));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(120, 180, 160); scene.add(key);
  const rim = new THREE.DirectionalLight(0x5bc2e7, 1.4); rim.position.set(-160, 60, -120); scene.add(rim);

  const group = new THREE.Group();
  scene.add(group);
  const loader = new STLLoader();
  const baseMat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.08, transparent: true, opacity: 1, emissive: 0xf7931e, emissiveIntensity: 0 });
  const load = (f) => new Promise((res, rej) => loader.load("assets/model/asm/" + f + ".stl", (g) => { g.computeVertexNormals(); res(g); }, undefined, rej));

  // ---- 基板（外形を押し出し、表の文字の絵を重ねる） ----
  const pcbInfo = await (await fetch("assets/model/pcb.json")).json();
  const shape = new THREE.Shape(pcbInfo.outline.map((p) => new THREE.Vector2(p[0], p[1])));
  const pcbGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.6, bevelEnabled: false });
  pcbGeo.translate(PCB_AT.x, PCB_AT.y, PCB_AT.z - 0.8);
  const silkMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, depthWrite: false });
  const silkGeo = new THREE.PlaneGeometry(pcbInfo.w, pcbInfo.h);
  silkGeo.translate(PCB_AT.x, PCB_AT.y, PCB_AT.z + 0.82);
  new THREE.ImageLoader().load("assets/model/pcb-silk.svg", (img) => {
    const c = document.createElement("canvas"); c.width = Math.round(pcbInfo.w * 20); c.height = Math.round(pcbInfo.h * 20);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    silkMat.map = tex; silkMat.needsUpdate = true;
  });

  // ---- 部品のまとめ（印刷データの座標のまま、部品ごとの中心を軸にする） ----
  const parts = [];
  const gbox = new THREE.Box3();
  for (const d of PARTS) {
    const entries = [];
    for (const m of d.meshes) {
      const geo = await load(m.f);
      entries.push({ mesh: new THREE.Mesh(geo, baseMat(m.color)), geo });
    }
    if (d.pcb) {
      entries.push({ mesh: new THREE.Mesh(pcbGeo, baseMat(0x1d6b46)), geo: pcbGeo });
      entries.push({ mesh: new THREE.Mesh(silkGeo, silkMat), geo: silkGeo, extra: true });
    }
    const box = new THREE.Box3();
    entries.forEach((e) => { e.geo.computeBoundingBox(); box.union(e.geo.boundingBox); });
    gbox.union(box);
    parts.push({ d, entries, box, mats: entries.map((e) => e.mesh.material) });
  }
  const gc = gbox.getCenter(new THREE.Vector3());
  const rand = (n) => { const x = Math.sin(n * 91.7) * 43758.5453; return x - Math.floor(x); };
  parts.forEach((p, i) => {
    const pivot = new THREE.Group();
    const c = p.box.getCenter(new THREE.Vector3());
    p.size = p.box.getSize(new THREE.Vector3());
    p.entries.forEach((e) => { e.mesh.position.copy(c).negate(); pivot.add(e.mesh); });
    p.mesh = pivot;
    p.asm = c.clone().sub(gc);
    p.exploded = p.asm.clone(); p.exploded.z += p.d.explode;
    p.start = new THREE.Vector3((rand(i + 1) - .5) * 560, (rand(i + 7) - .5) * 420, (rand(i + 3) - .5) * 360 + p.exploded.z);
    p.startQ = new THREE.Quaternion().setFromEuler(new THREE.Euler((rand(i + 11) - .5) * 5, (rand(i + 13) - .5) * 5, (rand(i + 17) - .5) * 5));
    group.add(pivot);
  });
  const idQ = new THREE.Quaternion();

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
    info.innerHTML = "<b>" + parts[selected].d.name + "</b><em>" + r(s.x) + " × " + r(s.y) + " × " + r(s.z) + " mm</em>" + "（3Dデータの大きさ）";
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
    group.position.set(wide ? 70 : 0, wide ? 0 : -34, 0);
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
    const closeRaw = clamp((q - 0.36) / 0.44, 0, 1);       // 分解図 → 1台に組み上がる（部品ごとに時間をずらす）
    const close = easeIO(closeRaw);

    parts.forEach((p, i) => {
      const m = p.mesh;
      // 部品ごとに、組み上がる順番をずらす（下から順に）
      const cl = easeIO(clamp((closeRaw - p.d.delay * 0.55) / 0.45, 0, 1));
      m.position.lerpVectors(p.start, p.exploded, gather).lerp(p.asm, cl);
      m.quaternion.slerpQuaternions(p.startQ, idQ, gather);

      const isSel = i === selected, any = selected >= 0;
      const tgtOpacity = any && !isSel ? 0.16 : (xray && p.d.shell && !isSel ? 0.18 : 1);
      const tgtEmis = isSel ? 0.55 + 0.2 * Math.sin(t * 4) : 0;
      p.mats.forEach((mat) => {
        mat.opacity += (tgtOpacity - mat.opacity) * 0.15;
        if (mat.depthWrite !== undefined) mat.depthWrite = mat.opacity > 0.97 && mat !== silkMat;
        if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity += (tgtEmis - mat.emissiveIntensity) * 0.2;
      });
      const sc = isSel ? 1.05 : 1;
      m.scale.x += (sc - m.scale.x) * 0.15; m.scale.y = m.scale.z = m.scale.x;
    });
    const shown = Math.floor(clamp((q - 0.08) / 0.45, 0, 1) * (items.length + 0.999));
    items.forEach((li, i) => li.classList.toggle("on", i < shown || reduce));

    const orbit = (reduce ? 0.6 : q * Math.PI * 1.2) + dragX + (dragging ? 0 : t * 0.06);
    const tilt = 0.5 + dragY - q * 0.15;
    const dist = (wide ? 700 : 860) * zoom * (1 - close * 0.3);
    camera.position.set(Math.sin(orbit) * dist * Math.cos(tilt), Math.sin(tilt) * dist, Math.cos(orbit) * dist * Math.cos(tilt));
    camera.lookAt(0, 0, 0);
    group.rotation.x = -Math.PI / 2;
    renderer.render(scene, camera);
  };
  render();
}
