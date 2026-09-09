import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const loading = $('loading');
const buttons = ['home', 'top', 'rotate'].map($);
buttons.forEach((button) => { button.disabled = true; });
$('retry').addEventListener('click', () => location.reload());
function failure(message) {
  loading.hidden = false;
  $('loading-title').textContent = '暂时没能打开模型';
  $('loading-detail').textContent = message;
  $('progress').hidden = true;
  $('retry').hidden = false;
  buttons.forEach((button) => { button.disabled = true; });
}
function notify(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  setTimeout(() => { $('toast').hidden = true; }, 3500);
}
const dialog = $('share-dialog');
$('share').addEventListener('click', () => dialog.showModal());
$('close-share').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
$('copy-link').addEventListener('click', async () => {
  const url = new URL('./', location.href).href;
  try { await navigator.clipboard.writeText(url); $('copy-status').textContent = '链接已复制，可以发给亲友了'; }
  catch { $('copy-status').textContent = url; }
});
function updateFullscreen() {
  const active = Boolean(document.fullscreenElement) || app.classList.contains('immersive');
  $('fullscreen').classList.toggle('active', active);
  $('fullscreen').setAttribute('aria-pressed', String(active));
  $('fullscreen').querySelector('span').textContent = active ? '退出全屏' : '全屏';
}
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (app.requestFullscreen && !app.classList.contains('immersive')) await app.requestFullscreen();
    else app.classList.toggle('immersive');
  } catch { app.classList.toggle('immersive'); }
  updateFullscreen();
});
document.addEventListener('fullscreenchange', updateFullscreen);

try { startViewer(); } catch (error) { console.error(error); failure('浏览器暂不支持三维显示，请使用新版 Safari、Chrome 或 Edge 重试。'); }

function startViewer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setClearColor(0xeeebe4);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  $('viewport').appendChild(renderer.domElement);
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', '院落三维视图；鼠标或触屏旋转缩放，方向键平移');
  renderer.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); failure('三维显示已中断，请关闭其他占用内存的页面后重新加载。'); });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 2000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotateSpeed = 0.6;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.listenToKeyEvents(renderer.domElement);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.7;
  room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xfff5de, 0x7b8478, 1.5));
  const sun = new THREE.DirectionalLight(0xfff1d7, 2.6);
  sun.position.set(-10, 25, 18); scene.add(sun);
  let size, center, ready = false, dirty = true;
  let lastFrame = 0;
  const setActiveView = (id) => ['home', 'top'].forEach((name) => { $(name).classList.toggle('active', name === id); $(name).setAttribute('aria-pressed', String(name === id)); });
  function stopRotation() { controls.autoRotate = false; $('rotate').classList.remove('active'); $('rotate').setAttribute('aria-pressed', 'false'); }
  function fit(view = 'home') {
    if (!ready) return;
    stopRotation();
    const aspect = renderer.domElement.clientWidth / renderer.domElement.clientHeight;
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const radius = size.length() * 0.5;
    const direction = view === 'top' ? new THREE.Vector3(0, 1, 0.001).normalize() : new THREE.Vector3(-0.85, 1.5, 1.5).normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    let distance = 0;
    for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
      const corner = new THREE.Vector3(size.x * x, size.y * y, size.z * z);
      const depth = corner.dot(direction);
      distance = Math.max(distance,
        Math.abs(corner.dot(right)) / (Math.tan(halfFov) * aspect * 0.88) + depth,
        Math.abs(corner.dot(up)) / (Math.tan(halfFov) * 0.65) + depth);
    }
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(direction, distance);
    controls.minDistance = radius * 0.035;
    controls.maxDistance = distance * 3;
    camera.near = radius / 1000;
    camera.far = distance * 20;
    camera.updateProjectionMatrix();
    controls.update();
    setActiveView(view);
    $('view-name').textContent = view === 'top' ? '院落俯视' : '院落全景';
    dirty = true;
  }
  function resize() {
    renderer.setSize(app.clientWidth, app.clientHeight);
    camera.aspect = app.clientWidth / app.clientHeight;
    camera.updateProjectionMatrix();
    dirty = true;
  }
  new ResizeObserver(resize).observe(app); resize();
  controls.addEventListener('change', () => { dirty = true; });
  controls.addEventListener('start', () => { stopRotation(); setActiveView(null); $('view-name').textContent = '自由探索'; });
  $('home').addEventListener('click', () => fit('home'));
  $('top').addEventListener('click', () => fit('top'));
  $('rotate').addEventListener('click', () => {
    controls.autoRotate = !controls.autoRotate;
    $('rotate').classList.toggle('active', controls.autoRotate);
    $('rotate').setAttribute('aria-pressed', String(controls.autoRotate));
    $('view-name').textContent = controls.autoRotate ? '慢慢看看老家' : '自由探索';
    dirty = true;
  });
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.load(`${import.meta.env.BASE_URL}model.glb`, (gltf) => {
    const model = gltf.scene;
    scene.add(model);
    const bounds = new THREE.Box3().setFromObject(model);
    size = bounds.getSize(new THREE.Vector3());
    center = bounds.getCenter(new THREE.Vector3());
    ready = true; fit();
    loading.hidden = true;
    buttons.forEach((button) => { button.disabled = false; });
    app.dataset.loaded = 'true';
    app.dataset.triangles = String(renderer.info.render.triangles);
    // Read-only diagnostics for publication checks.
    window.viewerDiagnostics = () => ({ loaded: ready, triangles: renderer.info.render.triangles, calls: renderer.info.render.calls, camera: camera.position.toArray(), target: controls.target.toArray(), bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, autoRotate: controls.autoRotate });
  }, (event) => {
    if (event.total) {
      const percent = Math.round(event.loaded / event.total * 100);
      $('progress').value = percent;
      $('loading-detail').textContent = percent === 100 ? '正在展开房屋与院落…' : `已加载 ${percent}% · 首次打开请稍候`;
    }
  }, (error) => { console.error(error); failure('模型下载失败，请检查网络连接后重试。'); });
  renderer.setAnimationLoop((time) => {
    if (document.hidden) return;
    const delta = Math.min((time - lastFrame) / 1000, 0.05); lastFrame = time;
    controls.update(delta);
    if (dirty || controls.autoRotate) { renderer.render(scene, camera); dirty = false; }
  });
}
