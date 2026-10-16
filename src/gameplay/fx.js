// Gameplay visuals (owner: gameplay): the ball's view (tumble, squash, settle wobble), the dotted
// launch preview and paper-bit particles. Everything here is cosmetic; physics lives in physics.js.
import * as THREE from 'three';
import { BALL_RADIUS } from '../core/layout.js';

const R = BALL_RADIUS;
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

/**
 * mesh (Group, the contract's ball.mesh) → squash (aligned to the last impact normal) → spin → prop.
 * The spin group's world orientation is kept independent of the squash alignment.
 */
export class BallView {
  constructor(prop) {
    this.mesh = new THREE.Group();
    this.mesh.name = 'letterBall';
    this.squash = new THREE.Group();
    this.spin = new THREE.Group();
    this.mesh.add(this.squash);
    this.squash.add(this.spin);
    if (prop) this.spin.add(prop);
    this.prop = prop;
    this.spinQ = new THREE.Quaternion();
    this.omega = new THREE.Vector3();       // rad/s, world
    this.sq = { amt: 0, t: 1, n: new THREE.Vector3(0, 1, 0) };
    this.wobble = { amt: 0, t: 1 };
    this.offset = new THREE.Vector3();      // visual-only offset blended out after launch
    this.mesh.visible = false;
  }
  /** Launch: tumble around the axis perpendicular to the throw; start at the hand and blend into the physics origin. */
  launch(vel, handPos, physPos) {
    _w.crossVectors(vel, _up);
    if (_w.lengthSq() < 1e-6) _w.set(1, 0, 0);
    this.omega.copy(_w.normalize()).multiplyScalar(-(6 + vel.length() * 1.6));
    this.omega.x += (Math.random() - 0.5) * 3; // cosmetic
    this.omega.z += (Math.random() - 0.5) * 3; // cosmetic
    this.offset.set(0, 0, 0);
    if (handPos && physPos && handPos.distanceTo(physPos) < 0.6) this.offset.subVectors(handPos, physPos);
    this.sq.amt = 0; this.wobble.amt = 0;
    this.spinQ.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5, 1).normalize(); // cosmetic
    this.mesh.visible = true;
  }
  impact(speed, normal) {
    const a = Math.min(0.32, speed * 0.07);
    if (a < 0.03) return;
    this.sq.amt = a; this.sq.t = 0; this.sq.n.copy(normal);
    // bounce sends the spin around the new tangent axis
    _w.copy(this.omega).multiplyScalar(0.5);
    this.omega.copy(_w);
  }
  settle() { this.wobble.amt = 0.35; this.wobble.t = 0; }
  /** Rolling on a support: spin follows the motion. */
  roll(vel, normal, dt) {
    _w.crossVectors(normal, vel).divideScalar(R);
    this.omega.lerp(_w, 1 - Math.exp(-20 * dt));
  }
  update(dt, pos, flying) {
    this.offset.multiplyScalar(Math.exp(-dt / 0.06));
    this.mesh.position.copy(pos).add(this.offset);
    if (flying) {
      const w = this.omega.length();
      if (w > 1e-4) { _q.setFromAxisAngle(_v.copy(this.omega).divideScalar(w), w * dt); this.spinQ.premultiply(_q); }
    } else this.omega.multiplyScalar(Math.exp(-8 * dt));
    // squash: damped spring along the impact normal
    let sy = 1, sxz = 1;
    if (this.sq.amt > 0) {
      this.sq.t += dt;
      const k = Math.exp(-this.sq.t * 9) * Math.cos(this.sq.t * 34);
      sy = 1 - this.sq.amt * k; sxz = 1 + this.sq.amt * 0.5 * k;
      if (this.sq.t > 0.6) this.sq.amt = 0;
    }
    _q.setFromUnitVectors(_up, this.sq.n);
    this.squash.quaternion.copy(_q);
    this.squash.scale.set(sxz, sy, sxz);
    // settle wobble: a small decaying tilt
    let wq = null;
    if (this.wobble.amt > 0) {
      this.wobble.t += dt;
      const a = this.wobble.amt * Math.exp(-this.wobble.t * 6) * Math.sin(this.wobble.t * 26);
      wq = new THREE.Quaternion().setFromAxisAngle(_v.set(1, 0, 0.4).normalize(), a);
      if (this.wobble.t > 1) this.wobble.amt = 0;
    }
    // spin group local = squash^-1 * worldSpin
    this.spin.quaternion.copy(_q).invert().multiply(wq ? wq.multiply(this.spinQ) : this.spinQ);
  }
}

