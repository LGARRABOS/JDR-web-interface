// Shaders GLSL ES 3.0 du rendu 3D de l'arpenteur.

export const COMMON = /* glsl */ `
uniform float uDuneAmp;
uniform float uTerrain;
float hash(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return s;}
float dune(vec2 p){
  float h = 2.6*sin(p.x*.021+sin(p.y*.013)*1.8) + 1.7*sin(p.y*.034+p.x*.012) + 1.1*sin((p.x+p.y)*.051);
  h += (fbm(p*.018)-.5)*5.;
  return h*uDuneAmp - 2.;
}
// Grandes ondulations du désert, loin du navire seulement.
float swell(vec2 p){
  return 9.*sin(p.x*.0042 + sin(p.y*.0031)*2.2) + 6.*sin(p.y*.0063 - p.x*.0024) + (fbm(p*.0025) - .5)*12.;
}
// Odur des sables : lit sinueux de sable fin que suit la route du navire.
float odurC(float x){ return 16.*sin(x*.0023) + 8.*sin(x*.0061 + 1.3); }
float odurIn(vec2 q){ return uTerrain == 1. ? 1. - smoothstep(36., 50., abs(q.y - odurC(q.x))) : 0.; }
// Barkhanes : dunes en croissant géantes, cornes sous le vent (+x).
float barchans(vec2 q){
  float h = 0.;
  vec2 cs = vec2(560., 460.);
  vec2 g = floor(q / cs - .5);
  for (int i = 0; i < 2; i++) for (int j = 0; j < 2; j++) {
    vec2 c = g + vec2(float(i), float(j));
    float r1 = hash(c*1.7 + 3.1), r2 = hash(c*2.3 + 7.9), r3 = hash(c + 11.3);
    vec2 ctr = (c + .5 + (vec2(r1, r2) - .5)*.5) * cs;
    float R = 110. + 70.*r3;
    float H = 60. + 70.*r1;
    vec2 d = q - ctr;
    float body = exp(-(d.x*d.x/(R*R*.8) + d.y*d.y/(R*R*.55)));
    vec2 e = d - vec2(R*.55, 0.);
    float lee = exp(-(e.x*e.x/(R*R*.3) + e.y*e.y/(R*R*.22)));
    h = max(h, H*clamp(body - .9*lee, 0., 1.));
  }
  return h;
}
// Relief du sable : q = position dans le désert (défilement compris), w = scène.
float terrainH(vec2 q, vec2 w){
  float k = smoothstep(260., 850., length(w));
  float h = dune(q) + k*swell(q);
  if (uTerrain == 1.) {
    float riv = odurIn(q);
    h = mix(h*1.3 + 3., -3.5 + .25*sin(q.x*.05 + q.y*.03), riv);
  } else if (uTerrain == 2.) {
    h = h*.5 + (fbm(q*.004) - .5)*7.;
  } else if (uTerrain == 3.) {
    h += barchans(q) * smoothstep(95., 190., abs(w.y));
  }
  return h;
}
`;

export const WIND = /* glsl */ `
// Vent : aMat.w porte le poids d'animation des toiles.
// 0..1 = voile (bords tenus à 0), 1..2 = pavillon (1 au mât, 2 au bout libre).
vec3 wind(vec3 p, vec3 n, vec4 m, float t){
  if (m.x != 6.) return p;
  float w = m.w;
  if (w > 1.) {
    float f = w - 1.;
    float wave = sin(p.x*1.9 + t*7.5) + .45*sin(p.x*3.7 - p.y*2. + t*11.);
    return p + vec3(f*.12*sin(t*5.3 + p.y), f*.08*sin(t*6.1 + p.x*2.), f*(.38*wave + .12));
  }
  float gust = .6 + .4*sin(t*.7) * sin(t*.43 + 1.3);
  float ripple = sin(p.y*1.3 + p.z*.9 + t*3.1)*.5 + sin(p.z*2.1 - t*4.3 + p.y)*.25;
  return p + n * w * (.35*gust + .14*ripple);
}
`;

