// Shaders GLSL ES 3.0 du rendu 3D de l'arpenteur.

const COMMON = /* glsl */ `
float hash(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return s;}
float dune(vec2 p){
  float h = 2.6*sin(p.x*.021+sin(p.y*.013)*1.8) + 1.7*sin(p.y*.034+p.x*.012) + 1.1*sin((p.x+p.y)*.051);
  h += (fbm(p*.018)-.5)*5.;
  return h - 2.;
}
`;

const SKY_FN = /* glsl */ `
uniform vec3 uSunDir, uSunColor, uZenith, uHorizon, uGround, uSkyMid;
uniform float uNight;
vec3 skyColor(vec3 d){
  vec3 c = mix(uHorizon, uSkyMid, smoothstep(.0, .14, d.y));
  c = mix(c, uZenith, smoothstep(.06, .55, d.y));
  if (d.y < 0.) c = mix(uHorizon, uGround, clamp(-d.y*5., 0., 1.));
  float s = max(dot(d, uSunDir), 0.);
  c += uSunColor * (pow(s, 6.)*.18 + pow(s, 60.)*.35) * (1. - uNight*.7);
  return c;
}
`;

export const MAIN_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec2 aUv;
layout(location=3) in vec3 aCol;
layout(location=4) in vec4 aMat;
uniform mat4 uModel, uViewProj, uLightVP;
uniform float uTime, uScroll;
out vec3 vWorld; out vec3 vNrm; out vec2 vUv; out vec3 vCol; flat out vec4 vMat; out vec4 vLight;
${COMMON}
void main(){
  vec3 p = aPos; vec3 n = aNrm;
  if (aMat.x == 6.) {
    // Voile : léger souffle.
    float w = sin(uTime*1.7 + aUv.x*.9 + aUv.y*.4)*.5+.5;
    p += n * (.05 + .1*w) * sin(clamp(aUv.y*.25, 0., 3.14159));
  }
  vec4 wp = uModel * vec4(p, 1.);
  if (aMat.x == 8.) {
    vec2 q = wp.xz + vec2(uScroll, 0.);
    wp.y = dune(q);
    float e = .8;
    n = normalize(vec3(dune(q-vec2(e,0.))-dune(q+vec2(e,0.)), 2.*e, dune(q-vec2(0.,e))-dune(q+vec2(0.,e))));
  } else {
    n = mat3(uModel) * n;
  }
  vWorld = wp.xyz; vNrm = n; vUv = aUv; vCol = aCol; vMat = aMat;
  vLight = uLightVP * wp;
  gl_Position = uViewProj * wp;
}`;

export const MAIN_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vWorld; in vec3 vNrm; in vec2 vUv; in vec3 vCol; flat in vec4 vMat; in vec4 vLight;
uniform vec3 uCam, uFog, uTrim, uSandA, uSandB, uRockA, uRockB;
uniform float uFogDensity, uTime, uScroll, uShadowOn;
uniform sampler2DShadow uShadow;
uniform vec4 uPods[8];
uniform int uPodCount;
uniform vec3 uPodColor;
out vec4 outColor;
${COMMON}
${SKY_FN}
vec3 bumpN(vec3 N, vec3 pos, float h, float k){
  vec3 dpdx = dFdx(pos), dpdy = dFdy(pos);
  float dhdx = dFdx(h), dhdy = dFdy(h);
  vec3 r1 = cross(dpdy, N), r2 = cross(N, dpdx);
  float det = dot(dpdx, r1);
  if (abs(det) < 1e-9) return N;
  vec3 g = sign(det) * (dhdx*r1 + dhdy*r2);
  return normalize(abs(det)*N - k*g);
}
// Ligne antialiasée : 1 hors du joint, 0 dans le joint ; s'estompe vers la moyenne quand elle devient trop fine.
float seamAA(float x, float w){
  float fw = max(fwidth(x), 1e-5);
  float d = abs(fract(x) - .5);
  float l = smoothstep(w - fw, w + fw, d);
  return mix(l, 1. - w*1.2, smoothstep(.15, .45, fw));
}
float detail(float mpp, float freq){ return clamp(1.3 - mpp*freq*2.2, 0., 1.); }
float shadowAt(vec4 lp){
  if (uShadowOn < .5) return 1.;
  vec3 c = lp.xyz/lp.w*.5+.5;
  if (c.x<0.||c.x>1.||c.y<0.||c.y>1.||c.z>1.) return 1.;
  float b = .0012;
  vec2 t = vec2(1./2048.);
  float s = 0.;
  for (int i=-1;i<=1;i++) for (int j=-1;j<=1;j++) s += texture(uShadow, vec3(c.xy + vec2(i,j)*t*1.2, c.z - b));
  return s/9.;
}
// Tôles rivetées : renvoie (relief, joint, variation).
vec3 plates(vec2 uv, float mpp){
  vec2 pd = vec2(1.5, .62);
  float row = floor(uv.y/pd.y);
  float x = uv.x + mod(row, 2.)*.75;
  vec2 cell = floor(vec2(x, uv.y)/pd);
  float seam = seamAA(x/pd.x + .5, .012) * seamAA(uv.y/pd.y + .5, .03);
  vec2 f = fract(vec2(x, uv.y)/pd)*pd;
  float ry = min(f.y, pd.y-f.y);
  float rx = min(f.x, pd.x-f.x);
  float d1 = length(vec2(mod(f.x, .11)-.055, ry-.045));
  float d2 = length(vec2(rx-.045, mod(f.y, .11)-.055));
  float riv = (1. - smoothstep(.009, .017 + mpp, min(d1, d2))) * detail(mpp, 9.);
  float var = hash(cell);
  return vec3(seam*.004 + riv*.005, seam, var + riv*2.);
}
void main(){
  vec3 N = normalize(vNrm);
  if (!gl_FrontFacing) N = -N;
  float pat = vMat.x;
  vec3 albedo = vCol;
  float metal = vMat.y, rough = vMat.z;
  vec3 emit = vec3(0.);
  float h = 0.;
  float k = 1.;
  vec2 uv = vUv;
  float mpp = length(fwidth(uv));
  if (pat == 1. || pat == 11.) {
    float pw = pat == 1. ? .3 : .2;
    vec2 q = pat == 1. ? uv : vec2(uv.y, uv.x);
    float row = floor(q.y/pw);
    float off = hash(vec2(row, 3.1))*5.;
    float L = 4.8;
    float seam = seamAA(q.y/pw + .5, .05) * seamAA((q.x+off)/L + .5, .006);
    float grain = mix(.5, fbm(vec2(q.x*1.2, q.y*26. + row*7.)), detail(mpp, 26.));
    float id = hash(vec2(row, floor((q.x+off)/L)));
    albedo *= (.8 + .35*id) * (.82 + .32*grain);
    albedo *= mix(.42, 1., seam);
    float dirt = fbm(uv*vec2(.4, 1.2) + 4.);
    float streak = fbm(vec2(uv.x*2.2, uv.y*.25) + 9.);
    albedo *= mix(.75, 1.05, dirt) * mix(.72, 1.04, smoothstep(.25, .65, streak));
    h = seam*.008 + grain*.0015;
    rough = clamp(rough + (grain-.5)*.15, .3, 1.);
  } else if (pat == 2. || pat == 5.) {
    vec3 pl = plates(uv, mpp);
    albedo *= (.86 + .2*fract(pl.z)) * mix(.55, 1., pl.y);
    float grime = fbm(vec2(uv.x*.7, uv.y*2.5));
    albedo *= mix(.7, 1.08, grime);
    h = pl.x;
    rough = clamp(rough + (grime-.5)*.25 + (1.-pl.y)*.2, .15, 1.);
    if (pat == 5.) {
      float streak = fbm(vec2(uv.x*2.6, uv.y*.45)) + fbm(uv*1.3)*.6;
      float m = smoothstep(.98, 1.25, streak + (1.-pl.y)*.2) * .85;
      albedo = mix(albedo, vec3(.05, .17, .13), m);
      metal = mix(metal, 0., m);
      rough = mix(rough, .85, m);
    }
  } else if (pat == 3. || pat == 4.) {
    float n = mix(.5, fbm(uv*9.), detail(mpp, 9.));
    albedo *= .9 + .2*n;
    rough = clamp(rough*(.75 + .5*n), .12, 1.);
    h = n*.0006;
  } else if (pat == 6.) {
    float seam = seamAA(uv.x/.75, .03);
    float weave = noise(uv*vec2(160., 160.))*.06*detail(mpp, 160.);
    float dirt = fbm(uv*vec2(.5, .8));
    albedo *= mix(.78, 1., seam) * (.94 + weave) * mix(.8, 1.05, dirt);
    h = (1.-seam)*.002;
  } else if (pat == 7.) {
    float pulse = .82 + .18*sin(uTime*3. + uv.x*2.);
    emit = vCol * vMat.w * pulse;
    albedo = vCol*.2;
  } else if (pat == 8.) {
    vec2 q = vWorld.xz + vec2(uScroll, 0.);
    float wm = length(fwidth(q));
    float m = fbm(q*.015);
    albedo = mix(uSandA, uSandB, smoothstep(.3, .75, m));
    float rip = sin(q.x*1.6 + q.y*.5 + fbm(q*.08)*8.) * detail(wm, .3);
    float rip2 = mix(.5, fbm(q*.6), detail(wm, .6));
    h = rip*.025 + rip2*.03;
    albedo *= .92 + .1*rip2;
    rough = .95; metal = 0.;
    k = 1.;
  } else if (pat == 9.) {
    float band = fract(vWorld.y*.045 + fbm(vWorld.xz*.006)*.8);
    float erosion = fbm(vec2(vWorld.x*.03 + vWorld.z*.02, vWorld.y*.15));
    albedo = mix(uRockA, uRockB, smoothstep(.15, .85, band)) * (.75 + .45*erosion);
    albedo = mix(albedo, uSandB*.9, smoothstep(.55, .9, N.y) * .7);
    h = (fbm(vec2(vWorld.x + vWorld.z, vWorld.y)*.12)*1.6 + erosion*.8) * detail(length(fwidth(vWorld.xz)), .1);
    rough = .95;
  } else if (pat == 10.) {
    float n = mix(.5, fbm(uv*5.), detail(mpp, 5.));
    albedo *= .8 + .4*n;
    rough = clamp(rough + (n-.5)*.3, .2, 1.);
    h = n*.001;
  } else if (pat == 12.) {
    albedo = vec3(.015);
    rough = .06; metal = 0.;
    if (vMat.w > 0.) emit = vCol*vMat.w*(.9 + .1*sin(uTime*2. + vWorld.x));
  } else if (pat == 13.) {
    float n = fbm(uv*3.);
    albedo = mix(vec3(.12, .05, .02), vec3(.32, .12, .04), n) * (.7 + .5*fbm(uv*12.));
    rough = .9; metal = .2;
    h = n*.01;
  }
  N = bumpN(N, vWorld, h, k);
  vec3 V = normalize(uCam - vWorld);
  vec3 L = uSunDir;
  float NdLr = dot(N, L);
  float NdL = max(NdLr, 0.);
  float sh = shadowAt(vLight);
  vec3 H = normalize(L + V);
  float NdH = max(dot(N, H), 0.), NdV = max(dot(N, V), 1e-3), VdH = max(dot(V, H), 0.);
  float a = max(rough*rough, .002), a2 = a*a;
  float dd = NdH*NdH*(a2-1.)+1.;
  float D = a2/(3.14159*dd*dd);
  vec3 F0 = mix(vec3(.04), albedo, metal);
  vec3 F = F0 + (1.-F0)*pow(clamp(1.-VdH, 0., 1.), 5.);
  float kk = (rough+1.)*(rough+1.)/8.;
  float G = (NdV/(NdV*(1.-kk)+kk)) * (NdL/(NdL*(1.-kk)+kk));
  vec3 spec = D*F*G/(4.*NdV*max(NdL, 1e-3) + 1e-4);
  vec3 kd = (1.-F)*(1.-metal);
  vec3 direct = (kd*albedo/3.14159 + spec) * uSunColor * NdL * sh * 3.14159;
  vec3 amb = mix(uGround*.9, uZenith, N.y*.5+.5) * mix(.55, 1., clamp(N.y*.5+.6, 0., 1.));
  vec3 R = reflect(-V, N);
  vec3 Fr = F0 + (max(vec3(1.-rough), F0) - F0)*pow(clamp(1.-NdV, 0., 1.), 5.);
  vec3 env = mix(skyColor(R), amb, clamp(rough*1.2, 0., 1.));
  float so = mix(.55, 1., sh);
  vec3 pods = vec3(0.);
  for (int i = 0; i < 8; i++) {
    if (i >= uPodCount) break;
    vec3 d = uPods[i].xyz - vWorld;
    float l2 = dot(d, d);
    pods += uPodColor * uPods[i].w * max(dot(N, d*inversesqrt(l2)), 0.) / (1. + l2*.18);
  }
  vec3 col = kd*albedo*(amb + pods) + Fr*env*so + direct + emit;
  if (pat == 6.) col += albedo * uSunColor * max(-NdLr, 0.) * .45 * sh;
  float dist = length(vWorld - uCam);
  float fogF = 1. - exp(-dist*uFogDensity);
  vec3 fd = normalize(vWorld - uCam);
  col = mix(col, mix(uFog, skyColor(vec3(fd.x, max(fd.y, .02), fd.z)), .5), fogF);
  outColor = vec4(col, 1.);
}`;

