import * as THREE from 'three';
import { CrewCast } from './crewCast';
import type { RefMaterials } from './ref/materials';

// Cabine du capitaine autour de la maquette : grand bureau, objets de
// navigation (compas, sextant, longue-vue, compas à pointes, sablier),
// bougies, encrier et plume, livres, cartes roulées, et la cabine elle-même
// (lambris, hublot sur la brume, étagères, lanterne).
//
// Échelle : la maquette (unités de la carte) est posée sur le bureau ;
// 1 m réel ≈ 44 unités.

function rnd(seed: number) {
  let h = seed >>> 0 || 1;
  return () => (h = (h * 16807) % 2147483647) / 2147483647;
}

/** Géométrie aux UV en mètres réels (bois et métal ne s'étirent pas). */
function uvScale<T extends THREE.BufferGeometry>(g: T, s: number) {
  const uv = g.attributes.uv as THREE.BufferAttribute | undefined;
  if (uv)
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
  return g;
}

export interface Cabin {
  group: THREE.Group;
  /** Flammes et lanterne qui vacillent. */
  update(time: number): void;
  dispose(): void;
}

/**
 * `W`, `D` : taille de la maquette ; `top` : hauteur du dessus du bureau.
 */
export function buildCabin(
  lib: RefMaterials,
  W: number,
  D: number,
  top: number
): Cabin {
  const g = new THREE.Group();
  const own: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => {
    own.push(x);
    return x;
  };
  const mesh = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
    cast = true
  ) => {
    const m = new THREE.Mesh(keep(geo), mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const mat = (o: THREE.MeshStandardMaterialParameters) =>
    keep(new THREE.MeshStandardMaterial(o));
  const wax = mat({ color: '#efe4c8', roughness: 0.6 });
  const parchment = lib.canvas.clone();
  parchment.color.set('#e4cf9c');
  keep(parchment);
  const leather = ['#5a1f1a', '#1f3a2a', '#4a3220', '#2a2440'].map((c) =>
    mat({ color: c, roughness: 0.75 })
  );
  const paper = mat({ color: '#efe3c4', roughness: 0.9 });
  const gold = mat({ color: '#d8a640', metalness: 1, roughness: 0.35 });
  const red = mat({ color: '#8a1c14', roughness: 0.5 });
  const ink = mat({ color: '#0d0c14', roughness: 0.1, metalness: 0.2 });
  const glass = mat({
    color: '#cfe8f0',
    roughness: 0.05,
    transparent: true,
    opacity: 0.35,
  });
  const feather = mat({
    color: '#f2efe6',
    roughness: 0.8,
    side: THREE.DoubleSide,
  });

  // --- Bureau ---
  const BW = W + 46,
    BD = D + 34,
    BH = 4;
  const desk = mesh(
    uvScale(new THREE.BoxGeometry(BW, BH, BD), 0.6),
    lib.darkWood,
    0,
    top - BH / 2,
    4
  );
  desk.castShadow = false;
  // Moulure de laiton sur le chant.
  for (const [w, d, x, z] of [
    [BW + 0.6, 0.6, 0, 4 - BD / 2],
    [BW + 0.6, 0.6, 0, 4 + BD / 2],
    [0.6, BD, -BW / 2, 4],
    [0.6, BD, BW / 2, 4],
  ] as const)
    mesh(new THREE.BoxGeometry(w, 0.7, d), lib.brass, x, top - 0.5, z, false);
  // Pieds massifs (on les devine en vue rasante).
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      mesh(
        uvScale(new THREE.BoxGeometry(5, 34, 5), 0.3),
        lib.darkWood,
        sx * (BW / 2 - 5),
        top - BH - 17,
        4 + sz * (BD / 2 - 5)
      );

  // --- Cabine : plancher, lambris, plafond à poutres ---
  const floorY = top - BH - 34;
  const RW = BW + 260,
    RD = BD + 300,
    RH = 150;
  const floor = mesh(
    uvScale(new THREE.PlaneGeometry(RW, RD), 0.12),
    lib.deck,
    0,
    floorY,
    0,
    false
  );
  floor.rotation.x = -Math.PI / 2;
  const wallMat = lib.hullWood;
  const back = mesh(
    uvScale(new THREE.PlaneGeometry(RW, RH), 0.12),
    wallMat,
    0,
    floorY + RH / 2,
    -RD / 2,
    false
  );
  void back;
  const left = mesh(
    uvScale(new THREE.PlaneGeometry(RD, RH), 0.12),
    wallMat,
    -RW / 2,
    floorY + RH / 2,
    0,
    false
  );
  left.rotation.y = Math.PI / 2;
  const right = mesh(
    uvScale(new THREE.PlaneGeometry(RD, RH), 0.12),
    wallMat,
    RW / 2,
    floorY + RH / 2,
    0,
    false
  );
  right.rotation.y = -Math.PI / 2;
  const front = mesh(
    uvScale(new THREE.PlaneGeometry(RW, RH), 0.12),
    wallMat,
    0,
    floorY + RH / 2,
    RD / 2,
    false
  );
  front.rotation.y = Math.PI;
  const ceil = mesh(
    uvScale(new THREE.PlaneGeometry(RW, RD), 0.12),
    lib.darkWood,
    0,
    floorY + RH,
    0,
    false
  );
  ceil.rotation.x = Math.PI / 2;
  for (let i = -3; i <= 3; i++)
    mesh(
      uvScale(new THREE.BoxGeometry(RW, 6, 5), 0.3),
      lib.darkWood,
      0,
      floorY + RH - 3,
      i * 32,
      false
    );
  // Membrures le long des murs.
  for (let i = -4; i <= 4; i++) {
    mesh(
      new THREE.BoxGeometry(4, RH, 3),
      lib.darkWood,
      i * (RW / 9),
      floorY + RH / 2,
      -RD / 2 + 1.5,
      false
    );
  }

  const zW = -RD / 2;
  // --- Galerie de poupe : grandes fenêtres à petits carreaux sur la brume ---
  const skyTex = (() => {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 512;
    const c = cv.getContext('2d')!;
    const gr = c.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, '#6d58b8');
    gr.addColorStop(0.55, '#c9b2ff');
    gr.addColorStop(0.75, '#efe4ff');
    gr.addColorStop(1, '#b49ae6');
    c.fillStyle = gr;
    c.fillRect(0, 0, 256, 512);
    const rr = rnd(31);
    // Nuages et îles lointaines en silhouette.
    for (let i = 0; i < 40; i++) {
      c.fillStyle = `rgba(255,255,255,${0.08 + rr() * 0.12})`;
      c.beginPath();
      c.ellipse(
        rr() * 256,
        300 + rr() * 200,
        30 + rr() * 60,
        8 + rr() * 14,
        0,
        0,
        Math.PI * 2
      );
      c.fill();
    }
    c.fillStyle = 'rgba(70,50,120,0.55)';
    for (let i = 0; i < 3; i++) {
      const x = 30 + rr() * 200,
        y = 160 + rr() * 140,
        w = 20 + rr() * 30;
      c.beginPath();
      c.moveTo(x - w, y);
      c.lineTo(x + w, y);
      c.lineTo(x + w * 0.2, y + w * 0.9);
      c.closePath();
      c.fill();
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return keep(t);
  })();
  const winW = 26,
    winH = 64,
    winGap = 7,
    winN = 5,
    winY = floorY + 52;
  const galW = winN * winW + (winN - 1) * winGap;
  const velvet = keep(
    new THREE.MeshPhysicalMaterial({
      color: '#6a1f1c',
      roughness: 0.8,
      sheen: 1,
      sheenColor: new THREE.Color('#c0605a'),
    })
  );
  for (let i = 0; i < winN; i++) {
    const x = -galW / 2 + winW / 2 + i * (winW + winGap);
    // Chaque fenêtre montre un morceau différent du ciel.
    const tex = keep(skyTex.clone());
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(0.45, 1);
    tex.offset.set(i * 0.19, 0);
    tex.needsUpdate = true;
    mesh(
      new THREE.PlaneGeometry(winW, winH),
      keep(new THREE.MeshBasicMaterial({ map: tex })),
      x,
      winY + winH / 2,
      zW + 0.6,
      false
    );
    // Croisillons et cadre.
    for (const dx of [-winW / 2, -winW / 6, winW / 6, winW / 2])
      mesh(
        new THREE.BoxGeometry(
          dx === -winW / 2 || dx === winW / 2 ? 2.2 : 0.9,
          winH,
          1.6
        ),
        lib.darkWood,
        x + dx,
        winY + winH / 2,
        zW + 1.2,
        false
      );
    for (let k = 0; k <= 4; k++)
      mesh(
        new THREE.BoxGeometry(winW, k === 0 || k === 4 ? 2.2 : 0.9, 1.6),
        lib.darkWood,
        x,
        winY + (k * winH) / 4,
        zW + 1.2,
        false
      );
    // Pilastre sculpté entre deux fenêtres, chapiteau de laiton.
    if (i < winN - 1) {
      const px = x + winW / 2 + winGap / 2;
      mesh(
        new THREE.BoxGeometry(winGap - 1, winH + 8, 4),
        lib.hullWood,
        px,
        winY + winH / 2,
        zW + 2,
        false
      );
      mesh(
        new THREE.BoxGeometry(winGap + 1, 2, 5),
        lib.brass,
        px,
        winY + winH + 4,
        zW + 2.4,
        false
      );
    }
  }
  // Linteau et allège ; banquette de velours sous les fenêtres.
  mesh(
    uvScale(new THREE.BoxGeometry(galW + 14, 8, 6), 0.3),
    lib.darkWood,
    0,
    winY + winH + 6,
    zW + 3,
    false
  );
  mesh(
    uvScale(new THREE.BoxGeometry(galW + 10, winY - floorY - 14, 16), 0.3),
    lib.hullWood,
    0,
    floorY + (winY - floorY - 14) / 2,
    zW + 8,
    false
  );
  mesh(new THREE.BoxGeometry(galW + 6, 5, 18), velvet, 0, winY - 11.5, zW + 9);
  for (let i = 0; i < 4; i++)
    mesh(
      new THREE.CapsuleGeometry(4, 8, 4, 10),
      velvet,
      -galW / 2 + 22 + i * (galW / 4),
      winY - 4,
      zW + 6
    ).rotation.z = Math.PI / 2;
  // Lumière froide qui entre par la galerie, et ses rayons.
  const cool = new THREE.DirectionalLight('#c4b2ff', 1.1);
  cool.position.set(0, winY + winH, zW);
  cool.target.position.set(0, top, 0);
  g.add(cool, cool.target);
  const shaftM = keep(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader:
        'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `varying vec2 vUv; void main(){ float a = smoothstep(0., .25, vUv.x) * smoothstep(1., .75, vUv.x) * vUv.y * .06; gl_FragColor = vec4(vec3(.8,.72,1.) * a, a); }`,
    })
  );
  for (let i = 0; i < winN; i++) {
    const x = -galW / 2 + winW / 2 + i * (winW + winGap);
    const sh = mesh(
      new THREE.PlaneGeometry(winW, 150),
      shaftM,
      x,
      winY - 20,
      zW + 60,
      false
    );
    sh.rotation.x = -1.0;
    sh.renderOrder = 5;
  }
  // Poussières qui flottent dans la lumière.
  const motes = (() => {
    const n = 140;
    const pos = new Float32Array(n * 3);
    const rr = rnd(5);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rr() - 0.5) * galW;
      pos[i * 3 + 1] = floorY + 10 + rr() * 110;
      pos[i * 3 + 2] = zW + 12 + rr() * 70;
    }
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = keep(
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `uniform float uTime; varying float vA;
void main(){ vec3 p = position; float s = fract(sin(dot(p.xz, vec2(12.9,78.2))) * 43758.5);
  p.y += sin(uTime * .3 + s * 20.) * 3.; p.x += sin(uTime * .2 + s * 9.) * 2.;
  vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
  gl_PointSize = (0.6 + s * 0.9) * 300. / max(1., -mv.z); vA = .15 + .35 * s; }`,
        fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(vec3(1., .92, .8) * vA * (1. - d * 2.), 1.); }`,
      })
    );
    const pts = new THREE.Points(geo, m);
    g.add(pts);
    return m;
  })();

  // --- Bibliothèques de part et d'autre de la galerie ---
  const r = rnd(7);
  const bottle = mat({
    color: '#2f6a4a',
    roughness: 0.08,
    transparent: true,
    opacity: 0.7,
  });
  for (const sx of [-1, 1]) {
    const cx = sx * (galW / 2 + 30);
    const bw = 40,
      bh = 112;
    mesh(
      uvScale(new THREE.BoxGeometry(bw + 4, bh, 4), 0.3),
      lib.darkWood,
      cx,
      floorY + bh / 2,
      zW + 2,
      false
    );
    for (const dx of [-bw / 2, bw / 2])
      mesh(
        uvScale(new THREE.BoxGeometry(3, bh, 16), 0.3),
        lib.darkWood,
        cx + dx,
        floorY + bh / 2,
        zW + 9,
        false
      );
    mesh(
      uvScale(new THREE.BoxGeometry(bw + 8, 5, 19), 0.3),
      lib.darkWood,
      cx,
      floorY + bh + 1,
      zW + 9,
      false
    );
    mesh(
      new THREE.BoxGeometry(bw + 8, 1.2, 1),
      lib.brass,
      cx,
      floorY + bh - 1,
      zW + 18.6,
      false
    );
    for (let row = 0; row < 5; row++) {
      const y = floorY + 6 + row * 21;
      mesh(
        new THREE.BoxGeometry(bw, 1.4, 15),
        lib.darkWood,
        cx,
        y,
        zW + 9,
        false
      );
      let x = cx - bw / 2 + 1.5;
      while (x < cx + bw / 2 - 4) {
        const k = r();
        if (k < 0.08 && x < cx + bw / 2 - 8) {
          // Bouteille (avec un navire dedans, une fois sur deux).
          const b = mesh(
            new THREE.CapsuleGeometry(2.2, 6, 6, 12),
            bottle,
            x + 3,
            y + 6,
            zW + 10,
            false
          );
          b.rotation.z = row % 2 ? Math.PI / 2 : 0;
          x += 7;
          continue;
        }
        if (k < 0.12 && x < cx + bw / 2 - 8) {
          // Instrument de laiton.
          mesh(
            new THREE.CylinderGeometry(2.2, 2.2, 1.2, 16),
            lib.brass,
            x + 3,
            y + 1.4,
            zW + 10,
            false
          ).rotation.x = Math.PI / 2;
          x += 7;
          continue;
        }
        const w = 1.4 + r() * 2.2,
          h = 11 + r() * 6;
        const b = mesh(
          new THREE.BoxGeometry(w, h, 9 + r() * 3),
          leather[Math.floor(r() * leather.length)],
          x + w / 2,
          y + 0.7 + h / 2,
          zW + 10,
          false
        );
        if (r() < 0.1) b.rotation.z = 0.22;
        x += w + 0.2;
      }
    }
  }

  // --- Horloge de parquet (à droite) : balancier qui oscille ---
  const pendulum = new THREE.Group();
  {
    const x = galW / 2 + 70,
      z = zW + 10;
    mesh(
      uvScale(new THREE.BoxGeometry(18, 100, 12), 0.3),
      lib.hullWood,
      x,
      floorY + 50,
      z,
      false
    );
    mesh(
      uvScale(new THREE.BoxGeometry(22, 8, 14), 0.3),
      lib.darkWood,
      x,
      floorY + 104,
      z,
      false
    );
    const fc = document.createElement('canvas');
    fc.width = fc.height = 256;
    const f = fc.getContext('2d')!;
    f.fillStyle = '#efe4c8';
    f.beginPath();
    f.arc(128, 128, 120, 0, Math.PI * 2);
    f.fill();
    f.strokeStyle = '#3a2a18';
    f.lineWidth = 6;
    f.stroke();
    f.fillStyle = '#3a2a18';
    f.font = 'bold 30px Georgia, serif';
    f.textAlign = 'center';
    f.textBaseline = 'middle';
    ['XII', 'III', 'VI', 'IX'].forEach((t, i) =>
      f.fillText(
        t,
        128 + Math.sin((i * Math.PI) / 2) * 92,
        128 - Math.cos((i * Math.PI) / 2) * 92
      )
    );
    f.lineWidth = 7;
    f.beginPath();
    f.moveTo(128, 128);
    f.lineTo(128 + 55, 128 - 30);
    f.moveTo(128, 128);
    f.lineTo(128 - 10, 128 - 80);
    f.stroke();
    const ft = keep(new THREE.CanvasTexture(fc));
    ft.colorSpace = THREE.SRGBColorSpace;
    mesh(
      new THREE.CircleGeometry(7, 32),
      keep(new THREE.MeshStandardMaterial({ map: ft, roughness: 0.6 })),
      x,
      floorY + 86,
      z + 6.1,
      false
    );
    mesh(
      new THREE.TorusGeometry(7.3, 0.6, 8, 32),
      lib.brass,
      x,
      floorY + 86,
      z + 6.2,
      false
    );
    // Fenêtre du balancier.
    mesh(
      new THREE.PlaneGeometry(10, 40),
      keep(
        new THREE.MeshStandardMaterial({ color: '#120c08', roughness: 0.9 })
      ),
      x,
      floorY + 52,
      z + 6.05,
      false
    );
    pendulum.position.set(x, floorY + 72, z + 6.3);
    const rod = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(0.25, 0.25, 26, 6)),
      lib.brass
    );
    rod.position.y = -13;
    const bob = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(3.4, 3.4, 0.6, 24)),
      lib.brass
    );
    bob.rotation.x = Math.PI / 2;
    bob.position.y = -27;
    pendulum.add(rod, bob);
    g.add(pendulum);
    mesh(
      new THREE.PlaneGeometry(10.5, 42),
      glass,
      x,
      floorY + 52,
      z + 6.6,
      false
    );
  }

  // --- Poêle de fonte (à gauche) : feu qui rougeoie ---
  let fireLight: THREE.PointLight;
  let fireGlow: THREE.MeshBasicMaterial;
  {
    const x = -galW / 2 - 72,
      z = zW + 26;
    mesh(
      new THREE.CylinderGeometry(11, 12, 30, 24),
      lib.castIron,
      x,
      floorY + 22,
      z
    );
    mesh(
      new THREE.CylinderGeometry(13, 13, 2.5, 24),
      lib.castIron,
      x,
      floorY + 38,
      z
    );
    mesh(
      new THREE.CylinderGeometry(12.5, 11, 4, 24),
      lib.brass,
      x,
      floorY + 6,
      z
    );
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      mesh(
        new THREE.CylinderGeometry(1.2, 0.8, 6, 8),
        lib.castIron,
        x + Math.cos(a) * 10,
        floorY + 3,
        z + Math.sin(a) * 10
      );
    }
    mesh(
      new THREE.CylinderGeometry(3, 3, RH - 40, 14),
      lib.castIron,
      x,
      floorY + 39 + (RH - 40) / 2,
      z,
      false
    );
    fireGlow = keep(new THREE.MeshBasicMaterial({ color: '#ff7a2a' }));
    mesh(
      new THREE.PlaneGeometry(11, 9),
      fireGlow,
      x + 0.5,
      floorY + 20,
      z + 11.6,
      false
    ).rotation.y = 0.05;
    for (let k = 0; k < 4; k++)
      mesh(
        new THREE.BoxGeometry(0.8, 9.5, 0.8),
        lib.castIron,
        x - 3.5 + k * 2.4,
        floorY + 20,
        z + 12,
        false
      );
    fireLight = new THREE.PointLight('#ff8a3a', 700, 160, 1.7);
    fireLight.position.set(x, floorY + 22, z + 18);
    g.add(fireLight);
    // Bûches à côté.
    for (let k = 0; k < 4; k++) {
      const log = mesh(
        new THREE.CylinderGeometry(2.2, 2.2, 18, 10),
        lib.hullWood,
        x + 22,
        floorY + 2.2 + (k > 2 ? 4 : 0),
        z + 6 + (k % 3) * 4.6
      );
      log.rotation.x = Math.PI / 2;
    }
  }

  // --- Lanternes suspendues qui se balancent avec le roulis ---
  const swing: { g: THREE.Group; phase: number; amp: number }[] = [];
  const lanternAt = (x: number, z: number, y: number, phase: number) => {
    const piv = new THREE.Group();
    piv.position.set(x, floorY + RH - 3, z);
    g.add(piv);
    const L = floorY + RH - 3 - y;
    const part = (geo: THREE.BufferGeometry, m: THREE.Material, yy: number) => {
      const mm = new THREE.Mesh(keep(geo), m);
      mm.position.y = yy;
      piv.add(mm);
      return mm;
    };
    part(
      new THREE.CylinderGeometry(0.25, 0.25, L - 6, 6),
      lib.castIron,
      -(L - 6) / 2
    );
    part(new THREE.CylinderGeometry(3.2, 4, 1.4, 8), lib.brass, -L + 6);
    part(new THREE.ConeGeometry(4, 3, 8), lib.brass, -L + 8);
    part(new THREE.CylinderGeometry(3.4, 3.4, 9, 8, 1, true), glass, -L);
    part(new THREE.CylinderGeometry(4, 3.2, 1.2, 8), lib.brass, -L - 5);
    const fl = part(
      new THREE.SphereGeometry(1.1, 10, 8),
      keep(new THREE.MeshBasicMaterial({ color: '#ffcf7a' })),
      -L
    );
    const light = new THREE.PointLight('#ffb46a', 900, 240, 1.6);
    light.position.y = -L - 2;
    piv.add(light);
    swing.push({ g: piv, phase, amp: 0.05 });
    return { flame: fl, light };
  };
  const { flame: lFlame, light: lantern } = lanternAt(
    -W * 0.25,
    -6,
    top + 52,
    0
  );

  // --- Objets sur le bureau ---
  const y0 = top;
  const L = -W / 2 - 4; // bord gauche de la maquette
  const R = W / 2 + 4;
  const F = D / 2 + 4; // bord avant
  const B = -D / 2 - 4;

  // Bougies (deux, à gauche, au fond) : bougeoir, cire, flamme, lumière.
  const flames: {
    light: THREE.PointLight;
    flame: THREE.Mesh;
    base: number;
    phase: number;
  }[] = [];
  const candle = (x: number, z: number, h: number, phase: number) => {
    mesh(
      new THREE.CylinderGeometry(3, 3.4, 0.6, 24),
      lib.brass,
      x,
      y0 + 0.3,
      z
    );
    mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 2, 10),
      lib.brass,
      x,
      y0 + 1.4,
      z
    );
    mesh(
      new THREE.CylinderGeometry(1.4, 1.6, 1, 16),
      lib.brass,
      x,
      y0 + 2.6,
      z
    );
    mesh(new THREE.CylinderGeometry(0.95, 1, h, 16), wax, x, y0 + 3 + h / 2, z);
    // Coulures.
    for (let k = 0; k < 3; k++) {
      const a = phase * 3 + k * 2.1;
      mesh(
        new THREE.CapsuleGeometry(0.22, 1.2 + k * 0.6, 4, 6),
        wax,
        x + Math.cos(a),
        y0 + 3 + h - 1.2 - k * 0.4,
        z + Math.sin(a),
        false
      );
    }
    const fl = new THREE.Mesh(
      keep(new THREE.SphereGeometry(0.5, 10, 8)),
      keep(new THREE.MeshBasicMaterial({ color: '#ffd27a' }))
    );
    fl.scale.set(1, 2.2, 1);
    fl.position.set(x, y0 + 3 + h + 1.1, z);
    g.add(fl);
    const pl = new THREE.PointLight('#ff9f4a', 160, 90, 1.8);
    pl.position.set(x, y0 + 3 + h + 2, z);
    g.add(pl);
    flames.push({ light: pl, flame: fl, base: 160, phase });
  };
  candle(L - 10, B + 2, 8, 0.3);
  candle(L - 4.5, B - 4, 5.5, 1.7);

  // Compas de route (boussole) à droite, devant.
  {
    const x = R + 9,
      z = F - 6;
    mesh(
      new THREE.CylinderGeometry(4, 4.2, 1.6, 40),
      lib.brass,
      x,
      y0 + 0.8,
      z
    );
    mesh(
      new THREE.CylinderGeometry(3.4, 3.4, 0.1, 40),
      paper,
      x,
      y0 + 1.62,
      z,
      false
    );
    const needle = mesh(
      new THREE.ConeGeometry(0.35, 5.2, 4),
      red,
      x,
      y0 + 1.8,
      z,
      false
    );
    needle.rotation.set(Math.PI / 2, 0, 0.6);
    mesh(
      new THREE.CylinderGeometry(3.6, 3.6, 0.2, 40),
      glass,
      x,
      y0 + 1.9,
      z,
      false
    );
    mesh(
      new THREE.TorusGeometry(3.9, 0.3, 8, 40),
      lib.brass,
      x,
      y0 + 1.9,
      z,
      false
    ).rotation.x = Math.PI / 2;
  }

  // Sextant posé à plat, à droite au fond.
  {
    const x = R + 10,
      z = B + 4;
    const arc = mesh(
      new THREE.TorusGeometry(6, 0.35, 6, 32, Math.PI / 3),
      lib.brass,
      x,
      y0 + 0.4,
      z
    );
    arc.rotation.set(-Math.PI / 2, 0, Math.PI * 1.33);
    for (const a of [-0.52, 0.52]) {
      const arm = mesh(
        new THREE.BoxGeometry(0.4, 0.3, 6),
        lib.brass,
        x + Math.sin(a) * 3,
        y0 + 0.4,
        z - Math.cos(a) * 3 + 6
      );
      arm.rotation.y = a;
    }
    mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 3, 12),
      lib.darkWood,
      x + 1.6,
      y0 + 0.6,
      z + 6.4
    ).rotation.z = Math.PI / 2;
  }

  // Longue-vue couchée devant la maquette.
  {
    const z = F + 7;
    const tube = (r0: number, len: number, x: number, m: THREE.Material) => {
      const t = mesh(
        new THREE.CylinderGeometry(r0, r0, len, 20),
        m,
        x,
        y0 + 1.4,
        z
      );
      t.rotation.z = Math.PI / 2;
    };
    tube(1.4, 12, -4, lib.darkWood);
    tube(1.15, 8, 6, lib.brass);
    tube(0.95, 6, 12.5, lib.brass);
    for (const x of [-10, 2, 10]) tube(1.55, 0.6, x, lib.brass);
  }

  // Encrier et plume, à gauche devant.
  {
    const x = L - 9,
      z = F - 4;
    mesh(new THREE.CylinderGeometry(1.8, 2.2, 3, 16), ink, x, y0 + 1.5, z);
    mesh(
      new THREE.CylinderGeometry(0.9, 0.9, 0.6, 16),
      lib.brass,
      x,
      y0 + 3.2,
      z
    );
    // Plume plantée dans l'encrier, penchée vers l'extérieur du bureau.
    const shaft = mesh(
      new THREE.CylinderGeometry(0.06, 0.14, 10, 6),
      feather,
      x - 1.6,
      y0 + 7.2,
      z + 0.6,
      false
    );
    shaft.rotation.set(0.12, 0, 0.38);
    const vane = mesh(
      new THREE.PlaneGeometry(1.6, 6.5),
      feather,
      x - 2.6,
      y0 + 9.4,
      z + 0.9,
      false
    );
    vane.rotation.set(0.12, 0.5, 0.38);
  }

  // Pile de livres, à gauche au milieu.
  {
    let y = y0;
    for (let i = 0; i < 3; i++) {
      const h = 1.8 + i * 0.2;
      const b = mesh(
        new THREE.BoxGeometry(10 - i, h, 7.5 - i * 0.6),
        leather[i],
        L - 10,
        y + h / 2,
        3 + i * 0.4
      );
      b.rotation.y = 0.15 * (i - 1);
      mesh(
        new THREE.BoxGeometry(9.4 - i, h * 0.8, 7.6 - i * 0.6),
        paper,
        L - 9.8,
        y + h / 2,
        3 + i * 0.4,
        false
      ).rotation.y = 0.15 * (i - 1);
      y += h;
    }
    // Sablier dessus.
    const hg = new THREE.LatheGeometry(
      [
        [0.01, 0],
        [1.6, 0.3],
        [1.4, 2],
        [0.25, 3.2],
        [1.4, 4.4],
        [1.6, 6.1],
        [0.01, 6.4],
      ].map(([a, b]) => new THREE.Vector2(a, b)),
      20
    );
    mesh(hg, glass, L - 10, y + 0.6, 3, false);
    mesh(
      new THREE.CylinderGeometry(2, 2, 0.6, 16),
      lib.darkWood,
      L - 10,
      y + 0.3,
      3
    );
    mesh(
      new THREE.CylinderGeometry(2, 2, 0.6, 16),
      lib.darkWood,
      L - 10,
      y + 7.3,
      3
    );
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 7, 6),
        lib.darkWood,
        L - 10 + Math.cos(a) * 1.7,
        y + 3.8,
        3 + Math.sin(a) * 1.7
      );
    }
    mesh(
      new THREE.ConeGeometry(1.1, 1.2, 16),
      mat({ color: '#d8b06a', roughness: 1 }),
      L - 10,
      y + 1.2,
      3,
      false
    );
  }

  // Cartes roulées, au fond, nouées d'un ruban.
  for (let i = 0; i < 3; i++) {
    const roll = mesh(
      uvScale(new THREE.CylinderGeometry(1.3, 1.3, 20 - i * 2, 20), 0.5),
      parchment,
      -6 + i * 7,
      y0 + 1.3 + (i === 1 ? 2.4 : 0),
      B - 9 + (i === 1 ? -1 : 0)
    );
    roll.rotation.set(0, 0.2 * (i - 1), Math.PI / 2);
    const band = mesh(
      new THREE.TorusGeometry(1.35, 0.2, 6, 20),
      red,
      -6 + i * 7,
      y0 + 1.3 + (i === 1 ? 2.4 : 0),
      B - 9 + (i === 1 ? -1 : 0),
      false
    );
    band.rotation.y = Math.PI / 2 + 0.2 * (i - 1);
  }

  // Compas à pointes posé sur le bord de la maquette.
  {
    const x = W / 2 - 4,
      z = D / 2 + 1.2;
    for (const a of [-0.25, 0.25]) {
      const leg = mesh(
        new THREE.CylinderGeometry(0.15, 0.04, 11, 6),
        lib.brass,
        x + Math.sin(a) * 5,
        top + 3.2,
        z,
        false
      );
      leg.rotation.set(0, 0, Math.PI / 2 - 0.05 + a);
    }
    mesh(
      new THREE.SphereGeometry(0.5, 10, 8),
      lib.brass,
      x,
      top + 3.4,
      z,
      false
    );
  }

  // Poids de laiton aux coins de la maquette, et quelques pièces d'or.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      mesh(
        new THREE.CylinderGeometry(1.4, 1.6, 1.8, 20),
        lib.brass,
        sx * (W / 2 + 0.6),
        top + 2.25 + 0.9 - 2.2,
        sz * (D / 2 + 0.6)
      );
      mesh(
        new THREE.SphereGeometry(0.6, 10, 8),
        lib.brass,
        sx * (W / 2 + 0.6),
        top + 2.3,
        sz * (D / 2 + 0.6)
      );
    }
  for (let i = 0; i < 6; i++) {
    const c = mesh(
      new THREE.CylinderGeometry(0.9, 0.9, 0.25, 20),
      gold,
      R + 3 + r() * 6,
      y0 + 0.15 + (i % 3) * 0.26,
      4 + r() * 5
    );
    c.rotation.z = r() * 0.1;
  }

  // Chope en étain, à droite.
  {
    const x = R + 12,
      z = 6;
    const pewter = mat({ color: '#8d8e90', metalness: 0.9, roughness: 0.4 });
    mesh(
      new THREE.CylinderGeometry(2.2, 2.5, 5.5, 24),
      pewter,
      x,
      y0 + 2.75,
      z
    );
    const handle = mesh(
      new THREE.TorusGeometry(1.4, 0.35, 8, 16, Math.PI),
      pewter,
      x + 2.4,
      y0 + 3,
      z,
      false
    );
    handle.rotation.z = -Math.PI / 2;
  }

  // --- Tapis sous le bureau, globe, coffre, tonneau (vus derrière la table) ---
  {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 320;
    const c2 = cv.getContext('2d')!;
    c2.fillStyle = '#5a1e18';
    c2.fillRect(0, 0, 512, 320);
    c2.strokeStyle = '#c9a24a';
    c2.lineWidth = 10;
    c2.strokeRect(18, 18, 476, 284);
    c2.strokeStyle = '#2a1a3a';
    c2.lineWidth = 16;
    c2.strokeRect(44, 44, 424, 232);
    c2.fillStyle = '#c9a24a';
    for (let i = 0; i < 6; i++) {
      c2.beginPath();
      c2.ellipse(256, 160, 150 - i * 22, 80 - i * 12, 0, 0, Math.PI * 2);
      c2.strokeStyle = i % 2 ? '#c9a24a' : '#2a1a3a';
      c2.lineWidth = 6;
      c2.stroke();
    }
    const rt = keep(new THREE.CanvasTexture(cv));
    rt.colorSpace = THREE.SRGBColorSpace;
    const rug = mesh(
      new THREE.PlaneGeometry(BW + 70, BD + 60),
      keep(new THREE.MeshStandardMaterial({ map: rt, roughness: 1 })),
      0,
      floorY + 0.2,
      4,
      false
    );
    rug.rotation.x = -Math.PI / 2;
  }
  const farZ = 4 - BD / 2;
  // Globe terrestre sur pied, à droite au fond.
  {
    const x = BW / 2 + 46,
      z = farZ - 56;
    mesh(
      new THREE.CylinderGeometry(5, 7, 2, 20),
      lib.darkWood,
      x,
      floorY + 1,
      z
    );
    mesh(
      new THREE.CylinderGeometry(1.2, 1.6, 30, 12),
      lib.darkWood,
      x,
      floorY + 17,
      z
    );
    const globe = mesh(
      new THREE.SphereGeometry(9, 28, 18),
      parchment,
      x,
      floorY + 42,
      z
    );
    globe.rotation.z = 0.4;
    const mer = mesh(
      new THREE.TorusGeometry(10, 0.5, 8, 40),
      lib.brass,
      x,
      floorY + 42,
      z
    );
    mer.rotation.set(0, Math.PI / 2, 0.4);
  }
  // Coffre de marin, à gauche au fond.
  {
    const x = -BW / 2 - 34,
      z = farZ - 66;
    mesh(
      uvScale(new THREE.BoxGeometry(26, 14, 15), 0.3),
      lib.hullWood,
      x,
      floorY + 7,
      z
    );
    const lid = mesh(
      new THREE.CylinderGeometry(7.5, 7.5, 26, 16, 1, false, 0, Math.PI),
      lib.hullWood,
      x,
      floorY + 14,
      z
    );
    lid.rotation.z = Math.PI / 2;
    for (const dx of [-9, 9])
      mesh(
        new THREE.BoxGeometry(1.2, 15, 15.4),
        lib.castIron,
        x + dx,
        floorY + 7.5,
        z,
        false
      );
    // Tonneau.
    const barrel = new THREE.LatheGeometry(
      [
        [9, 0],
        [10.5, 8],
        [11, 13],
        [10.5, 18],
        [9, 26],
      ].map(([a, b]) => new THREE.Vector2(a, b)),
      20
    );
    mesh(barrel, lib.hullWood, x + 6, floorY, z - 26);
    for (const y of [4, 13, 22])
      mesh(
        new THREE.TorusGeometry(10.7, 0.5, 6, 30),
        lib.castIron,
        x + 6,
        floorY + y,
        z - 26,
        false
      ).rotation.x = Math.PI / 2;
  }

  // Petite table ronde avec échiquier, chopes et deux chaises.
  const pewter = mat({ color: '#8d8e90', metalness: 0.9, roughness: 0.4 });
  const chair = (x: number, z: number, yaw: number) => {
    const c = new THREE.Group();
    c.position.set(x, floorY, z);
    c.rotation.y = yaw;
    g.add(c);
    const part = (
      geo: THREE.BufferGeometry,
      m: THREE.Material,
      px: number,
      py: number,
      pz: number
    ) => {
      const mm = new THREE.Mesh(keep(geo), m);
      mm.position.set(px, py, pz);
      mm.castShadow = mm.receiveShadow = true;
      c.add(mm);
    };
    part(new THREE.BoxGeometry(18, 2, 18), lib.darkWood, 0, 20, 0);
    part(new THREE.BoxGeometry(17, 2.5, 17), velvet, 0, 22, 0);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        part(
          new THREE.CylinderGeometry(0.9, 0.7, 20, 8),
          lib.darkWood,
          sx * 7.5,
          10,
          sz * 7.5
        );
    part(new THREE.BoxGeometry(2, 26, 18), lib.darkWood, -8.5, 34, 0);
    part(new THREE.BoxGeometry(1, 18, 14), velvet, -7.2, 34, 0);
  };
  {
    const x = -W * 0.48,
      z = farZ - 78;
    mesh(
      new THREE.CylinderGeometry(16, 16, 2, 28),
      lib.darkWood,
      x,
      floorY + 46,
      z
    );
    mesh(
      new THREE.CylinderGeometry(2, 2.5, 44, 12),
      lib.darkWood,
      x,
      floorY + 23,
      z
    );
    mesh(
      new THREE.CylinderGeometry(9, 10, 2, 20),
      lib.darkWood,
      x,
      floorY + 1,
      z
    );
    for (const dx of [-8, 9])
      mesh(
        new THREE.CylinderGeometry(2, 2.2, 5, 16),
        pewter,
        x + dx,
        floorY + 49.5,
        z + (dx > 0 ? 6 : -5)
      );
    // Échiquier en cours de partie.
    const cc = document.createElement('canvas');
    cc.width = cc.height = 128;
    const c2 = cc.getContext('2d')!;
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 8; j++) {
        c2.fillStyle = (i + j) % 2 ? '#2a1a10' : '#e4cf9c';
        c2.fillRect(i * 16, j * 16, 16, 16);
      }
    const ct = keep(new THREE.CanvasTexture(cc));
    ct.colorSpace = THREE.SRGBColorSpace;
    const board = mesh(
      new THREE.BoxGeometry(14, 0.8, 14),
      keep(new THREE.MeshStandardMaterial({ map: ct, roughness: 0.5 })),
      x,
      floorY + 47.4,
      z,
      false
    );
    board.rotation.y = 0.3;
    const rr = rnd(13);
    const ivory = mat({ color: '#efe6d0', roughness: 0.4 });
    const ebony = mat({ color: '#1a1412', roughness: 0.35 });
    for (let k = 0; k < 14; k++) {
      const h = 1.2 + rr() * 1.4;
      const pc = mesh(
        new THREE.CylinderGeometry(0.35, 0.6, h, 10),
        k % 2 ? ivory : ebony,
        x + (rr() - 0.5) * 11,
        floorY + 47.8 + h / 2,
        z + (rr() - 0.5) * 11,
        false
      );
      void pc;
    }
    chair(x - 24, z, 0);
    chair(x + 24, z + 2, Math.PI);
  }
  // Fauteuil du capitaine, derrière le bureau.
  {
    const c = new THREE.Group();
    // Repoussé et tourné de biais : il ne cache pas la galerie.
    c.position.set(W * 0.16, floorY, farZ - 24);
    c.rotation.y = 0.45;
    c.scale.setScalar(0.85);
    g.add(c);
    const part = (
      geo: THREE.BufferGeometry,
      m: THREE.Material,
      px: number,
      py: number,
      pz: number
    ) => {
      const mm = new THREE.Mesh(keep(geo), m);
      mm.position.set(px, py, pz);
      mm.castShadow = mm.receiveShadow = true;
      c.add(mm);
    };
    const hide = mat({ color: '#4a1c14', roughness: 0.55 });
    part(new THREE.BoxGeometry(26, 4, 22), lib.darkWood, 0, 20, 0);
    part(new THREE.BoxGeometry(24, 4, 20), hide, 0, 24, 0);
    part(new THREE.BoxGeometry(28, 52, 4), lib.darkWood, 0, 44, -11);
    part(new THREE.BoxGeometry(23, 44, 2), hide, 0, 46, -9);
    for (const sx of [-1, 1]) {
      part(new THREE.BoxGeometry(3, 14, 22), lib.darkWood, sx * 13.5, 31, 0);
      part(
        new THREE.CylinderGeometry(1.1, 0.9, 20, 8),
        lib.darkWood,
        sx * 11,
        10,
        9
      );
      part(
        new THREE.CylinderGeometry(1.1, 0.9, 20, 8),
        lib.darkWood,
        sx * 11,
        10,
        -9
      );
      part(new THREE.SphereGeometry(2, 12, 10), lib.brass, sx * 13, 71, -11);
    }
    for (let k = 0; k < 7; k++)
      part(
        new THREE.SphereGeometry(0.5, 8, 6),
        lib.brass,
        -10.5 + k * 3.5,
        68,
        -7.9
      );
  }
  // Pipe posée près de la chope, qui fume encore.
  const smoke: { s: THREE.Sprite; t0: number }[] = [];
  {
    const x = R + 6,
      z = 13;
    mesh(
      new THREE.CylinderGeometry(1.1, 0.8, 2, 14),
      lib.darkWood,
      x,
      y0 + 1.6,
      z
    );
    const stem = mesh(
      new THREE.CylinderGeometry(0.22, 0.25, 7, 8),
      lib.darkWood,
      x - 3.5,
      y0 + 0.9,
      z + 0.5
    );
    stem.rotation.z = Math.PI / 2 - 0.2;
    const sc = document.createElement('canvas');
    sc.width = sc.height = 64;
    const sg = sc.getContext('2d')!;
    const grd = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(230,225,220,0.55)');
    grd.addColorStop(1, 'rgba(230,225,220,0)');
    sg.fillStyle = grd;
    sg.fillRect(0, 0, 64, 64);
    const st = keep(new THREE.CanvasTexture(sc));
    for (let k = 0; k < 10; k++) {
      const sp = new THREE.Sprite(
        keep(
          new THREE.SpriteMaterial({
            map: st,
            transparent: true,
            depthWrite: false,
          })
        )
      );
      sp.position.set(x, y0 + 3, z);
      g.add(sp);
      smoke.push({ s: sp, t0: k * 0.6 });
    }
  }

  // --- Équipage : personnages réalistes chargés à part (1 m ≈ 44 unités) ---
  const crew = new CrewCast({ deskW: BW, farZ, floorY, unit: 44 });
  g.add(crew.group);
  own.push(crew);

  return {
    group: g,
    update(time: number) {
      crew.update(time);
      // Roulis : les lanternes et le balancier oscillent, le feu rougeoie,
      // la pipe fume, la poussière danse dans la lumière.
      for (const l of swing) {
        l.g.rotation.z = Math.sin(time * 0.55 + l.phase) * l.amp;
        l.g.rotation.x = Math.sin(time * 0.4 + l.phase * 2) * l.amp * 0.6;
      }
      pendulum.rotation.z = Math.sin(time * Math.PI * 0.5) * 0.16;
      const fk = 0.8 + 0.12 * Math.sin(time * 9) + 0.08 * Math.sin(time * 23.7);
      fireLight.intensity = 700 * fk;
      fireGlow.color.setRGB(1, 0.42 * fk + 0.1, 0.12);
      for (const p of smoke) {
        const u = ((time + p.t0) % 6) / 6;
        p.s.position.y = y0 + 3 + u * 26;
        p.s.position.x = R + 6 + Math.sin(time * 0.8 + p.t0 * 3) * u * 3;
        p.s.scale.setScalar(1.5 + u * 6);
        p.s.material.opacity = Math.sin(u * Math.PI) * 0.5;
      }
      motes.uniforms.uTime.value = time;
      for (const f of flames) {
        const k =
          0.85 +
          0.1 * Math.sin(time * 11 + f.phase * 5) +
          0.06 * Math.sin(time * 23 + f.phase);
        f.light.intensity = f.base * k;
        f.flame.scale.set(1, 2.2 * k, 1);
      }
      lantern.intensity = 900 * (0.95 + 0.05 * Math.sin(time * 3.1));
      lFlame.scale.setScalar(0.95 + 0.08 * Math.sin(time * 7));
    },
    dispose() {
      own.forEach((x) => x.dispose());
    },
  };
}