/** Dotted launch preview: one Points draw call with per-dot alpha and size. */
export class TrajectoryDots {
  constructor(count = 14) {
    this.count = count;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(count), 1));
    geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(count), 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xfff3f6) }, uEdge: { value: new THREE.Color(0xff6f9a) }, uScale: { value: 400 } },
      vertexShader: `
        attribute float alpha; attribute float size; varying float vA; uniform float uScale;
        void main() { vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uScale / max(0.05, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        varying float vA; uniform vec3 uColor; uniform vec3 uEdge;
        void main() { vec2 p = gl_PointCoord * 2.0 - 1.0; float r = dot(p, p); if (r > 1.0) discard;
          vec3 c = mix(uColor, uEdge, smoothstep(0.45, 0.9, r)); gl_FragColor = vec4(c, vA * (1.0 - smoothstep(0.85, 1.0, r))); }`,
      transparent: true, depthWrite: false, depthTest: true,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.points.visible = false;
    this.points.name = 'trajectoryDots';
  }
  /** pts: [{x,y,z,t}] (first ~0.35 s of the arc). */
  set(pts, renderer) {
    const pos = this.points.geometry.attributes.position, al = this.points.geometry.attributes.alpha, sz = this.points.geometry.attributes.size;
    const n = Math.min(this.count, pts.length);
    for (let i = 0; i < this.count; i++) {
      const p = pts[Math.min(i, pts.length - 1)] || { x: 0, y: -10, z: 0 };
      pos.setXYZ(i, p.x, p.y, p.z);
      const k = i / Math.max(1, this.count - 1);
      al.setX(i, i < n ? 0.95 * (1 - k) ** 1.3 : 0);
      sz.setX(i, 0.036 * (1 - 0.5 * k));
    }
    pos.needsUpdate = al.needsUpdate = sz.needsUpdate = true;
    if (renderer) this.material.uniforms.uScale.value = renderer.domElement.height * 0.5 * 1.43; // ≈ h/2 / tan(fov/2) at fov 70
    this.points.visible = true;
  }
  hide() { this.points.visible = false; }
}

/** Little paper scraps on impacts (instanced quads, one draw call). */
export class PaperBits {
  constructor(max = 48) {
    this.max = max;
    const geo = new THREE.PlaneGeometry(0.014, 0.011);
    const mat = new THREE.MeshLambertMaterial({ color: 0xfffaf2, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.name = 'paperBits';
    this.p = [];
    this._m = new THREE.Matrix4(); this._s = new THREE.Vector3(); this._e = new THREE.Euler();
  }
  burst(pos, normal, n, speed = 1.5) {
    for (let i = 0; i < n; i++) {
      if (this.p.length >= this.max) this.p.shift();
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize(); // cosmetic
      if (normal) d.addScaledVector(normal, 0.9).normalize();
      this.p.push({
        pos: pos.clone(), vel: d.multiplyScalar(speed * (0.4 + Math.random() * 0.8)), // cosmetic
        rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6), // cosmetic
        spin: new THREE.Vector3(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7), // cosmetic
        life: 0, max: 0.7 + Math.random() * 0.6, // cosmetic
      });
    }
  }
  clear() { this.p.length = 0; this.mesh.count = 0; }
  update(dt) {
    if (!this.p.length) { this.mesh.count = 0; return; }
    let j = 0;
    for (const q of this.p) {
      q.life += dt;
      q.vel.y -= 3.2 * dt;               // flutters down slowly
      q.vel.multiplyScalar(Math.exp(-3 * dt));
      q.pos.addScaledVector(q.vel, dt);
      if (q.pos.y < 0.005) { q.pos.y = 0.005; q.vel.set(0, 0, 0); }
      q.rot.x += q.spin.x * dt; q.rot.y += q.spin.y * dt; q.rot.z += q.spin.z * dt;
      const s = Math.max(0, 1 - Math.max(0, q.life - q.max * 0.6) / (q.max * 0.4));
      this._m.compose(q.pos, new THREE.Quaternion().setFromEuler(q.rot), this._s.set(s, s, s));
      this.mesh.setMatrixAt(j++, this._m);
    }
    this.p = this.p.filter((q) => q.life < q.max);
    this.mesh.count = j;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
