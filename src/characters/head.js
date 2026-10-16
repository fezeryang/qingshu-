// Head geometry with a face-centred azimuthal UV projection: the whole face canvas maps onto the
// front of the skull, the back of the head maps to the skin-coloured outer ring of the canvas.
import * as THREE from 'three';
import { Builder, M, sphere, cyl } from './geo.js';

export const HEAD = { R: 0.2, C: [0, 0.18, 0], scale: [1.0, 0.93, 0.96], tilt: 0.12 };
const TH1 = THREE.MathUtils.degToRad(75);
const R1 = 0.44;
/** polar angle from face centre → canvas radius (uv units) */
export const mapR = (th) => (th <= TH1 ? (R1 * th) / TH1 : R1 + ((0.5 - 0.005 - R1) * (th - TH1)) / (Math.PI - TH1));
/** canvas px per degree near the face centre for a canvas of size S */
export const pxPerDeg = (S) => (R1 * S) / 75;
export const SKIN_UV = [0.985, 0.985];

const rotFace = new THREE.Matrix4().makeRotationX(-(Math.PI / 2 + HEAD.tilt));

/** Unit direction (pre-scale, head space) → deformed surface point (head-bone local). */
export function shapePoint(d, out = new THREE.Vector3(), extra = 0) {
  const lower = THREE.MathUtils.smoothstep(-d.y, 0.05, 0.95);
  const front = THREE.MathUtils.smoothstep(-d.z, -0.35, 0.75);
  const back = THREE.MathUtils.smoothstep(d.z, 0.3, 1);
  const r = HEAD.R + extra;
  let x = d.x * r * HEAD.scale[0], y = d.y * r * HEAD.scale[1], z = d.z * r * HEAD.scale[2];
  x *= 1 - 0.2 * lower ** 1.4 * (0.5 + 0.5 * front);
  x *= 1 + 0.05 * Math.exp(-(((d.y + 0.28) / 0.25) ** 2)) * front;
  y -= 0.045 * lower ** 1.5 * front;
  z -= 0.022 * lower * front;
  z += 0.018 * back;
  return out.set(x + HEAD.C[0], y + HEAD.C[1], z + HEAD.C[2]);
}

/** Face-canvas angular coords (deg; +x = viewer's right, +y = up) → unit direction in head space. */
export function faceDir(fxDeg, fyDeg, out = new THREE.Vector3()) {
  const th = THREE.MathUtils.degToRad(Math.hypot(fxDeg, fyDeg));
  const phi = Math.atan2(fyDeg, fxDeg);
  // original sphere param: x = -cos φ sin θ, y = cos θ, z = sin φ sin θ
  out.set(-Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th));
  return out.applyMatrix4(rotFace).normalize();
}
export function facePoint(fxDeg, fyDeg, extra = 0, out = new THREE.Vector3()) {
  return shapePoint(faceDir(fxDeg, fyDeg), out, extra);
}

let headGeo = null;
export function headGeometry() {
  if (headGeo) return headGeo;
  const sg = new THREE.SphereGeometry(1, 40, 30);
  const P = sg.attributes.position, UV = sg.attributes.uv;
  const d = new THREE.Vector3(), out = new THREE.Vector3();
  const uvs = [];
  for (let i = 0; i < P.count; i++) {
    const u0 = UV.getX(i), v0 = UV.getY(i);
    const th = (1 - v0) * Math.PI, phi = u0 * Math.PI * 2;
    const r = mapR(th);
    uvs.push(0.5 + r * Math.cos(phi), 0.5 + r * Math.sin(phi));
    d.fromBufferAttribute(P, i).applyMatrix4(rotFace).normalize();
    shapePoint(d, out);
    P.setXYZ(i, out.x, out.y, out.z);
  }
  sg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  sg.computeVertexNormals();
  const B = new Builder();
  B.add(sg, { uv: (i) => [uvs[i * 2], uvs[i * 2 + 1]], outline: 1, smooth: true });
  // neck
  B.add(cyl(0.046, 0.05, 0.16, 12, true), { m: M([0, 0.02, 0.01]), uv: () => SKIN_UV, outline: 0 });
  // ears
  for (const sx of [-1, 1]) {
    B.add(sphere(10, 8), { m: M([sx * 0.19, 0.155, 0.02], [0, sx * 0.3, 0], [0.028, 0.042, 0.022]), uv: () => SKIN_UV, outline: 1 });
  }
  headGeo = B.build();
  return headGeo;
}
