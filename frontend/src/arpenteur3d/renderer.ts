import { STRIDE, type MeshData } from './geometry';
import {
  invert,
  lookAt,
  multiply,
  normalize,
  ortho,
  perspective,
  type Mat4,
  type Vec3,
} from './math';
import {
  BLUR_FS,
  BRIGHT_FS,
  COMPOSITE_FS,
  DEPTH_FS,
  DEPTH_VS,
  DUST_FS,
  DUST_VS,
  FULL_VS,
  GLOW_FS,
  GLOW_VS,
  MAIN_FS,
  MAIN_VS,
  SKY_FS,
} from './shaders';

// Moteur WebGL2 minimal : passe d'ombre, ciel, objets éclairés (PBR simplifié),
// halos additifs, puis bloom et mappage de tons.

/**
 * Maillage confié au moteur de rendu. Opaque pour la scène : chaque moteur
 * (WebGL2 maison, Three.js) y range ce qu'il veut.
 */
export interface MeshHandle {
  readonly __handle?: never;
}

export interface GpuMesh extends MeshHandle {
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  ibo: WebGLBuffer;
  count: number;
}

export interface DrawItem {
  mesh: MeshHandle;
  model: Mat4;
  shadow?: boolean;
  /** Posé sur les dunes : chaque sommet suit le relief du sable sous lui. */
  drape?: boolean;
}

export interface Lighting {
  sunDir: Vec3;
  sunColor: Vec3;
  zenith: Vec3;
  horizon: Vec3;
  skyMid: Vec3;
  ground: Vec3;
  fog: Vec3;
  fogDensity: number;
  night: number;
  moonDir: Vec3;
  sandA: Vec3;
  sandB: Vec3;
  rockA: Vec3;
  rockB: Vec3;
  exposure: number;
  bloom: number;
}

export interface Camera {
  eye: Vec3;
  target: Vec3;
  fov: number;
}

interface Target {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
}

const SHADOW = 2048;

/** Paramètres d'une image (horloge, sol, effets, ombres, tuyères). */
export interface RenderOptions {
  time: number;
  scroll: number;
  /** 0 = dunes, 1 = sol aplani autour d'une ville. */
  calm?: number;
  /** Abscisse du centre de la zone aplanie (ville qui défile). */
  calmX?: number;
  /** Tempête de sable plein écran (0..1) et sa couleur (affichage). */
  storm?: number;
  /** Passage d'un portail d'Aether (effet plein écran), 0..1. */
  portal?: number;
  /** Amplitude des dunes (paysage du secteur). */
  duneAmp?: number;
  /** Relief propre au paysage (voir Biome.terrain). */
  terrain?: number;
  stormColor?: Vec3;
  shadowCenter: Vec3;
  shadowRadius: number;
  pods?: { pos: Vec3; power: number }[];
  dust?: MeshHandle | null;
}

/** Ce que la scène attend d'un moteur de rendu. */
export interface RenderBackend {
  readonly width: number;
  readonly height: number;
  /** Rendu réaliste : navire, équipage, sol et paysages dessinés par le moteur. */
  readonly native?: import('./native').NativeHost;
  /** Allègement des effets (0 : complet … 3 : minimal) quand la machine peine. */
  setLoad?(level: number): void;
  upload(mesh: MeshData): MeshHandle;
  release(mesh: MeshHandle): void;
  setSize(w: number, h: number): void;
  render(
    items: DrawItem[],
    glows: DrawItem[],
    cam: Camera,
    light: Lighting,
    opts: RenderOptions
  ): void;
  dispose(): void;
}

export class Renderer implements RenderBackend {
  readonly gl: WebGL2RenderingContext;
  private main: WebGLProgram;
  private depth: WebGLProgram;
  private sky: WebGLProgram;
  private glow: WebGLProgram;
  private dust: WebGLProgram;
  private bright: WebGLProgram;
  private blur: WebGLProgram;
  private composite: WebGLProgram;
  private uni = new Map<
    WebGLProgram,
    Map<string, WebGLUniformLocation | null>
  >();
  private shadowFb: WebGLFramebuffer;
  private shadowTex: WebGLTexture;
  private emptyVao: WebGLVertexArrayObject;
  private hdrFormat: number;
  private msaa: {
    fb: WebGLFramebuffer;
    color: WebGLRenderbuffer;
    depth: WebGLRenderbuffer;
    w: number;
    h: number;
  } | null = null;
  private scene: Target | null = null;
  private half: [Target, Target] | null = null;
  private quarter: [Target, Target] | null = null;
  width = 1;
  height = 1;

