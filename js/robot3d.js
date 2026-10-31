// ロボットの部品（3Dプリント用STL）を、スクロールに合わせて集めて見せる
import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const section = document.getElementById("parts");
const canvas = document.getElementById("robot");
if (section && canvas) init().catch(() => { section.hidden = true; });

async function init() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 2000);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4458, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(120, 180, 160); scene.add(key);
  const rim = new THREE.DirectionalLight(0x5bc2e7, 1.4); rim.position.set(-160, 60, -120); scene.add(rim);

  // 部品ごとの色（サイトのロゴ色に合わせる）
  const parts = [
    { file: "1_chassis.stl", color: 0xf7931e },
    { file: "2_cover.stl", color: 0x5bc2e7 },
    { file: "3_motor_cap.stl", color: 0xe8eaee },
    { file: "4_battery_lid.stl", color: 0xd9740f },
    { file: "5_visor.stl", color: 0x2b3a4a }
  ];
  const loader = new STLLoader();
  const group = new THREE.Group();
  scene.add(group);

  const meshes = await Promise.all(parts.map((p, i) => new Promise((resolve, reject) => {
    loader.load("assets/model/" + p.file, (geo) => {
      geo.center();
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.42, metalness: 0.08, flatShading: false });
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);
      resolve(mesh);
    }, undefined, reject);
  })));

  // 並べたときの位置（上下に重ねて広げる）。最初は遠くに散らばっている
  const GAP = 34;
  const rest = meshes.map((_, i) => new THREE.Vector3(0, 0, (i - (meshes.length - 1) / 2) * GAP));
  const rand = (n) => { const x = Math.sin(n * 91.7) * 43758.5453; return x - Math.floor(x); };
  const start = meshes.map((_, i) => new THREE.Vector3((rand(i + 1) - .5) * 520, (rand(i + 7) - .5) * 360, (rand(i + 3) - .5) * 300));
  const startRot = meshes.map((_, i) => new THREE.Euler((rand(i + 11) - .5) * 5, (rand(i + 13) - .5) * 5, (rand(i + 17) - .5) * 5));

  const items = document.querySelectorAll("#part-list li");
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

  // ドラッグで回す
  let dragX = 0, dragY = 0, dragging = false, lx = 0, ly = 0;
  canvas.addEventListener("pointerdown", (e) => { dragging = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    dragX += (e.clientX - lx) * 0.008; dragY = clamp(dragY + (e.clientY - ly) * 0.006, -0.9, 0.9);
    lx = e.clientX; ly = e.clientY;
  });
  const up = () => { dragging = false; };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);

  let visible = false;
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; }).observe(section);

  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion();
  let t = 0;

  const render = () => {
    requestAnimationFrame(render);
    if (!visible || document.hidden) return;
    t += 0.016;
    const r = section.getBoundingClientRect();
    const q = reduce ? 1 : clamp(-r.top / (r.height - window.innerHeight), 0, 1);
    const gather = ease(clamp(q / 0.5, 0, 1));
    meshes.forEach((m, i) => {
      m.position.lerpVectors(start[i], rest[i], gather);
      q0.setFromEuler(startRot[i]); q1.identity();
      m.quaternion.slerpQuaternions(q0, q1, gather);
    });
    // 部品リストを順に光らせる
    const shown = Math.floor(clamp((q - 0.1) / 0.6, 0, 1) * (items.length + 0.999));
    items.forEach((li, i) => li.classList.toggle("on", i < shown || reduce));

    // カメラは部品のまわりをゆっくり回る
    const orbit = (reduce ? 0.6 : q * Math.PI * 1.1) + dragX + (dragging ? 0 : t * 0.06);
    const tilt = 0.55 + dragY - q * 0.25;
    const dist = wide ? 520 : 640;
    camera.position.set(Math.sin(orbit) * dist * Math.cos(tilt), Math.sin(tilt) * dist, Math.cos(orbit) * dist * Math.cos(tilt));
    camera.lookAt(group.position.x * 0.0, 0, 0);
    // zを上向きに揃える（STLはz軸が厚み方向）
    group.rotation.x = -Math.PI / 2;
    renderer.render(scene, camera);
  };
  render();
}