export const SKY_FN = /* glsl */ `
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

export const DEFORM_FN = /* glsl */ `
// Déformation d'un sommet en monde : vent des toiles, dunes et leur relief,
// houle de la brume, rochers posés sur le sable.
void deformVertex(vec3 pos, vec3 nrm, vec4 m, mat4 model, out vec4 wp, out vec3 n){
  n = nrm;
  vec3 p = wind(pos, nrm, m, uTime);
  wp = model * vec4(p, 1.);
  if (m.x == 8.) {
    vec2 q = wp.xz + vec2(uScroll, 0.);
    float k = smoothstep(260., 850., length(wp.xz));
    // Autour d'une ville, le sol est aplani (place, faubourgs), les dunes reprennent au loin.
    float flat_ = uCalm * (1. - smoothstep(520., 950., length(wp.xz - vec2(uCalmX, 0.))));
    wp.y = mix(terrainH(q, wp.xz), -1., flat_);
    float e = .8 + k*6.;
    vec2 ex = vec2(e, 0.), ez = vec2(0., e);
    n = normalize(vec3(
      terrainH(q-ex, wp.xz-ex) - terrainH(q+ex, wp.xz+ex),
      2.*e/max(1. - flat_, .02),
      terrainH(q-ez, wp.xz-ez) - terrainH(q+ez, wp.xz+ez)));
  } else {
    n = mat3(model) * n;
    // Mer de brume : houle lente de volutes.
    if (m.x == 16.) {
      vec2 q = (wp.xz + vec2(uScroll, 0.))*.012;
      wp.y += (fbm(q + vec2(uTime*.05, uTime*.03)) - .5)*7. + sin(wp.x*.02 + uTime*.4)*sin(wp.z*.017 - uTime*.3)*1.6;
    }
    // Rochers posés sur le sable : ils épousent la dune sous eux (m.w = 1).
    if ((m.x == 9. && m.w > .5) || uDrape > .5) {
      vec2 q = wp.xz + vec2(uScroll, 0.);
      wp.y += terrainH(q, wp.xz);
    }
  }
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
uniform float uTime, uScroll, uCalm, uCalmX, uDrape;
out vec3 vWorld; out vec3 vNrm; out vec2 vUv; out vec3 vCol; flat out vec4 vMat; out vec4 vLight;
${COMMON}
${WIND}
${DEFORM_FN}
void main(){
  vec4 wp; vec3 n;
  deformVertex(aPos, aNrm, aMat, uModel, wp, n);
  vWorld = wp.xyz; vNrm = n; vUv = aUv; vCol = aCol; vMat = aMat;
  vLight = uLightVP * wp;
  gl_Position = uViewProj * wp;
}`;

export const SURFACE_FNS = /* glsl */ `
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
`;

/** Motifs des surfaces : entrées N, vWorld, vUv, vCol, vMat ; sorties albedo, metal, rough, emit, N. */
export const SURFACE_HEAD = /* glsl */ `
  float pat = vMat.x;
  vec3 albedo = vCol;
  float metal = vMat.y, rough = vMat.z;
  vec3 emit = vec3(0.);
  float h = 0.;
  float k = 1.;
  vec2 uv = vUv;
  float mpp = length(fwidth(uv));
`;

/** Chaîne des motifs procéduraux (après SURFACE_HEAD). */
export const SURFACE_CHAIN = /* glsl */ `
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
    // Bois patiné : grisé par le soleil et le sable, plus clair sur les faces exposées,
    // coulures sombres verticales et planches remplacées plus fraîches.
    float lum = dot(albedo, vec3(.3, .55, .15));
    float bleach = clamp(.28 + .3*N.y + (dirt-.5)*.4, 0., .7);
    albedo = mix(albedo, vec3(lum)*vec3(1.08, 1., .9)*1.12, bleach);
    float drip = smoothstep(.55, .85, fbm(vec2(uv.x*3.5, uv.y*.12) + 2.)) * smoothstep(.3, .7, fbm(uv*vec2(1.5, .5)));
    albedo *= 1. - drip*.35;
    albedo = mix(albedo, albedo*vec3(1.15, .95, .8), step(.94, id)*.6);
    h = seam*.008 + grain*.0015;
    rough = clamp(rough + .1 + (grain-.5)*.15 + drip*.05, .4, 1.);
  } else if (pat == 2. || pat == 5.) {
    vec3 pl = plates(uv, mpp);
    albedo *= (.86 + .2*fract(pl.z)) * mix(.55, 1., pl.y);
    float grime = fbm(vec2(uv.x*.7, uv.y*2.5));
    albedo *= mix(.7, 1.08, grime);
    h = pl.x;
    rough = clamp(rough + (grime-.5)*.25 + (1.-pl.y)*.2, .15, 1.);
    if (pat == 5.) {
      float streak = fbm(vec2(uv.x*2.6, uv.y*.45)) + fbm(uv*1.3)*.6;
      float m = smoothstep(.88, 1.2, streak + (1.-pl.y)*.25) * .85;
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
    float wrinkle = (sin(uv.y*7. + noise(uv*.8)*5.) * .5 + .5) * detail(mpp, 2.);
    float dirt = fbm(uv*vec2(.5, .8));
    albedo *= mix(.68, 1., seam) * (.94 + weave) * mix(.8, 1.05, dirt);
    // Toile vieillie : jaunie vers le bas, auréoles de sable.
    albedo *= mix(vec3(1.), vec3(.92, .86, .74), smoothstep(.4, .9, fbm(uv*vec2(.3, .15) + 7.)));
    h = (1.-seam)*.002 + wrinkle*.004;
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
    // Savane : herbes sèches en plaques (paille, olive), le sable affleure.
    if (uTerrain == 2.) {
      float pt = fbm(q*.03), pt2 = fbm(q*.25);
      float lum = dot(uSandB, vec3(.2126, .7152, .0722)) / .45;
      vec3 grassC = mix(vec3(.6, .49, .25), vec3(.4, .41, .2), smoothstep(.42, .7, pt)) * (.78 + .44*pt2) * lum;
      float cover = smoothstep(.32, .52, pt + .25*(pt2 - .5));
      albedo = mix(albedo, grassC, cover*.85);
      h = mix(h, (pt2 - .5)*.05 + rip2*.01, cover);
    }
    // Odur : sable très fin qui coule comme de l'eau vers la mer.
    float riv = odurIn(q);
    if (riv > 0.) {
      float fl = sin((q.x - uTime*2.4)*2.2 + q.y*.4 + fbm(q*.07 - vec2(uTime*.12, 0.))*6.) * detail(wm, .4);
      float sheen = fbm(q*.05 - vec2(uTime*.2, 0.));
      // Sable doré, plus fin et plus sombre que les dunes blanches, moiré.
      vec3 gold = albedo * vec3(.86, .63, .4) * (.9 + .2*sheen);
      albedo = mix(albedo, gold, riv);
      h = mix(h, fl*.03 + rip2*.006, riv);
      rough = mix(rough, .62, riv);
    }
  } else if (pat == 16.) {
    // Mer de brume d'Aether : volutes lentes qui se replient sur elles-mêmes,
    // veines lumineuses qui affleurent par endroits.
    vec2 q = (vWorld.xz + vec2(uScroll, 0.))*.0035 + vec2(uTime*.012, uTime*.007);
    float w = fbm(q*2.3 - vec2(uTime*.02, -uTime*.015));
    float m = fbm(q + w*1.7);
    float v = fbm(q*5. + w*2. + vec2(-uTime*.03, uTime*.025));
    albedo = mix(vCol*.42, vCol*1.35, smoothstep(.22, .82, m));
    emit = vCol * vMat.w * (.2 + .55*m + 1.8*smoothstep(.62, .85, v*m*1.5));
    h = m*.9 + v*.25;
    k = 1.;
    rough = 1.; metal = 0.;
  } else if (pat == 14. || pat == 15.) {
    // Façades : coordonnées prises dans le plan du mur (projection selon la normale).
    vec2 q = abs(N.y) > .7 ? vWorld.xz : (abs(N.x) > abs(N.z) ? vWorld.zy : vWorld.xy);
    float mw = length(fwidth(q));
    float vert = 1. - smoothstep(.5, .8, abs(N.y));
    float big = fbm(q*.16 + 3.);
    // Briques (motif 15), ou briques crues sous l'enduit écaillé (motif 14).
    vec2 bq = q*vec2(1.1, 3.2);
    bq.x += step(1., mod(floor(bq.y), 2.))*.5;
    vec2 bf = fract(bq);
    float joint = (1. - smoothstep(.0, .07, bf.x)*smoothstep(1., .93, bf.x)*smoothstep(.0, .1, bf.y)*smoothstep(1., .9, bf.y)) * detail(mw, 3.2);
    float var = hash(floor(bq));
    if (pat == 15.) {
      albedo *= (.78 + .38*var) * (1. - joint*.45) * (.85 + .3*big);
      h = (1. - joint)*.012*detail(mw, 3.2);
    } else {
      float stucco = fbm(q*1.8);
      float flake = smoothstep(.64, .7, fbm(q*.32 + 9.)) * vert;
      albedo *= .84 + .26*big + (stucco - .5)*.14*detail(mw, 1.8);
      vec3 brick = albedo*vec3(.82, .68, .56)*(.8 + .35*var)*(1. - joint*.35);
      albedo = mix(albedo, brick, flake);
      h = (stucco*.004 + flake*(1. - joint)*.008)*detail(mw, 1.8) - flake*.004;
    }
    // Pied de mur sali par le sable, coulures sous les rebords.
    float foot = exp(-max(vWorld.y + 1., 0.)*.55) * vert;
    float streak = smoothstep(.55, .85, fbm(vec2(q.x*1.6, q.y*.07) + 5.)) * vert;
    albedo *= (1. - foot*.38) * (1. - streak*.16);
    albedo = mix(albedo, uSandB*.8, foot*.25);
    rough = .95;
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
`;

export const SURFACE_TAIL = /* glsl */ `
  N = bumpN(N, vWorld, h, k);
`;

/** Motifs des surfaces : entrées N, vWorld, vUv, vCol, vMat ; sorties albedo, metal, rough, emit, N. */
export const SURFACE_BODY = SURFACE_HEAD + SURFACE_CHAIN + SURFACE_TAIL;

/** Brume atmosphérique : modifie col (entrées vWorld, uCam, L, uFog, uFogDensity). */
export const FOG_BODY = /* glsl */ `
  // Atmosphère : brume plus dense au ras du sable, éclairée côté soleil.
  float dist = length(vWorld - uCam);
  vec3 fd = (vWorld - uCam)/max(dist, 1e-3);
  float hAvg = max(.5*(vWorld.y + uCam.y), 0.);
  float dens = uFogDensity * (.75 + .9*exp(-hAvg*.08));
  float fogF = 1. - exp(-dist*dens);
  float sunAmt = pow(max(dot(fd, L), 0.), 6.);
  vec3 haze = mix(uFog, skyColor(vec3(fd.x, max(fd.y, .02), fd.z)), .55) + uSunColor*sunAmt*.14*(1. - uNight*.8);
  col = mix(col, haze, fogF);
`;

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
${SURFACE_FNS}
// Ombres douces : 16 échantillons en disque de Poisson, tournés par pixel.
const vec2 POISSON[16] = vec2[](
  vec2(-.94201624,-.39906216), vec2(.94558609,-.76890725), vec2(-.09418410,-.92938870), vec2(.34495938,.29387760),
  vec2(-.91588581,.45771432), vec2(-.81544232,-.87912464), vec2(-.38277543,.27676845), vec2(.97484398,.75648379),
  vec2(.44323325,-.97511554), vec2(.53742981,-.47373420), vec2(-.26496911,-.41893023), vec2(.79197514,.19090188),
  vec2(-.24188840,.99706507), vec2(-.81409955,.91437590), vec2(.19984126,.78641367), vec2(.14383161,-.14100790));
float shadowAt(vec4 lp, float ndl){
  if (uShadowOn < .5) return 1.;
  vec3 c = lp.xyz/lp.w*.5+.5;
  if (c.x<0.||c.x>1.||c.y<0.||c.y>1.||c.z>1.) return 1.;
  float b = mix(.0022, .0005, clamp(ndl, 0., 1.));
  float ang = 6.2831853*fract(52.9829189*fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
  mat2 rot = mat2(cos(ang), sin(ang), -sin(ang), cos(ang));
  vec2 t = vec2(1.9/2048.);
  float s = 0.;
  for (int i=0;i<16;i++) s += texture(uShadow, vec3(c.xy + rot*POISSON[i]*t, c.z - b));
  return s/16.;
}
void main(){
  vec3 N = normalize(vNrm);
  if (!gl_FrontFacing) N = -N;
${SURFACE_BODY}  vec3 V = normalize(uCam - vWorld);
  vec3 L = uSunDir;
  float NdLr = dot(N, L);
  // La toile diffuse la lumière : éclairage « enveloppant » pour les voiles.
  float NdL = pat == 6. ? max((NdLr + .18)/1.18, 0.) : max(NdLr, 0.);
  float sh = shadowAt(vLight, NdLr);
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
  // Occlusion approchée : ce que le soleil ne voit pas reçoit aussi moins de ciel.
  // Les voiles, fines et claires, reçoivent la lumière renvoyée par le sable et les autres voiles.
  amb *= pat == 6. ? 1.12 : mix(.62, 1., sh);
  if (pat == 6.) amb += uGround*.35*(1. - sh);
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
  // Voiles : la lumière traverse la toile.
  // (la toile s'ombre elle-même dans la carte d'ombres : on n'en garde qu'une part)
  if (pat == 6.) col += albedo * uSunColor * (max(-NdLr, 0.)*.75 + pow(max(dot(-V, L), 0.), 4.)*.4) * mix(.65, 1., sh) * (1. - uNight*.6);
${FOG_BODY}  outColor = vec4(col, 1.);
}`;

export const DEPTH_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=4) in vec4 aMat;
uniform mat4 uModel, uLightVP;
uniform float uTime;
${WIND}
void main(){ gl_Position = uLightVP * uModel * vec4(wind(aPos, aNrm, aMat, uTime), 1.); }`;

export const DEPTH_FS = /* glsl */ `#version 300 es
precision mediump float;
out vec4 o;
void main(){ o = vec4(1.); }`;

export const FULL_VS = /* glsl */ `#version 300 es
out vec2 vUv;
void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2); vUv = p; gl_Position = vec4(p*2.-1., 0., 1.); }`;

/** Ciel dans la direction d : soleil, brume d'horizon, étoiles, lune, nuages. */
export const SKY_BODY = /* glsl */ `
  vec3 c = skyColor(d);
  float s = max(dot(d, uSunDir), 0.);
  c += uSunColor * smoothstep(.9994, .9997, s) * 6. * (1.-uNight);
  c += uSunColor * pow(s, 900.) * 1.5 * (1.-uNight);
  // Bande de brume claire juste au-dessus de l'horizon.
  c += uHorizon * exp(-abs(d.y)*28.) * .22;
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
    vec2 wind = vec2(uTime*.006, uTime*.0015);
    float cl = fbm(q*vec2(.35, 1.4) + wind) + fbm(q*vec2(1.1, 3.2) - wind*1.7)*.35;
    float a = smoothstep(.62, .95, cl) * smoothstep(.0, .12, d.y) * smoothstep(.6, .15, d.y);
    float thick = smoothstep(.75, 1.1, cl);
    vec3 lit = mix(uHorizon*1.2, uSunColor*.55 + uHorizon*.6, pow(s, 3.));
    vec3 cc = mix(lit, uZenith*.9 + uHorizon*.25, thick*.55);
    cc += uSunColor * pow(s, 12.) * (1. - thick) * .6;
    c = mix(c, cc, a*.65);
  }
