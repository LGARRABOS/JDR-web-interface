import * as THREE from 'three';

// Textures photographiques (Poly Haven, CC0), préparées hors ligne :
//  « _a » : détail d'albédo — la photo divisée par sa couleur moyenne (×½,
//           encodée en gamma 2,2), cavités assombries ; elle module la couleur
//           propre de chaque objet ou biome au lieu de l'imposer ;
//  « _b » : normale (convention OpenGL) en R/G, rugosité en B.
// Toutes rangées dans une seule texture-tableau : couches 0..7 = détails,
// 8..15 = normales/rugosité (un seul échantillonneur pour le matériau).

export const PBR_SETS = [
  'cliff_side',
  'dark_wood',
  'rock_face_03',
  'rust_coarse_01',
  'rusty_metal_03',
  'sand_03',
  'sandstone_cracks',
  'wood_planks',
] as const;

const N = PBR_SETS.length;

/** Texture neutre (détail 1, normale plate) en attendant le chargement. */
export function placeholderPbr(): THREE.DataArrayTexture {
  const d = new Uint8Array(2 * N * 4);
  for (let i = 0; i < 2 * N; i++) {
    const a = i < N;
    d.set(a ? [186, 186, 186, 255] : [128, 128, 210, 255], i * 4);
  }
  const t = new THREE.DataArrayTexture(d, 1, 1, 2 * N);
  t.needsUpdate = true;
  return t;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.decoding = 'async';
    im.onload = () => res(im);
    im.onerror = () => rej(new Error(`texture introuvable : ${url}`));
    im.src = url;
  });
}

/**
 * Charge les 16 images et les range dans une texture-tableau (côté `size`),
 * lignes retournées pour que le haut de la photo corresponde à v = 1.
 */
export async function loadPbr(
  base: string,
  size: number,
  aniso: number
): Promise<THREE.DataArrayTexture> {
  const urls: string[] = [];
  for (const s of PBR_SETS) urls.push(`${base}${s}_a.jpg`);
  for (const s of PBR_SETS) urls.push(`${base}${s}_b.jpg`);
  const imgs = await Promise.all(urls.map(loadImage));
  const layer = size * size * 4;
  const data = new Uint8Array(layer * imgs.length);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas 2D indisponible');
  ctx.imageSmoothingQuality = 'high';
  const row = size * 4;
  imgs.forEach((im, i) => {
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(im, 0, 0, size, size);
    const px = ctx.getImageData(0, 0, size, size).data;
    const off = i * layer;
    for (let y = 0; y < size; y++)
      data.set(
        px.subarray((size - 1 - y) * row, (size - y) * row),
        off + y * row
      );
  });
  const t = new THREE.DataArrayTexture(data, size, size, imgs.length);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  // Une fois envoyée à la carte graphique, la copie en mémoire est inutile.
  t.onUpdate = () => {
    (t.image as { data: Uint8Array | null }).data = null;
  };
  return t;
}

// Couches (voir PBR_SETS) et réglages : taille d'un carreau en mètres.
export const PBR_FNS = /* glsl */ `
uniform highp sampler2DArray uPbr;
uniform float uPbrOn;
const float L_CLIFF = 0., L_DARKWOOD = 1., L_ROCK = 2., L_RUSTC = 3., L_RUSTM = 4., L_SAND = 5., L_STONE = 6., L_PLANKS = 7.;
void pbrSample(vec2 t, vec2 dx, vec2 dy, float l, out vec3 det, out vec3 nb){
  det = pow(textureGrad(uPbr, vec3(t, l), dx, dy).rgb, vec3(2.2)) * 2.;
  nb = textureGrad(uPbr, vec3(t, l + 8.), dx, dy).rgb;
}
void pbrSample(vec2 t, float l, out vec3 det, out vec3 nb){ pbrSample(t, dFdx(t), dFdy(t), l, det, nb); }
// Repère tangent déduit des dérivées (pas de tangentes dans les maillages).
vec3 pbrNormal(vec3 N, vec3 p, vec2 t, vec3 nb, float s){
  vec3 dp1 = dFdx(p), dp2 = dFdy(p);
  vec2 dt1 = dFdx(t), dt2 = dFdy(t);
  vec3 a = cross(dp2, N), b = cross(N, dp1);
  vec3 T = a*dt1.x + b*dt2.x;
  vec3 B = a*dt1.y + b*dt2.y;
  float m = max(dot(T, T), dot(B, B));
  if (m < 1e-20) return N;
  float im = inversesqrt(m);
  vec2 d = (nb.xy*2. - 1.) * s;
  return normalize(T*im*d.x + B*im*d.y + N*sqrt(max(1. - dot(d, d)*.5, .2)));
}
float pbrLum(vec3 c){ return dot(c, vec3(.3, .55, .15)); }
`;