export const DEPTH_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=4) in vec4 aMat;
uniform mat4 uModel, uLightVP;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.); }`;

export const DEPTH_FS = /* glsl */ `#version 300 es
precision mediump float;
out vec4 o;
void main(){ o = vec4(1.); }`;

export const FULL_VS = /* glsl */ `#version 300 es
out vec2 vUv;
void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2); vUv = p; gl_Position = vec4(p*2.-1., 0., 1.); }`;

export const SKY_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform mat4 uInvViewProj;
uniform vec3 uCam, uMoonDir;
uniform float uTime;
out vec4 o;
${COMMON}
${SKY_FN}
void main(){
  vec4 p = uInvViewProj * vec4(vUv*2.-1., 1., 1.);
  vec3 d = normalize(p.xyz/p.w - uCam);
  vec3 c = skyColor(d);
  float s = max(dot(d, uSunDir), 0.);
  c += uSunColor * smoothstep(.9994, .9997, s) * 6. * (1.-uNight);
  if (uNight > .5) {
    vec2 g = d.xz/(d.y+.25)*120.;
    float st = hash(floor(g));
    float tw = .6 + .4*sin(uTime*2. + st*40.);
    c += vec3(1.) * step(.985, st) * smoothstep(.5, .0, length(fract(g)-.5)) * tw * smoothstep(.0, .25, d.y) * 1.5;
    float m = max(dot(d, uMoonDir), 0.);
    c += vec3(1.1, 1.08, 1.) * smoothstep(.99955, .9997, m) * 3.;
    c += vec3(.35, .45, .6) * pow(m, 200.) * .4;
  }
  // Nuages effilés.
  if (d.y > 0.) {
    vec2 q = d.xz/(d.y+.08);
    float cl = fbm(q*vec2(.35, 1.4) + vec2(uTime*.004, 0.));
    float a = smoothstep(.55, .8, cl) * smoothstep(.0, .12, d.y) * smoothstep(.6, .15, d.y);
    vec3 cc = mix(uHorizon*1.15, uSunColor*.6 + uHorizon*.5, pow(s, 3.));
    c = mix(c, cc, a*.55);
  }
  o = vec4(c, 1.);
}`;