`;

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
${SKY_BODY}  o = vec4(c, 1.);
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

export const FX_FNS = /* glsl */ `
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float sfbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*vnoise(p);p=p*2.07+vec2(3.1,1.7);a*=.5;}return s;}
`;

/** Étalonnage, vignette, tempête et portail : modifie c (affichage), entrées q = vUv - .5. */
export const FX_BODY = /* glsl */ `
  float l = dot(c, vec3(.2126, .7152, .0722));
  c = mix(vec3(l), c, 1.08);
  c = mix(c, c*c*(3.-2.*c), .22);
  c += vec3(.012, .004, -.01)*smoothstep(.5, 1., l) + vec3(-.006, 0., .012)*(1.-smoothstep(0., .4, l));
  c *= 1. - dot(q, q)*.55;
  if (uStorm > 0.001) {
    // Rideaux de sable qui roulent de droite à gauche, nappes plus denses,
    // filets de grains rapides : la scène disparaît dans la tempête.
    vec2 p = vec2(vUv.x*uAspect, vUv.y);
    float t = uStormT;
    vec2 warp = vec2(sfbm(p*1.3 + vec2(t*.35, t*.1)), sfbm(p*1.3 + vec2(-t*.2, t*.27)+5.));
    float big = sfbm(p*vec2(1.6, 2.6) + warp*1.6 + vec2(t*1.1, 0.));
    float mid = sfbm(p*vec2(5., 9.) + warp*.8 + vec2(t*3.4, t*.2));
    float grains = smoothstep(.8, 1., vnoise(vec2(p.x*2.2 + t*7., p.y*90.))) * smoothstep(.3, .7, sfbm(p*3. + t*.5));
    float dens = uStorm*(.62 + .55*(big-.5) + .3*(mid-.5)) + uStorm*uStorm*.35;
    vec3 sc = uStormColor*(.82 + .38*big) + vec3(.05,.03,0.)*mid;
    c = mix(c, sc, clamp(dens, 0., .96));
    c += uStormColor*grains*uStorm*.12;
    c *= 1. - uStorm*.18*(1.-vUv.y);
  }
  if (uPortal > 0.001) {
    // Passage du portail d'Aether : tunnel de lumière, traits qui filent
    // vers les bords, éclair blanc au plus fort (le décor change dessous).
    vec2 d = vUv - .5;
    d.x *= uAspect;
    float r = length(d);
    float a = atan(d.y, d.x);
    float t = uStormT;
    float streak = smoothstep(.6, 1., vnoise(vec2(a*22., r*4. - t*9.)));
    float rings = .5 + .5*sin(r*38. - t*16.);
    vec3 pc = mix(vec3(.4, .95, 1.), vec3(.8, .55, 1.), .5 + .5*sin(a*2. + t*1.3));
    float tun = smoothstep(.04, .8, r);
    c = mix(c, pc*(.5 + .7*rings*tun), clamp(uPortal*(.2 + .8*tun) + uPortal*uPortal*.55, 0., .97));
    c += pc*streak*uPortal*tun;
    c = mix(c, vec3(1.), pow(uPortal, 9.)*.8);
  }