/** Bois (motifs 1 et 11) : photo des planches, lignes décalées, patine du moteur maison. */
export const PBR_WOOD = /* glsl */ `
  {
    vec2 q = pat == 1. ? uv : vec2(uv.y, uv.x);
    vec2 T = pat == 1. ? vec2(5.4, 2.7) : vec2(3.6, 1.8);
    vec2 t = q / T;
    float ty = fract(t.y);
    // Les 9 planches de la photo (bords mesurés) : chacune décalée au hasard,
    // pour que les abouts ne s'alignent pas.
    const float PB[10] = float[10](0., .0996, .2021, .3037, .4248, .5273, .6289, .75, .8643, 1.);
    int ri = 0;
    for (int i = 1; i < 9; i++) if (ty >= PB[i]) ri = i;
    float row = float(ri);
    float rid = row + floor(t.y)*9.;
    vec2 ts = vec2(t.x + hash(vec2(rid, 7.1)), t.y);
    vec2 gx = dFdx(t), gy = dFdy(t);
    // Joints soulignés (calfatage) : bords des planches et abouts, antialiasés.
    float dy = min(ty - PB[ri], PB[ri + 1] - ty) * T.y;
    float dx = min(fract(ts.x), 1. - fract(ts.x)) * T.x;
    float fy = max(length(vec2(gx.y, gy.y))*T.y, 1e-5), fx = max(length(vec2(gx.x, gy.x))*T.x, 1e-5);
    // Trait d'au moins un pixel ; plus pâle quand il devient plus fin que le pixel.
    float wy = max(.005, fy*.6), wx = max(.004, fx*.6);
    float seam = mix(1., smoothstep(wy - fy, wy + fy, dy), clamp(.012/fy, .35, 1.))
               * mix(1., smoothstep(wx - fx, wx + fx, dx), clamp(.01/fx, .25, 1.));
    vec3 det, nb;
    pbrSample(ts, gx, gy, L_PLANKS, det, nb);
    // Bois sombre (coques foncées) : veinage du bois verni, joints des planches gardés.
    float dk = 1. - smoothstep(.035, .09, pbrLum(vCol));
    if (dk > 0.) {
      vec3 d2, n2;
      pbrSample(ts*vec2(2., 1.), gx*vec2(2., 1.), gy*vec2(2., 1.), L_DARKWOOD, d2, n2);
      det = mix(det, d2*mix(1., pbrLum(det), .45), dk);
      nb.z = mix(nb.z, n2.z, dk);
    }
    float id = hash(vec2(rid, floor(ts.x)));
    albedo *= det * (.9 + .2*id) * mix(.5, 1., seam);
    float dirt = fbm(uv*vec2(.4, 1.2) + 4.);
    float streak = fbm(vec2(uv.x*2.2, uv.y*.25) + 9.);
    albedo *= mix(.8, 1.05, dirt) * mix(.78, 1.03, smoothstep(.25, .65, streak));
    // Patine : grisé par le soleil et le sable sur les faces exposées, coulures sombres.
    float lum = pbrLum(albedo);
    float bleach = clamp(.22 + .28*N.y + (dirt-.5)*.4, 0., .6) * (1. - dk*.7);
    albedo = mix(albedo, vec3(lum)*vec3(1.08, 1., .9)*1.1, bleach);
    float drip = smoothstep(.55, .85, fbm(vec2(uv.x*3.5, uv.y*.12) + 2.)) * smoothstep(.3, .7, fbm(uv*vec2(1.5, .5)));
    albedo *= 1. - drip*.3;
    N = pbrNormal(N, vWorld, t, nb, 1.);
    rough = clamp(mix(rough, nb.z, .6) + drip*.05 - dk*.12, .3, 1.);
  }
`;