/** Panaches et halos additifs : uv.y = 0 à la tuyère, 1 au bout. */
export const GLOW_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec2 aUv;
layout(location=3) in vec3 aCol;
layout(location=4) in vec4 aMat;
uniform mat4 uModel, uViewProj;
uniform vec3 uCam;
uniform float uTime;
out vec2 vUv; out vec3 vCol; out float vFacing; flat out float vAmp;
void main(){
  vec4 wp = uModel * vec4(aPos, 1.);
  vec3 n = normalize(mat3(uModel) * aNrm);
  vFacing = abs(dot(n, normalize(uCam - wp.xyz)));
  vUv = aUv; vCol = aCol; vAmp = aMat.w;
  gl_Position = uViewProj * wp;
}`;

export const GLOW_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv; in vec3 vCol; in float vFacing; flat in float vAmp;
uniform float uTime;
out vec4 o;
void main(){
  float along = clamp(vUv.y, 0., 1.);
  float flick = .85 + .15*sin(uTime*40. + vUv.x*3.);
  float a = pow(1.-along, 2.2) * pow(vFacing, 3.) * flick * smoothstep(0., .06, along + .02);
  o = vec4(vCol * a * vAmp, 1.);
}`;

export const BRIGHT_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uThreshold;
out vec4 o;
void main(){
  vec3 c = texture(uTex, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float w = smoothstep(uThreshold, uThreshold*2.2, l);
  o = vec4(c*w, 1.);
}`;

export const BLUR_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 o;
void main(){
  float w[5] = float[](.227, .1945, .1216, .054, .0162);
  vec3 c = texture(uTex, vUv).rgb*w[0];
  for (int i=1;i<5;i++){ c += texture(uTex, vUv + uDir*float(i)).rgb*w[i]; c += texture(uTex, vUv - uDir*float(i)).rgb*w[i]; }
  o = vec4(c, 1.);
}`;

export const COMPOSITE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex, uBloomA, uBloomB;
uniform float uExposure, uBloom, uGrain, uTime;
out vec4 o;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0., 1.); }
void main(){
  vec3 c = texture(uTex, vUv).rgb;
  c += (texture(uBloomA, vUv).rgb*.6 + texture(uBloomB, vUv).rgb*.8) * uBloom;
  c = aces(c*uExposure);
  c = pow(c, vec3(1./2.2));
  vec2 q = vUv-.5;
  c *= 1. - dot(q, q)*.55;
  c += (hash(vUv*vec2(1733., 977.) + uTime) - .5) * uGrain;
  o = vec4(c, 1.);
}`;

/** Poussière soulevée : billboards en mélange alpha, qui dérivent vers l'arrière. */
export const DUST_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec2 aUv;
layout(location=3) in vec3 aCol;
layout(location=4) in vec4 aMat;
uniform mat4 uViewProj;
uniform vec3 uRight, uUp;
uniform float uTime, uScroll;
out vec2 vUv; out float vA;
${COMMON}
out float vMode;
void main(){
  float ph = fract(uTime*.22 + aNrm.x);
  vec3 c; float size;
  vMode = aCol.g;
  if (aCol.g > .5) {
    // Fumée de cheminée : monte et file vers l'arrière.
    c = aPos + vec3(-ph*22. - aNrm.y*3., ph*16. + ph*ph*6., aNrm.z*ph*5.);
    size = 1.6 + 10.*ph;
    vA = (1.-ph)*smoothstep(0., .08, ph)*aCol.r*.75;
  } else {
    c = aPos + vec3(-ph*26. - aNrm.y*4., 0., aNrm.z*ph*6.);
    c.y = dune(c.xz + vec2(uScroll, 0.)) + .6 + ph*5.5*aMat.w;
    size = aMat.w*(3. + 13.*ph);
    vA = (1.-ph)*smoothstep(0., .12, ph)*aCol.r;
  }
  vUv = aUv;
  vec3 p = c + (aUv.x-.5)*size*uRight + (aUv.y-.5)*size*uUp*.75;
  gl_Position = uViewProj*vec4(p, 1.);
}`;

export const DUST_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv; in float vA; in float vMode;
uniform vec3 uDustColor, uSmokeColor;
out vec4 o;
${COMMON}
void main(){
  vec2 q = vUv - .5;
  float r = length(q)*2.;
  float n = fbm(vUv*3. + vA*7.);
  float a = (1. - smoothstep(.15, 1., r + (n-.5)*.5)) * vA * .8;
  o = vec4(vMode > .5 ? uSmokeColor : uDustColor, a);
}`;