`;

export const COMPOSITE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex, uBloomA, uBloomB;
uniform float uExposure, uBloom, uGrain, uTime;
// Tempête de sable plein écran : densité 0..1, couleur, horloge, format.
uniform float uStorm, uStormT, uAspect, uPortal;
uniform vec3 uStormColor;
out vec4 o;
${FX_FNS}
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0., 1.); }
void main(){
  vec2 q = vUv-.5;
  // Légère aberration chromatique vers les bords (objectif photo).
  vec2 ca = q*dot(q, q)*.006;
  vec3 c = vec3(texture(uTex, vUv - ca).r, texture(uTex, vUv).g, texture(uTex, vUv + ca).b);
  c += (texture(uBloomA, vUv).rgb*.6 + texture(uBloomB, vUv).rgb*.8) * uBloom;
  c = aces(c*uExposure);
  c = pow(c, vec3(1./2.2));
  // Étalonnage : un peu plus de contraste et de couleur, ombres froides, lumières chaudes.
${FX_BODY}  c += (hash(vUv*vec2(1733., 977.) + uTime) - .5) * uGrain;
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
  vMode = aCol.b > .5 ? 2. : aCol.g;
  if (aCol.b > .5) {
    // Poussières en suspension, éclairées par le soleil : dérive lente, en boucle.
    float t = uTime*(1.5 + aNrm.y*2.) + aNrm.x*90.;
    c = aPos + vec3(-mod(t, 90.) + 45., sin(t*.31 + aNrm.z*9.)*1.5, cos(t*.23 + aNrm.x*7.)*1.2);
    size = .12 + aNrm.y*.22;
    vA = aCol.r * smoothstep(45., 30., abs(c.x - aPos.x));
  } else if (aCol.g > .5) {
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
  if (vMode > 1.5) {
    o = vec4(uDustColor*2.4 + .08, (1. - smoothstep(.0, 1., r)) * vA);
    return;
  }
  o = vec4(vMode > .5 ? uSmokeColor : uDustColor, a);
}`;