  constructor(
    readonly canvas: HTMLCanvasElement,
    opts: { preserve?: boolean } = {}
  ) {
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: !!opts.preserve,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 indisponible');
    this.gl = gl;
    const float = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    this.hdrFormat = float ? gl.RGBA16F : gl.RGBA8;
    this.main = this.program(MAIN_VS, MAIN_FS);
    this.depth = this.program(DEPTH_VS, DEPTH_FS);
    this.sky = this.program(FULL_VS, SKY_FS);
    this.glow = this.program(GLOW_VS, GLOW_FS);
    this.dust = this.program(DUST_VS, DUST_FS);
    this.bright = this.program(FULL_VS, BRIGHT_FS);
    this.blur = this.program(FULL_VS, BLUR_FS);
    this.composite = this.program(FULL_VS, COMPOSITE_FS);
    this.emptyVao = gl.createVertexArray()!;

    this.shadowTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SHADOW, SHADOW);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_COMPARE_MODE,
      gl.COMPARE_REF_TO_TEXTURE
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.shadowFb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFb);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.DEPTH_ATTACHMENT,
      gl.TEXTURE_2D,
      this.shadowTex,
      0
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private program(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error(`Shader : ${gl.getShaderInfoLog(s)}`);
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error(`Programme : ${gl.getProgramInfoLog(p)}`);
    return p;
  }

  private u(p: WebGLProgram, name: string) {
    let m = this.uni.get(p);
    if (!m) this.uni.set(p, (m = new Map()));
    if (!m.has(name)) m.set(name, this.gl.getUniformLocation(p, name));
    return m.get(name) ?? null;
  }

  upload(mesh: MeshData): GpuMesh {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.data, gl.STATIC_DRAW);
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.index, gl.STATIC_DRAW);
    const s = STRIDE * 4;
    const attr = (loc: number, size: number, off: number) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, s, off * 4);
    };
    attr(0, 3, 0);
    attr(1, 3, 3);
    attr(2, 2, 6);
    attr(3, 3, 8);
    attr(4, 4, 11);
    gl.bindVertexArray(null);
    return { vao, vbo, ibo, count: mesh.index.length };
  }

  release(handle: MeshHandle) {
    const m = handle as GpuMesh;
    const gl = this.gl;
    gl.deleteVertexArray(m.vao);
    gl.deleteBuffer(m.vbo);
    gl.deleteBuffer(m.ibo);
  }

  private target(w: number, h: number): Target {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, this.hdrFormat, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      tex,
      0
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex, w, h };
  }

  private freeTarget(t: Target | null) {
    if (!t) return;
    this.gl.deleteFramebuffer(t.fb);
    this.gl.deleteTexture(t.tex);
  }

  setSize(w: number, h: number) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (w === this.width && h === this.height && this.scene) return;
    const gl = this.gl;
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    if (this.msaa) {
      gl.deleteFramebuffer(this.msaa.fb);
      gl.deleteRenderbuffer(this.msaa.color);
      gl.deleteRenderbuffer(this.msaa.depth);
    }
    const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) as number);
    const color = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, color);
    gl.renderbufferStorageMultisample(
      gl.RENDERBUFFER,
      samples,
      this.hdrFormat,
      w,
      h
    );
    const depth = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorageMultisample(
      gl.RENDERBUFFER,
      samples,
      gl.DEPTH_COMPONENT24,
      w,
      h
    );
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.RENDERBUFFER,
      color
    );
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.DEPTH_ATTACHMENT,
      gl.RENDERBUFFER,
      depth
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.msaa = { fb, color, depth, w, h };
    this.freeTarget(this.scene);
    this.half?.forEach((t) => this.freeTarget(t));
    this.quarter?.forEach((t) => this.freeTarget(t));
    this.scene = this.target(w, h);
    const hw = Math.max(1, w >> 1);
    const hh = Math.max(1, h >> 1);
    this.half = [this.target(hw, hh), this.target(hw, hh)];
    const qw = Math.max(1, w >> 2);
    const qh = Math.max(1, h >> 2);
    this.quarter = [this.target(qw, qh), this.target(qw, qh)];
  }

  private fullscreen() {
    const gl = this.gl;
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  render(
    items: DrawItem[],
    glows: DrawItem[],
    cam: Camera,
    light: Lighting,
    opts: RenderOptions
  ) {
    const gl = this.gl;
    if (!this.msaa || !this.scene || !this.half || !this.quarter) return;
    const aspect = this.width / this.height;
    // Plan proche suivant la distance de la caméra : plus de précision de
    // profondeur pour les décors lointains (routes, sol) sans rogner la scène.
    const camDist = Math.hypot(
      cam.eye[0] - cam.target[0],
      cam.eye[1] - cam.target[1],
      cam.eye[2] - cam.target[2]
    );
    const near = Math.min(4, Math.max(0.5, camDist * 0.012));
    const proj = perspective(cam.fov, aspect, near, 2500);
    const view = lookAt(cam.eye, cam.target, [0, 1, 0]);
    const vp = multiply(proj, view);
    const sun = normalize(light.sunDir);
    const c = opts.shadowCenter;
    const R = opts.shadowRadius;
    const lview = lookAt(
      [c[0] + sun[0] * 150, c[1] + sun[1] * 150, c[2] + sun[2] * 150],
      c,
      Math.abs(sun[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0]
    );
    const lvp = multiply(ortho(-R, R, -R, R, 1, 300), lview);
    const shadowOn = sun[1] > 0.02;

    // 1. Ombres.
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    if (shadowOn) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFb);
      gl.viewport(0, 0, SHADOW, SHADOW);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.depth);
      gl.uniformMatrix4fv(this.u(this.depth, 'uLightVP'), false, lvp);
      gl.uniform1f(this.u(this.depth, 'uTime'), opts.time);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1.5, 3);
      for (const it of items) {
        if (!it.shadow) continue;
        gl.uniformMatrix4fv(this.u(this.depth, 'uModel'), false, it.model);
        {
          const gm = it.mesh as GpuMesh;
          gl.bindVertexArray(gm.vao);
          gl.drawElements(gl.TRIANGLES, gm.count, gl.UNSIGNED_INT, 0);
        }
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    // 2. Ciel puis scène dans le tampon HDR multi-échantillonné.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaa.fb);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const skyU = (p: WebGLProgram) => {
      gl.uniform3fv(this.u(p, 'uSunDir'), sun);
      gl.uniform3fv(this.u(p, 'uSunColor'), light.sunColor);
      gl.uniform3fv(this.u(p, 'uZenith'), light.zenith);
      gl.uniform3fv(this.u(p, 'uHorizon'), light.horizon);
      gl.uniform3fv(this.u(p, 'uSkyMid'), light.skyMid);
      gl.uniform3fv(this.u(p, 'uGround'), light.ground);
      gl.uniform1f(this.u(p, 'uNight'), light.night);
      gl.uniform3fv(this.u(p, 'uCam'), cam.eye);
      gl.uniform1f(this.u(p, 'uTime'), opts.time);
    };
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.sky);
    skyU(this.sky);
    gl.uniformMatrix4fv(this.u(this.sky, 'uInvViewProj'), false, invert(vp));
    gl.uniform3fv(this.u(this.sky, 'uMoonDir'), normalize(light.moonDir));
    this.fullscreen();
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);

    const m = this.main;
    gl.useProgram(m);
    skyU(m);
    gl.uniformMatrix4fv(this.u(m, 'uViewProj'), false, vp);
    gl.uniformMatrix4fv(this.u(m, 'uLightVP'), false, lvp);
    gl.uniform3fv(this.u(m, 'uFog'), light.fog);
    gl.uniform1f(this.u(m, 'uFogDensity'), light.fogDensity);
    gl.uniform3fv(this.u(m, 'uSandA'), light.sandA);
    gl.uniform3fv(this.u(m, 'uSandB'), light.sandB);
    gl.uniform3fv(this.u(m, 'uRockA'), light.rockA);
    gl.uniform3fv(this.u(m, 'uRockB'), light.rockB);
    gl.uniform1f(this.u(m, 'uScroll'), opts.scroll);
    gl.uniform1f(this.u(m, 'uCalm'), opts.calm ?? 0);
    gl.uniform1f(this.u(m, 'uDuneAmp'), opts.duneAmp ?? 1);
    gl.uniform1f(this.u(m, 'uTerrain'), opts.terrain ?? 0);
    gl.uniform1f(this.u(m, 'uCalmX'), opts.calmX ?? 0);
    gl.uniform1f(this.u(m, 'uShadowOn'), shadowOn ? 1 : 0);
    const pods = (opts.pods ?? []).slice(0, 8);
    const pd = new Float32Array(32);
    pods.forEach((p, i) =>
      pd.set([p.pos[0], p.pos[1], p.pos[2], p.power], i * 4)
    );
    gl.uniform4fv(this.u(m, 'uPods'), pd);
    gl.uniform1i(this.u(m, 'uPodCount'), pods.length);
    gl.uniform3fv(this.u(m, 'uPodColor'), [0.25, 0.85, 1.0]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.uniform1i(this.u(m, 'uShadow'), 0);
    for (const it of items) {
      gl.uniformMatrix4fv(this.u(m, 'uModel'), false, it.model);
      gl.uniform1f(this.u(m, 'uDrape'), it.drape ? 1 : 0);
      {
        const gm = it.mesh as GpuMesh;
        gl.bindVertexArray(gm.vao);
        gl.drawElements(gl.TRIANGLES, gm.count, gl.UNSIGNED_INT, 0);
      }
    }

    if (opts.dust) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      const d = this.dust;
      gl.useProgram(d);
      gl.uniformMatrix4fv(this.u(d, 'uViewProj'), false, vp);
      gl.uniform3f(this.u(d, 'uRight'), view[0], view[4], view[8]);
      gl.uniform3f(this.u(d, 'uUp'), view[1], view[5], view[9]);
      gl.uniform1f(this.u(d, 'uTime'), opts.time);
      gl.uniform1f(this.u(d, 'uScroll'), opts.scroll);
      gl.uniform1f(this.u(d, 'uDuneAmp'), opts.duneAmp ?? 1);
      gl.uniform1f(this.u(d, 'uTerrain'), opts.terrain ?? 0);
      const sc = light.sunColor;
      const k = 0.35;
      gl.uniform3f(
        this.u(d, 'uDustColor'),
        light.sandB[0] * (sc[0] * k + light.zenith[0] * 0.6) + 0.02,
        light.sandB[1] * (sc[1] * k + light.zenith[1] * 0.6) + 0.02,
        light.sandB[2] * (sc[2] * k + light.zenith[2] * 0.6) + 0.02
      );
      gl.uniform3f(
        this.u(d, 'uSmokeColor'),
        0.05 + sc[0] * 0.03,
        0.045 + sc[1] * 0.03,
        0.045 + sc[2] * 0.03
      );
      const dm = opts.dust as GpuMesh;
      gl.bindVertexArray(dm.vao);
      gl.drawElements(gl.TRIANGLES, dm.count, gl.UNSIGNED_INT, 0);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    if (glows.length) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.depthMask(false);
      gl.useProgram(this.glow);
      gl.uniformMatrix4fv(this.u(this.glow, 'uViewProj'), false, vp);
      gl.uniform3fv(this.u(this.glow, 'uCam'), cam.eye);
      gl.uniform1f(this.u(this.glow, 'uTime'), opts.time);
      for (const it of glows) {
        gl.uniformMatrix4fv(this.u(this.glow, 'uModel'), false, it.model);
        {
          const gm = it.mesh as GpuMesh;
          gl.bindVertexArray(gm.vao);
          gl.drawElements(gl.TRIANGLES, gm.count, gl.UNSIGNED_INT, 0);
        }
      }
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // 3. Résolution, bloom, composition.
    gl.disable(gl.DEPTH_TEST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaa.fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.scene.fb);
    gl.blitFramebuffer(
      0,
      0,
      this.width,
      this.height,
      0,
      0,
      this.width,
      this.height,
      gl.COLOR_BUFFER_BIT,
      gl.NEAREST
    );
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

    const pass = (
      p: WebGLProgram,
      src: WebGLTexture,
      dst: Target | null,
      set?: () => void
    ) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
      gl.viewport(0, 0, dst ? dst.w : this.width, dst ? dst.h : this.height);
      gl.useProgram(p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src);
      gl.uniform1i(this.u(p, 'uTex'), 0);
      set?.();
      this.fullscreen();
    };
    const [h0, h1] = this.half;
    const [q0, q1] = this.quarter;
    pass(this.bright, this.scene.tex, h0, () =>
      gl.uniform1f(this.u(this.bright, 'uThreshold'), 1.6)
    );
    pass(this.blur, h0.tex, h1, () =>
      gl.uniform2f(this.u(this.blur, 'uDir'), 1.5 / h0.w, 0)
    );
    pass(this.blur, h1.tex, h0, () =>
      gl.uniform2f(this.u(this.blur, 'uDir'), 0, 1.5 / h0.h)
    );
    pass(this.blur, h0.tex, q0, () =>
      gl.uniform2f(this.u(this.blur, 'uDir'), 2 / h0.w, 0)
    );
    pass(this.blur, q0.tex, q1, () =>
      gl.uniform2f(this.u(this.blur, 'uDir'), 0, 2.5 / q0.h)
    );
    pass(this.blur, q1.tex, q0, () =>
      gl.uniform2f(this.u(this.blur, 'uDir'), 2.5 / q0.w, 0)
    );
    pass(this.blur, q0.tex, q1, () =>
      gl.uniform2f(this.u(this.blur, 'uDir'), 0, 2.5 / q0.h)
    );
    pass(this.composite, this.scene.tex, null, () => {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, h0.tex);
      gl.uniform1i(this.u(this.composite, 'uBloomA'), 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, q1.tex);
      gl.uniform1i(this.u(this.composite, 'uBloomB'), 2);
      gl.uniform1f(this.u(this.composite, 'uExposure'), light.exposure);
      gl.uniform1f(this.u(this.composite, 'uBloom'), light.bloom);
      gl.uniform1f(this.u(this.composite, 'uGrain'), 0.018);
      gl.uniform1f(this.u(this.composite, 'uTime'), opts.time % 10);
      gl.uniform1f(this.u(this.composite, 'uStorm'), opts.storm ?? 0);
      gl.uniform1f(this.u(this.composite, 'uPortal'), opts.portal ?? 0);
      gl.uniform1f(this.u(this.composite, 'uStormT'), opts.time % 1000);
      gl.uniform1f(
        this.u(this.composite, 'uAspect'),
        this.width / Math.max(1, this.height)
      );
      gl.uniform3fv(
        this.u(this.composite, 'uStormColor'),
        opts.stormColor ?? [0.8, 0.62, 0.42]
      );
    });
  }

  dispose() {
    const gl = this.gl;
    for (const p of [
      this.main,
      this.depth,
      this.sky,
      this.glow,
      this.dust,
      this.bright,
      this.blur,
      this.composite,
    ])
      gl.deleteProgram(p);
    gl.deleteTexture(this.shadowTex);
    gl.deleteFramebuffer(this.shadowFb);
    this.freeTarget(this.scene);
    this.half?.forEach((t) => this.freeTarget(t));
    this.quarter?.forEach((t) => this.freeTarget(t));
    if (this.msaa) {
      gl.deleteFramebuffer(this.msaa.fb);
      gl.deleteRenderbuffer(this.msaa.color);
      gl.deleteRenderbuffer(this.msaa.depth);
    }
  }
}
