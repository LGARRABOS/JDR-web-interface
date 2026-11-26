import * as THREE from 'three';

// Fumée de la cheminée, vapeur des soupapes, poussière soulevée par les
// tuyères : particules douces (volutes calculées dans le shader), éclairées
// par le soleil ou la lune ; jets d'Aether additifs sous les nacelles.

const VS = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute float aSeed;
uniform float uScale;
varying float vAlpha;
varying float vSeed;
varying float vH;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(-mv.z, .1);
  vAlpha = aAlpha;
  vSeed = aSeed;
  vH = position.y;
}`;

const FS = /* glsl */ `
uniform vec3 uLight, uShade, uTint;
uniform float uSoft;
varying float vAlpha;
varying float vSeed;
varying float vH;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+1.), f.x), f.y); }
void main(){
  vec2 c = gl_PointCoord - .5;
  float d = length(c) * 2.;
  if (d > 1.) discard;
  float a = c.x*cos(vSeed*6.) - c.y*sin(vSeed*6.);
  float b = c.x*sin(vSeed*6.) + c.y*cos(vSeed*6.);
  vec2 q = vec2(a, b) * 3. + vSeed * 17.;
  float v = n(q) * .55 + n(q*2.1) * .3 + n(q*4.3) * .15;
  float m = smoothstep(1., uSoft, d + (v - .5) * .9);
  // Éclairé par le haut, ombré par le bas et au cœur.
  float lit = clamp(.65 - c.y * 1.2 + (v - .5) * .5, 0., 1.);
  vec3 col = mix(uShade, uLight, lit) * uTint;
  gl_FragColor = vec4(col, m * vAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Puffs {
  readonly points: THREE.Points;
  private n: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private a0: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private next = 0;
  readonly mat: THREE.ShaderMaterial;

  constructor(n: number, tint: THREE.Color, soft = 0.35) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n).fill(1e9);
    this.life = new Float32Array(n).fill(1);
    this.s0 = new Float32Array(n);
    this.s1 = new Float32Array(n);
    this.a0 = new Float32Array(n);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    const seed = new Float32Array(n).map(() => Math.random());
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)
    );
    g.setAttribute(
      'aSize',
      new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage)
    );
    g.setAttribute(
      'aAlpha',
      new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage)
    );
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uScale: { value: 600 },
        uLight: { value: new THREE.Color(1, 1, 1) },
        uShade: { value: new THREE.Color(0.3, 0.3, 0.3) },
        uTint: { value: tint },
        uSoft: { value: soft },
      },
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  emit(
    p: THREE.Vector3,
    v: THREE.Vector3,
    life: number,
    s0: number,
    s1: number,
    a: number
  ) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.age[i] = 0;
    this.life[i] = life;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.a0[i] = a;
  }

  update(dt: number, wind: THREE.Vector3, drag = 0.4, rise = 0) {
    const k = Math.exp(-drag * dt);
    for (let i = 0; i < this.n; i++) {
      const t = (this.age[i] += dt) / this.life[i];
      if (t >= 1) {
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      const o = i * 3;
      // La vitesse propre s'amortit, le vent prend le relais.
      this.vel[o] = this.vel[o] * k + wind.x * (1 - k);
      this.vel[o + 1] = this.vel[o + 1] * k + (wind.y + rise) * (1 - k);
      this.vel[o + 2] = this.vel[o + 2] * k + wind.z * (1 - k);
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(t);
      this.alpha[i] = this.a0[i] * Math.min(1, t * 8) * Math.pow(1 - t, 1.5);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
  }
}

/** Jet d'Aether sous une tuyère : cône additif, plus vif au centre. */
export function aetherJet(color: THREE.Color): THREE.Mesh {
  const g = new THREE.CylinderGeometry(0.75, 1.4, 6, 24, 8, true);
  g.translate(0, -3, 0);
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uTime: { value: 0 },
      uPower: { value: 1 },
    },
    vertexShader: /* glsl */ `
varying float vY; varying float vF; varying vec2 vUv;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.);
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vF = abs(dot(n, normalize(cameraPosition - wp.xyz)));
  vY = clamp(-position.y / 6., 0., 1.); vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,
    fragmentShader: /* glsl */ `
uniform vec3 uColor; uniform float uTime, uPower;
varying float vY; varying float vF; varying vec2 vUv;
void main(){
  float flick = .8 + .2*sin(uTime*31. + vUv.x*40.) * sin(uTime*17. - vY*20.);
  float bands = .75 + .25*sin(vY*28. - uTime*24.);
  // clamp : une base négative donne NaN sur certaines cartes graphiques.
  float a = pow(clamp(1. - vY, 0., 1.), 2.4) * pow(clamp(vF, 0., 1.), 2.) * clamp(flick, 0., 1.) * bands * uPower;
  gl_FragColor = vec4(uColor * a * 1.6, 1.);
}`,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 11;
  return mesh;
}
