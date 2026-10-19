// Shared vertex deformation for the visible cloth and its shadow caster. CPU work per frame
// is three uniform writes; analytic derivatives keep the pleat lighting in sync with the fabric.
import * as THREE from 'three';
import { toon } from './kit.js';

const deformation = `
uniform float uCurtainTime;
uniform float uCurtainBreeze;
uniform float uCurtainWind;
attribute vec4 aCurtain;
attribute float aCurtainOpen;
void curtainSurface(vec3 base, out vec3 p, out vec3 n) {
  float u = aCurtain.x, v = aCurtain.y;
  float span = aCurtain.z, height = aCurtain.w;
  float ws = aCurtainOpen > 0.5 ? min(1.2, uCurtainWind + uCurtainBreeze) : uCurtainBreeze * 0.22;
  float t = uCurtainTime;
  float fold = u * 21.991148575;
  float phase = t * 2.6 + u * 2.2;
  float wave = v * 7.0 - t * (4.0 + 4.0 * ws) + u * 3.3;
  float a = 0.82 + 0.18 * sin(phase), b = 0.55 + 0.45 * u;
  float amp = 0.012 + 0.05 * ws;
  float pleat = 0.032 * sin(fold) * (1.0 - 0.4 * v * ws);
  float billow = ws * 0.62 * pow(v, 1.35) * a * b;
  float flutter = amp * sin(wave) * v;
  p = base + vec3(pleat + billow + flutter, ws * 0.12 * v * v, span * u * 0.35 * ws * v * v);
  float dxdu = 0.032 * 21.991148575 * cos(fold) * (1.0 - 0.4 * v * ws)
    + ws * 0.62 * pow(v, 1.35) * (0.396 * cos(phase) * b + a * 0.45)
    + amp * cos(wave) * 3.3 * v;
  float dxdv = -0.0128 * sin(fold) * ws
    + ws * 0.837 * pow(v, 0.35) * a * b
    + amp * (sin(wave) + 7.0 * v * cos(wave));
  vec3 du = vec3(dxdu, 0.0, span * (1.0 + 0.35 * ws * v * v));
  vec3 dv = vec3(dxdv, -height + 0.24 * ws * v, span * u * 0.7 * ws * v);
  n = normalize(cross(dv, du));
}
`;

export function createCurtainMaterials() {
  const uniforms = { uCurtainTime: { value: 0 }, uCurtainBreeze: { value: 0 }, uCurtainWind: { value: 0 } };
  const material = toon({ side: THREE.DoubleSide });
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  for (const mat of [material, depth]) {
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + deformation)
        .replace('#include <begin_vertex>', 'vec3 transformed; vec3 curtainNormal; curtainSurface(position, transformed, curtainNormal);');
      if (mat === material) shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>',
        'vec3 curtainPosition; vec3 objectNormal; curtainSurface(position, curtainPosition, objectNormal);');
    };
    mat.customProgramCacheKey = () => 'qs-curtain-v1';
  }
  let t = 0;
  return { material, depth, update(dt, wind) {
    t += dt;
    uniforms.uCurtainTime.value = t;
    uniforms.uCurtainBreeze.value = 0.07 + 0.045 * Math.sin(t * 0.73) + 0.03 * Math.sin(t * 1.91 + 1);
    uniforms.uCurtainWind.value = wind;
  } };
}
