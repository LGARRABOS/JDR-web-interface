import * as THREE from 'three';
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
  const RW = BW + 160,
    RD = BD + 150,
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

  // --- Hublots sur la mer de brume (mur du fond) ---
  const portY = top + 40;
  for (const px of [-RW * 0.22, RW * 0.22]) {
    const ring = mesh(
      new THREE.TorusGeometry(15, 2.4, 14, 40),
      lib.brass,
      px,
      portY,
      -RD / 2 + 2,
      false
    );
    void ring;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      mesh(
        new THREE.SphereGeometry(0.9, 8, 6),
        lib.brass,
        px + Math.cos(a) * 15,
        portY + Math.sin(a) * 15,
        -RD / 2 + 4.2,
        false
      );
    }
    // Vitre : ciel violet de l'Aether, lumineux.
    const sky = mesh(
      new THREE.CircleGeometry(13.5, 40),
      keep(new THREE.MeshBasicMaterial({ color: '#c9b2ff' })),
      px,
      portY,
      -RD / 2 + 1,
      false
    );
    void sky;
  }
  // Lumière froide qui entre par les hublots.
  const cool = new THREE.DirectionalLight('#b9a8ff', 0.8);
  cool.position.set(0, portY, -RD / 2);
  cool.target.position.set(0, top, 0);
  g.add(cool, cool.target);

  // --- Étagère de livres (mur du fond, entre les hublots) ---
  const shelfY = top + 22;
  const r = rnd(7);
  for (let row = 0; row < 3; row++) {
    const y = shelfY + row * 16;
    mesh(
      new THREE.BoxGeometry(46, 1.2, 10),
      lib.darkWood,
      0,
      y,
      -RD / 2 + 6,
      false
    );
    let x = -21;
    while (x < 21) {
      const w = 1.4 + r() * 2.2,
        h = 9 + r() * 5;
      const b = mesh(
        new THREE.BoxGeometry(w, h, 7 + r() * 2),
        leather[Math.floor(r() * leather.length)],
        x + w / 2,
        y + 0.6 + h / 2,
        -RD / 2 + 6,
        false
      );
      if (r() < 0.12) b.rotation.z = 0.25;
      x += w + 0.15;
    }
  }

  // --- Lanterne suspendue au-dessus du bureau ---
  const lanternY = top + 52;
  mesh(
    new THREE.CylinderGeometry(0.25, 0.25, RH - (lanternY - floorY) - 4, 6),
    lib.castIron,
    -W * 0.25,
    (lanternY + floorY + RH) / 2 + 2,
    -6,
    false
  );
  mesh(
    new THREE.CylinderGeometry(3.2, 4, 1.4, 8),
    lib.brass,
    -W * 0.25,
    lanternY + 6,
    -6,
    false
  );
  mesh(
    new THREE.CylinderGeometry(3.4, 3.4, 9, 8, 1, true),
    glass,
    -W * 0.25,
    lanternY,
    -6,
    false
  );
  mesh(
    new THREE.CylinderGeometry(4, 3.2, 1.2, 8),
    lib.brass,
    -W * 0.25,
    lanternY - 5,
    -6,
    false
  );
  const lFlame = mesh(
    new THREE.SphereGeometry(1.1, 10, 8),
    keep(new THREE.MeshBasicMaterial({ color: '#ffcf7a' })),
    -W * 0.25,
    lanternY,
    -6,
    false
  );
  const lantern = new THREE.PointLight('#ffb46a', 900, 220, 1.6);
  lantern.position.set(-W * 0.25, lanternY - 2, -6);
  lantern.castShadow = true;
  lantern.shadow.mapSize.set(1024, 1024);
  lantern.shadow.bias = -0.002;
  g.add(lantern);

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

  return {
    group: g,
    update(time: number) {
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
