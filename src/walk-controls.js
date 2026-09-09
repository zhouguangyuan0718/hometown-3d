import { Euler, MathUtils, Vector3 } from 'three';
import { WalkGrid } from './walk-grid.js';

export class WalkControls {
  constructor({ camera, canvas, pad, data, invalidate, paused }) {
    this.camera = camera;
    this.canvas = canvas;
    this.grid = new WalkGrid(data);
    this.invalidate = invalidate;
    this.paused = paused;
    this.active = false;
    this.position = new Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.keys = new Set();
    this.touches = new Map();
    this.drag = null;
    this.rotation = new Euler(0, 0, 0, 'YXZ');
    this.eyeY = 0;
    this.keyMap = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyQ: 'turnLeft', KeyE: 'turnRight', ShiftLeft: 'fast', ShiftRight: 'fast' };

    window.addEventListener('keydown', event => {
      if (!this.active || this.paused()) return;
      const action = this.keyMap[event.code];
      if (action) { event.preventDefault(); this.keys.add(event.code); }
    });
    window.addEventListener('keyup', event => { this.keys.delete(event.code); });
    window.addEventListener('blur', () => this.clearInput());
    document.addEventListener('visibilitychange', () => this.clearInput());

    canvas.addEventListener('pointerdown', event => {
      if (!this.active || this.paused() || this.drag || event.button !== 0) return;
      event.preventDefault();
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
      canvas.focus({ preventScroll: true });
    });
    canvas.addEventListener('pointermove', event => {
      if (!this.active || this.paused() || this.drag?.id !== event.pointerId) return;
      this.yaw -= (event.clientX - this.drag.x) * 0.0035;
      this.pitch = MathUtils.clamp(this.pitch - (event.clientY - this.drag.y) * 0.0035, -1.15, 1.15);
      this.drag.x = event.clientX; this.drag.y = event.clientY;
      this.applyView(0);
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, event => { if (this.drag?.id === event.pointerId) this.drag = null; });
    canvas.addEventListener('contextmenu', event => { if (this.active) event.preventDefault(); });

    for (const button of pad.querySelectorAll('[data-move]')) {
      button.addEventListener('pointerdown', event => {
        if (!this.active || this.paused()) return;
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        this.touches.set(event.pointerId, button.dataset.move);
        button.classList.add('pressed');
      });
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, event => {
        this.touches.delete(event.pointerId); button.classList.remove('pressed');
      });
    }
    this.pad = pad;
  }

  clearInput() {
    this.keys.clear(); this.touches.clear(); this.drag = null;
    this.pad.querySelectorAll('.pressed').forEach(button => button.classList.remove('pressed'));
  }

  enter() {
    this.active = true;
    this.reset();
    this.canvas.focus({ preventScroll: true });
  }

  reset() {
    this.clearInput();
    this.position.fromArray(this.grid.data.spawn);
    this.yaw = this.grid.data.spawnYaw;
    this.pitch = 0.02;
    this.eyeY = this.position.y + this.grid.data.eyeHeight;
    this.camera.fov = 70;
    this.camera.near = 0.025;
    this.camera.far = 300;
    this.camera.updateProjectionMatrix();
    this.applyView(0);
  }

  exit() { this.active = false; this.clearInput(); }

  applyView(delta) {
    const desiredY = this.position.y + this.grid.data.eyeHeight;
    if (delta) this.eyeY = MathUtils.damp(this.eyeY, desiredY, 14, delta);
    this.camera.position.set(this.position.x, this.eyeY, this.position.z);
    this.rotation.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this.rotation);
    this.invalidate();
  }

  update(delta) {
    if (!this.active) return;
    if (this.paused()) { this.clearInput(); return; }
    const input = new Set([...this.keys].map(key => this.keyMap[key]).concat([...this.touches.values()]));
    const turn = Number(input.has('turnLeft')) - Number(input.has('turnRight'));
    if (turn) this.yaw += turn * delta * 1.5;
    const forward = Number(input.has('forward')) - Number(input.has('back'));
    const right = Number(input.has('right')) - Number(input.has('left'));
    let moved = false;
    if (forward || right) {
      const speed = (input.has('fast') ? 3.2 : 2) * delta / Math.hypot(forward, right);
      const dx = (-Math.sin(this.yaw) * forward + Math.cos(this.yaw) * right) * speed;
      const dz = (-Math.cos(this.yaw) * forward - Math.sin(this.yaw) * right) * speed;
      moved = this.grid.move(this.position, dx, dz);
    }
    if (moved || turn || Math.abs(this.eyeY - this.position.y - this.grid.data.eyeHeight) > 0.001) this.applyView(delta);
  }

  diagnostics() {
    return { active: this.active, position: this.position.toArray(), yaw: this.yaw, pitch: this.pitch, eyeHeight: this.grid.data.eyeHeight, cell: this.grid.cell(this.position.x, this.position.z) };
  }
}
