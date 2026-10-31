// ロボットの部品（3Dプリント用STL）を、スクロールに合わせて集めて見せる。
// 部品名を押すと、その部品が光る。ドラッグで回転、ボタン／Ctrl+ホイール／ピンチでズーム。
import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const section = document.getElementById("parts");
const canvas = document.getElementById("robot");
if (section && canvas) init().catch(() => { section.hidden = true; });

async function init() {
  const reduce = document.documentElement.dataset.motion === "reduce";
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 2000);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4458, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(120, 180, 160); scene.add(key);
  const rim = new THREE.DirectionalLight(0x5bc2e7, 1.4); rim.position.set(-160, 60, -120); scene.add(rim);

  const parts = [
    { file: "1_chassis.stl", name: "シャーシ", color: 0xf7931e },
    { file: "2_cover.stl", name: "カバー", color: 0x5bc2e7 },
    { file: "3_motor_cap.stl", name: "モーターキャップ", color: 0xe8eaee },
    { file: "4_battery_lid.stl", name: "電池ふた", color: 0xd9740f },
    { file: "5_visor.stl", name: "バイザー", color: 0x2b3a4a }
  ];
  const loader = new STLLoader();
  const group = new THREE.Group();
  scene.add(group);

  const sizes = [];
  const meshes = await Promise.all(parts.map((p) => new Promise((resolve, reject) => {
    loader.load("assets/model/" + p.file, (geo) => {
      geo.computeBoundingBox();
      const s = new THREE.Vector3(); geo.boundingBox.getSize(s); sizes.push(s);
      geo.center();
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.42, metalness: 0.08, transparent: true, opacity: 1, emissive: 0xf7931e, emissiveIntensity: 0 });
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);
      resolve(mesh);
    }, undefined, reject);
  })));

  const GAP = 34;
  const rest = meshes.map((_, i) => new THREE.Vector3(0, 0, (i - (meshes.length - 1) / 2) * GAP));
  const rand = (n) => { const x = Math.sin(n * 91.7) * 43758.5453; return x - Math.floor(x); };
  const start = meshes.map((_, i) => new THREE.Vector3((rand(i + 1) - .5) * 520, (rand(i + 7) - .5) * 360, (rand(i + 3) - .5) * 300));
  const startRot = meshes.map((_, i) => new THREE.Euler((rand(i + 11) - .5) * 5, (rand(i + 13) - .5) * 5, (rand(i + 17) - .5) * 5));

  const items = Array.from(document.querySelectorAll("#part-list li"));
  const info = document.getElementById("part-info");
  let selected = -1;

  // ---- 部品の選択（ハイライト） ----
  function select(i) {
    selected = i === selected ? -1 : i;
    items.forEach((li, k) => li.classList.toggle("sel", k === selected));
    if (!info) return;
    if (selected < 0) { info.textContent = "部品の名前を押すと、その部品が光ります。"; return; }
    const s = sizes[selected], r = (v) => Math.round(v);
    info.innerHTML = "<b>" + parts[selected].name + "</b>" +
      "<em>" + r(s.x) + " × " + r(s.y) + " × " + r(s.z) + " mm</em>（印刷データの大きさ）";
  }
  items.forEach((li, k) => {
    const b = li.querySelector("button");
    b.addEventListener("click", () => select(k));
  });

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
  const setZoom = (z) => { zoomT = clamp(z, 0.55, 1.7); };
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
  on("z-reset", () => { setZoom(1); dragX = 0; dragY = 0; select(-1); selected = -1; items.forEach((li) => li.classList.remove("sel")); if (info) info.textContent = "部品の名前を押すと、その部品が光ります。"; });

  let visible = false;
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; }).observe(section);

  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion();
  let t = 0;

  const render = () => {
    requestAnimationFrame(render);
    if (!visible || document.hidden) return;
    t += 0.016;
    zoom += (zoomT - zoom) * 0.14;
    const r = section.getBoundingClientRect();
    const q = reduce ? 1 : clamp(-r.top / (r.height - window.innerHeight), 0, 1);
    const gather = ease(clamp(q / 0.5, 0, 1));
    meshes.forEach((m, i) => {
      m.position.lerpVectors(start[i], rest[i], gather);
      q0.setFromEuler(startRot[i]); q1.identity();
      m.quaternion.slerpQuaternions(q0, q1, gather);
      // 選択中の部品は光って少し大きく、ほかは透かす
      const isSel = i === selected, any = selected >= 0;
      const mat = m.material;
      const tgtOpacity = any && !isSel ? 0.16 : 1;
      const tgtEmis = isSel ? 0.55 + 0.2 * Math.sin(t * 4) : 0;
      mat.opacity += (tgtOpacity - mat.opacity) * 0.15;
      mat.emissiveIntensity += (tgtEmis - mat.emissiveIntensity) * 0.2;
      const sc = isSel ? 1.06 : 1;
      m.scale.x += (sc - m.scale.x) * 0.15; m.scale.y = m.scale.z = m.scale.x;
    });
    const shown = Math.floor(clamp((q - 0.1) / 0.6, 0, 1) * (items.length + 0.999));
    items.forEach((li, i) => li.classList.toggle("on", i < shown || reduce));

    const orbit = (reduce ? 0.6 : q * Math.PI * 1.1) + dragX + (dragging ? 0 : t * 0.06);
    const tilt = 0.55 + dragY - q * 0.25;
    const dist = (wide ? 520 : 640) * zoom;
    camera.position.set(Math.sin(orbit) * dist * Math.cos(tilt), Math.sin(tilt) * dist, Math.cos(orbit) * dist * Math.cos(tilt));
    camera.lookAt(0, 0, 0);
    group.rotation.x = -Math.PI / 2;
    renderer.render(scene, camera);
  };
  render();
}