/** Détail photographique ajouté aux autres motifs (après la chaîne du moteur maison). */
export const PBR_DETAIL = /* glsl */ `
  if (pat == 2. || pat == 5. || pat == 10. || pat == 13.) {
    // Tôles, cuivre patiné, fonte, rouille.
    bool coarse = pat >= 10.;
    float amt = pat == 2. ? .65 : pat == 5. ? .4 : pat == 10. ? .55 : 1.;
    vec2 t = uv / (coarse ? 1.2 : 1.4);
    vec3 det, nb;
    pbrSample(t, coarse ? L_RUSTC : L_RUSTM, det, nb);
    albedo *= mix(vec3(1.), det, amt);
    N = pbrNormal(N, vWorld, t, nb, .5 + .5*amt);
    rough = clamp(rough + (nb.z - .8)*amt*1.2, .08, 1.);
    // Taches de rouille (plus rouges et sombres que la moyenne) : plus de métal nu.
    float rust = smoothstep(.15, .5, det.r - det.b) * amt;
    metal *= 1. - rust*.8;
    rough = mix(rough, .9, rust*.6);
  } else if (pat == 8.) {
    // Sable : deux échelles croisées pour casser la répétition.
    vec2 q = vWorld.xz + vec2(uScroll, 0.);
    vec2 t1 = q / 2.2;
    vec2 t2 = mat2(.8, -.6, .6, .8) * q / 7.7;
    vec3 d1, n1, d2, n2;
    pbrSample(t1, L_SAND, d1, n1);
    pbrSample(t2, L_SAND, d2, n2);
    float w = smoothstep(.3, .7, fbm(q*.05));
    albedo *= mix(vec3(1.), mix(d1, d2, w), .6);
    // Grain fin, discret : il ne doit pas effacer les rides du vent ni le modelé des dunes.
    float near = 1. - smoothstep(25., 140., length(vWorld - uCam));
    N = pbrNormal(N, vWorld, t1, mix(n1, vec3(.5, .5, 1.), w), .45*near);
    N = pbrNormal(N, vWorld, t2, mix(vec3(.5, .5, 1.), n2, w), .45*near);
  } else if (pat == 9.) {
    // Roche : falaise stratifiée sur les flancs, roche fracturée au-dessus (triplanaire).
    vec3 aw = pow(abs(N), vec3(4.));
    aw /= aw.x + aw.y + aw.z;
    vec3 det = vec3(0.), nb, N2 = vec3(0.);
    vec2 tx = vWorld.zy / 6., ty = vWorld.xz / 4.5, tz = vWorld.xy / 6.;
    if (aw.x > .02) { vec3 d; pbrSample(tx, L_CLIFF, d, nb); det += d*aw.x; N2 += pbrNormal(N, vWorld, tx, nb, 1.3)*aw.x; }
    if (aw.y > .02) { vec3 d; pbrSample(ty, L_ROCK, d, nb); det += d*aw.y; N2 += pbrNormal(N, vWorld, ty, nb, 1.1)*aw.y; }
    if (aw.z > .02) { vec3 d; pbrSample(tz, L_CLIFF, d, nb); det += d*aw.z; N2 += pbrNormal(N, vWorld, tz, nb, 1.3)*aw.z; }
    det /= max(aw.x*step(.02, aw.x) + aw.y*step(.02, aw.y) + aw.z*step(.02, aw.z), 1e-3);
    albedo *= det;
    N = normalize(N2);
  } else if (pat == 14. || pat == 15.) {
    // Façades : enduit fissuré, ou grain de la brique.
    vec2 q = abs(N.y) > .7 ? vWorld.xz : (abs(N.x) > abs(N.z) ? vWorld.zy : vWorld.xy);
    float amt = pat == 14. ? 1. : .45;
    vec2 t = q / (pat == 14. ? 2.4 : 1.3);
    vec3 det, nb;
    pbrSample(t, L_STONE, det, nb);
    albedo *= mix(vec3(1.), det, amt);
    N = pbrNormal(N, vWorld, t, nb, amt);
    rough = clamp(mix(rough, nb.z, amt), .3, 1.);
  }
`;
