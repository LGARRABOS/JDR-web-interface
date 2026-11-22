import * as THREE from 'three';

// Retouches de shaders partagées par le labo et le jeu : toile des voiles
// (confection, modelé du creux, translucidité), pavillons au vent.

export interface SailUniforms {
  uTime: { value: number };
  uSunView: { value: THREE.Vector3 };
  uSunCol: { value: THREE.Color };
  uDamage?: { value: number };
}

export function patchSail(mat: THREE.Material, uniforms: SailUniforms) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.uniforms.uDamage = uniforms.uDamage ?? { value: 0 };
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec2 sl;\nattribute vec2 sd;\nattribute float hol;\nvarying vec2 vSl;\nvarying vec2 vSd;\nvarying float vHol;'
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvSl = sl; vSd = sd; vHol = hol;'
      );
    // Lumière transmise à travers la toile : calculée avec chaque lampe et
    // son ombre portée (une voile à l'ombre ne s'illumine pas par derrière).
    const transmit =
      'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n' +
      'reflectedLight.directDiffuse += material.diffuseColor * directLight.color * pow(max(-dot(geometryNormal, directLight.direction), 0.), 1.2) * .8 * gThin;';
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 uSunView, uSunCol;\nuniform float uDamage;\nvarying vec2 vSl;\nvarying vec2 vSd;\nvarying float vHol;\nfloat gThin = 1.;'
      )
      .replace(
        '#include <lights_fragment_begin>',
        THREE.ShaderChunk.lights_fragment_begin
          .split(
            'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );'
          )
          .join(transmit)
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  // Dégâts : trous aux bords brûlés.
  if (uDamage > 0.) {
    vec2 hp = vSl * vec2(vSd.x, vSd.y) * .45;
    vec2 hi = floor(hp), hf = fract(hp);
    float hn = fract(sin(dot(hi, vec2(127.1, 311.7))) * 43758.5453);
    float hd = length(hf - .5 - (vec2(fract(hn * 7.1), fract(hn * 3.7)) - .5) * .4);
    float hole = step(hn, uDamage * .35) * (1. - smoothstep(.12, .3, hd));
    if (hole > .55) discard;
    diffuseColor.rgb *= 1. - .75 * smoothstep(.0, .55, hole) - .25 * uDamage * step(hn, uDamage * .5) * (1. - smoothstep(.2, .5, hd));
  }
  // Confection : ourlets (gaines), renforts cousus aux angles, bandes de ris
  // et garcettes, teinte propre à chaque laize, poussière vers la bordure.
  vec2 s01 = vSl; vec2 dim = max(vSd, vec2(.5));
  float dx = min(s01.x, 1. - s01.x) * dim.x;
  float dy = min(s01.y, 1. - s01.y) * dim.y;
  float hem = 1. - smoothstep(.13, .2, min(dx, dy));
  float corner = 1. - smoothstep(1.0, 1.12, dx + dy);
  float cornerSeam = corner * (1. - smoothstep(.015, .03, abs(fract((dx + dy) * 3.) - .5) - .45));
  float isSquare = step(dim.y, dim.x * 1.05);
  float yh = s01.y * dim.y;
  float rk = floor(yh / .95 + .5);
  float reef = isSquare * step(.5, rk) * step(rk, 2.5) * (1. - smoothstep(.04, .07, abs(yh - rk * .95)));
  float zz = (s01.x - .5) * dim.x;
  float pts = reef * (1. - smoothstep(.025, .045, length(vec2((fract(zz / .55) - .5) * .55, yh - rk * .95 + .12))));
  float lz = floor(zz / .75);
  float tint = fract(sin(lz * 127.1 + dim.y * 3.1) * 43758.5453);
  diffuseColor.rgb *= .95 + .08 * tint;
  // Coutures des laizes : double épaisseur, double piqûre.
  float sd0 = abs(fract(zz / .75 + .5) - .5) * .75;
  float seam = 1. - smoothstep(.012, .03, sd0);
  float stitch = (1. - smoothstep(.003, .007, abs(sd0 - .022))) * step(.45, fract(yh * 14.));
  diffuseColor.rgb *= 1. - .06 * seam - .12 * stitch;
  diffuseColor.rgb *= 1. - .1 * hem - .1 * corner - .08 * reef - .1 * cornerSeam;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.22, .17, .12), pts * .8);
  float dust = smoothstep(.45, 1., s01.y) * .13 * isSquare + .04 * sin(s01.x * 31. + s01.y * 7.) * smoothstep(.6, 1., s01.y);
  diffuseColor.rgb *= vec3(1. - dust * .7, 1. - dust, 1. - dust * 1.4);
  // Modelé : le fond du creux s'assombrit, les bords tendus se détachent.
  float hv = clamp(abs(vHol), 0., 1.);
  bool concave = vHol >= 0. ? !gl_FrontFacing : gl_FrontFacing;
  diffuseColor.rgb *= concave ? 1. - .34 * hv : .86 + .16 * hv;
  // Translucidité : forte sur la toile simple, faible là où elle est doublée.
  gThin = (1. - .85 * max(max(hem, corner), reef)) * (1. - .8 * cornerSeam) * (1. - .45 * seam);
  totalEmissiveRadiance += diffuseColor.rgb * uSunCol * .03 * gThin;
}`
      );
  };
}

export function patchFlag(mat: THREE.Material, uniforms: SailUniforms) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float sw;\nuniform float uTime;'
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
transformed.z += sw * sin(uTime*6. - sw*7. + position.y) * .45 * sw;
transformed.y += sw * sin(uTime*4.3 - sw*5.) * .08;`
      );
  };
}
