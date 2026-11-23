import * as THREE from 'three';

// Personnages détaillés de la cabine du capitaine (vus de près sur les
// cartes) : redingote à pans et revers, gilet boutonné, jabot, ceinture à
// boucle, épaulettes d'officier, culotte et bottes à revers ; visage (nez,
// yeux, sourcils, oreilles), cheveux, barbe, tricorne, bicorne ou foulard.
// Articulés : épaules, coudes, hanches, genoux, cou et buste.
// Unité : le mètre ; le personnage regarde vers +x, z est son côté gauche.

export type Hat = 'tricorne' | 'bicorne' | 'foulard' | 'aucun';

export interface FigureLook {
  coat: string;
  trim: string;
  vest: string;
  breeches: string;
  skin: string;
  hair: string;
  hat: Hat;
  beard?: boolean;
  epaulettes?: boolean;
  /** Matelot : chemise et gilet, sans redingote. */
  sailor?: boolean;
}

export interface Limb {
  /** Bras : vers l'avant (rad) ; jambe : vers l'avant. */
  fwd: number;
  /** Écart sur le côté (bras). */
  side?: number;
  /** Coude ou genou plié. */
  bend: number;
  /** Avant-bras ramené vers l'intérieur (bras croisés, main sur la table). */
  turn?: number;
}

export interface FigurePose {
  x: number;
  z: number;
  yaw: number;
  lean: number;
  twist: number;
  headYaw: number;
  nod: number;
  bob: number;
  armL: Limb;
  armR: Limb;
  legL: Limb;
  legR: Limb;
}

export const restPose = (): FigurePose => ({
  x: 0,
  z: 0,
  yaw: 0,
  lean: 0,
  twist: 0,
  headYaw: 0,
  nod: 0,
  bob: 0,
  armL: { fwd: 0.05, side: 0.06, bend: 0.15 },
  armR: { fwd: 0.05, side: 0.06, bend: 0.15 },
  legL: { fwd: 0, bend: 0 },
  legR: { fwd: 0, bend: 0 },
});

const lathe = (p: [number, number][], seg = 24) =>
  new THREE.LatheGeometry(
    p.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)),
    seg
  );

export class Figure {
  readonly root = new THREE.Group();
  private hip = new THREE.Group();
  private spine = new THREE.Group();
  private neck = new THREE.Group();
  private shoulders: THREE.Group[] = [];
  private elbows: THREE.Group[] = [];
  private hips: THREE.Group[] = [];
  private knees: THREE.Group[] = [];
  private geoms: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];

  constructor(look: FigureLook, brass: THREE.Material) {
    const G = <T extends THREE.BufferGeometry>(g: T) => {
      this.geoms.push(g);
      return g;
    };
    const cloth = (hex: string, sheen = 0.6) => {
      const m = new THREE.MeshPhysicalMaterial({
        color: hex,
        roughness: 0.82,
        sheen,
        sheenRoughness: 0.6,
        sheenColor: new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.35),
      });
      this.mats.push(m);
      return m;
    };
    const plain = (hex: string, rough: number, metal = 0) => {
      const m = new THREE.MeshStandardMaterial({
        color: hex,
        roughness: rough,
        metalness: metal,
      });
      this.mats.push(m);
      return m;
    };
    const coat = cloth(look.coat);
    const trim = cloth(look.trim, 0.3);
    const vest = cloth(look.vest, 0.5);
    const breeches = cloth(look.breeches, 0.4);
    const linen = cloth('#ece6d6', 0.3);
    const skin = plain(look.skin, 0.62);
    const hair = plain(look.hair, 0.75);
    const leather = plain('#2a1a10', 0.45, 0.05);
    const felt = cloth('#1c1714', 0.4);
    const eye = plain('#120d0a', 0.2);
    const gold = brass;
    const add = (
      parent: THREE.Object3D,
      g: THREE.BufferGeometry,
      m: THREE.Material,
      x = 0,
      y = 0,
      z = 0,
      rx = 0,
      ry = 0,
      rz = 0
    ) => {
      const mesh = new THREE.Mesh(G(g), m);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // --- Bassin et jambes (hanches à 0,95 m) ---
    this.hip.position.y = 0.95;
    this.root.add(this.hip);
    const pelvis = lathe([
      [0.001, -0.1],
      [0.13, -0.09],
      [0.165, -0.02],
      [0.17, 0.06],
      [0.001, 0.07],
    ]);
    pelvis.scale(1, 1, 1.15);
    add(this.hip, pelvis, breeches);
    for (const side of [1, -1]) {
      const h = new THREE.Group();
      h.position.set(0, -0.05, side * 0.095);
      this.hip.add(h);
      this.hips.push(h);
      // Cuisse (culotte), genou.
      add(
        h,
        new THREE.CapsuleGeometry(0.075, 0.36, 6, 14),
        breeches,
        0,
        -0.22,
        0
      );
      const k = new THREE.Group();
      k.position.y = -0.45;
      h.add(k);
      this.knees.push(k);
      add(k, new THREE.SphereGeometry(0.068, 14, 10), breeches);
      // Botte haute à revers, semelle, talon.
      add(
        k,
        lathe(
          [
            [0.062, 0],
            [0.058, -0.2],
            [0.05, -0.38],
            [0.055, -0.42],
          ],
          18
        ),
        leather
      );
      add(
        k,
        lathe(
          [
            [0.075, -0.02],
            [0.08, 0.06],
            [0.072, 0.09],
          ],
          18
        ),
        leather
      );
      const foot = new THREE.CapsuleGeometry(0.048, 0.16, 6, 12);
      foot.rotateZ(Math.PI / 2);
      foot.scale(1, 0.85, 1.05);
      add(k, foot, leather, 0.06, -0.43, 0);
      add(
        k,
        new THREE.BoxGeometry(0.06, 0.035, 0.08),
        plain('#120c08', 0.6),
        -0.035,
        -0.47,
        0
      );
      add(
        k,
        new THREE.BoxGeometry(0.26, 0.012, 0.1),
        plain('#120c08', 0.6),
        0.04,
        -0.483,
        0
      );
    }

    // --- Buste ---
    this.hip.add(this.spine);
    if (!look.sailor) {
      // Redingote : corps, pans évasés, revers, col.
      const body = lathe([
        [0.17, 0],
        [0.165, 0.12],
        [0.18, 0.3],
        [0.2, 0.42],
        [0.165, 0.5],
        [0.075, 0.54],
        [0.001, 0.545],
      ]);
      body.scale(1, 1, 1.18);
      add(this.spine, body, coat);
      const skirt = lathe(
        [
          [0.175, 0.02],
          [0.2, -0.15],
          [0.235, -0.36],
          [0.235, -0.4],
        ],
        26
      );
      skirt.scale(1, 1, 1.12);
      // Pans ouverts devant : on retire la face avant en la tournant.
      add(this.spine, skirt, coat);
      coat.side = THREE.DoubleSide;
      // Gilet (devant), boutons, jabot.
      const vestG = new THREE.CapsuleGeometry(0.11, 0.3, 6, 14);
      vestG.scale(0.6, 1, 1.05);
      add(this.spine, vestG, vest, 0.1, 0.24, 0);
      for (let i = 0; i < 6; i++)
        add(
          this.spine,
          new THREE.SphereGeometry(0.011, 8, 6),
          gold,
          0.172,
          0.06 + i * 0.065,
          0
        );
      // Revers de la redingote (galonnés).
      for (const side of [1, -1]) {
        add(
          this.spine,
          new THREE.BoxGeometry(0.02, 0.24, 0.06),
          trim,
          0.17,
          0.36,
          side * 0.075,
          side * -0.35,
          0,
          0
        );
        // Poches à rabat sur les pans.
        add(
          this.spine,
          new THREE.BoxGeometry(0.03, 0.04, 0.12),
          trim,
          0.205,
          -0.12,
          side * 0.15,
          0,
          side * 0.3,
          0
        );
      }
      // Col montant.
      add(
        this.spine,
        lathe(
          [
            [0.08, 0.5],
            [0.085, 0.56],
            [0.075, 0.58],
          ],
          18
        ),
        trim
      );
      // Épaulettes d'officier (franges dorées).
      if (look.epaulettes)
        for (const side of [1, -1]) {
          const ep = new THREE.CylinderGeometry(0.06, 0.065, 0.025, 18);
          ep.scale(1.2, 1, 1);
          add(this.spine, ep, gold, 0, 0.5, side * 0.2);
          for (let k = 0; k < 9; k++) {
            const a = (k / 9) * Math.PI * 2;
            add(
              this.spine,
              new THREE.CylinderGeometry(0.006, 0.006, 0.06, 4),
              gold,
              Math.cos(a) * 0.065,
              0.465,
              side * 0.2 + Math.sin(a) * 0.055
            );
          }
        }
    } else {
      // Matelot : chemise de lin, gilet ouvert, ceinture large.
      const shirt = lathe([
        [0.16, 0],
        [0.16, 0.15],
        [0.185, 0.35],
        [0.19, 0.44],
        [0.15, 0.51],
        [0.07, 0.54],
        [0.001, 0.545],
      ]);
      shirt.scale(1, 1, 1.15);
      add(this.spine, shirt, linen);
      for (const side of [1, -1]) {
        const panel = new THREE.CapsuleGeometry(0.1, 0.26, 6, 12);
        panel.scale(0.55, 1, 0.7);
        add(this.spine, panel, vest, 0.06, 0.26, side * 0.11);
      }
      add(
        this.spine,
        new THREE.TorusGeometry(0.17, 0.035, 8, 26),
        coat,
        0,
        0.03,
        0,
        Math.PI / 2
      ).scale.set(1, 1.15, 1);
    }
    // Ceinture et boucle.
    const belt = add(
      this.spine,
      new THREE.TorusGeometry(0.172, 0.018, 8, 30),
      leather,
      0,
      0.02,
      0,
      Math.PI / 2
    );
    belt.scale.set(1, 1.17, 1);
    add(
      this.spine,
      new THREE.BoxGeometry(0.012, 0.05, 0.06),
      gold,
      0.176,
      0.02,
      0
    );
    // Jabot de dentelle.
    const jab = new THREE.ConeGeometry(0.045, 0.1, 10);
    jab.rotateZ(Math.PI);
    add(this.spine, jab, linen, 0.085, 0.49, 0);

    // --- Cou et tête ---
    this.neck.position.y = 0.55;
    this.spine.add(this.neck);
    add(
      this.neck,
      new THREE.CylinderGeometry(0.048, 0.055, 0.09, 14),
      skin,
      0,
      0.03,
      0
    );
    const head = new THREE.Group();
    head.position.y = 0.17;
    this.neck.add(head);
    const skull = new THREE.SphereGeometry(0.1, 24, 18);
    skull.scale(0.98, 1.12, 0.92);
    add(head, skull, skin);
    // Mâchoire et menton.
    const jaw = new THREE.SphereGeometry(0.075, 18, 12);
    jaw.scale(1, 0.8, 1.05);
    add(head, jaw, skin, 0.025, -0.055, 0);
    // Nez, oreilles, yeux, sourcils.
    const nose = new THREE.ConeGeometry(0.018, 0.05, 10);
    nose.rotateZ(-Math.PI / 2);
    add(head, nose, skin, 0.105, -0.01, 0);
    for (const side of [1, -1]) {
      const ear = new THREE.SphereGeometry(0.025, 10, 8);
      ear.scale(0.5, 1, 0.8);
      add(head, ear, skin, -0.005, 0, side * 0.094);
      add(
        head,
        new THREE.SphereGeometry(0.012, 10, 8),
        eye,
        0.085,
        0.022,
        side * 0.035
      );
      add(
        head,
        new THREE.BoxGeometry(0.012, 0.008, 0.035),
        hair,
        0.092,
        0.05,
        side * 0.036,
        0,
        0,
        side * 0.1
      );
    }
    // Cheveux noués (catogan) et favoris.
    const hairCap = new THREE.SphereGeometry(
      0.106,
      22,
      14,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.55
    );
    hairCap.scale(0.98, 1.1, 0.95);
    add(head, hairCap, hair, -0.012, 0.012, 0, 0, 0, 0.35);
    add(
      head,
      new THREE.CapsuleGeometry(0.02, 0.09, 4, 8),
      hair,
      -0.105,
      -0.06,
      0,
      0,
      0,
      0.25
    );
    add(
      head,
      new THREE.TorusGeometry(0.022, 0.008, 6, 12),
      plain('#1a1010', 0.5),
      -0.1,
      -0.02,
      0,
      0,
      Math.PI / 2,
      0
    );
    if (look.beard) {
      const beard = new THREE.SphereGeometry(
        0.072,
        18,
        12,
        0,
        Math.PI * 2,
        Math.PI * 0.45,
        Math.PI * 0.55
      );
      beard.scale(1, 1.05, 1.08);
      add(head, beard, hair, 0.03, -0.03, 0);
      const mus = new THREE.CapsuleGeometry(0.01, 0.06, 4, 8);
      mus.rotateX(Math.PI / 2);
      add(head, mus, hair, 0.1, -0.04, 0);
    }
    // Couvre-chef.
    if (look.hat === 'tricorne') {
      const shape = new THREE.Shape();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const b = a + Math.PI / 3;
        const p = [Math.cos(a) * 0.2, Math.sin(a) * 0.2];
        const c = [Math.cos(b) * 0.12, Math.sin(b) * 0.12];
        if (i === 0) shape.moveTo(p[0], p[1]);
        else shape.lineTo(p[0], p[1]);
        shape.quadraticCurveTo(
          c[0],
          c[1],
          Math.cos(a + (Math.PI * 2) / 3) * 0.2,
          Math.sin(a + (Math.PI * 2) / 3) * 0.2
        );
      }
      const brim = new THREE.ExtrudeGeometry(shape, {
        depth: 0.05,
        bevelEnabled: true,
        bevelThickness: 0.01,
        bevelSize: 0.01,
        bevelSegments: 2,
      });
      brim.rotateX(-Math.PI / 2);
      add(head, brim, felt, 0, 0.075, 0);
      add(
        head,
        lathe(
          [
            [0.1, 0],
            [0.095, 0.07],
            [0.06, 0.1],
            [0.001, 0.105],
          ],
          22
        ),
        felt,
        0,
        0.08,
        0
      );
      add(
        head,
        new THREE.TorusGeometry(0.1, 0.006, 6, 30),
        gold,
        0,
        0.085,
        0,
        Math.PI / 2
      );
    } else if (look.hat === 'bicorne') {
      const s = new THREE.Shape();
      s.moveTo(-0.24, 0);
      s.quadraticCurveTo(0, 0.24, 0.24, 0);
      s.quadraticCurveTo(0, 0.04, -0.24, 0);
      // Demi-lune de feutre portée en travers, sur une calotte.
      const bic = new THREE.ExtrudeGeometry(s, {
        depth: 0.04,
        bevelEnabled: true,
        bevelThickness: 0.012,
        bevelSize: 0.008,
        bevelSegments: 3,
      });
      bic.translate(0, 0, -0.02);
      add(
        head,
        lathe(
          [
            [0.098, 0],
            [0.095, 0.05],
            [0.06, 0.085],
            [0.001, 0.09],
          ],
          22
        ),
        felt,
        0,
        0.06,
        0
      );
      add(head, bic, felt, 0, 0.07, 0, 0, Math.PI / 2, 0);
      add(head, new THREE.SphereGeometry(0.025, 12, 8), gold, 0.0, 0.16, 0.055);
    } else if (look.hat === 'foulard') {
      const sc = new THREE.SphereGeometry(
        0.108,
        22,
        14,
        0,
        Math.PI * 2,
        0,
        Math.PI * 0.5
      );
      sc.scale(1, 1.05, 0.97);
      add(head, sc, trim, -0.005, 0.02, 0, 0, 0, 0.25);
      add(head, new THREE.SphereGeometry(0.025, 10, 8), trim, -0.11, 0.04, 0);
      add(
        head,
        new THREE.CapsuleGeometry(0.012, 0.08, 4, 6),
        trim,
        -0.13,
        -0.01,
        0.02,
        0.4,
        0,
        0.6
      );
    }

    // --- Bras (épaule, coude, main) ---
    for (const side of [1, -1]) {
      const sh = new THREE.Group();
      sh.position.set(0, 0.47, side * 0.215);
      this.spine.add(sh);
      this.shoulders.push(sh);
      const sleeve = look.sailor ? linen : coat;
      add(sh, new THREE.SphereGeometry(0.068, 14, 10), sleeve);
      add(
        sh,
        new THREE.CapsuleGeometry(0.05, 0.22, 6, 14),
        sleeve,
        0,
        -0.15,
        0
      );
      const el = new THREE.Group();
      el.position.y = -0.3;
      sh.add(el);
      this.elbows.push(el);
      add(el, new THREE.SphereGeometry(0.048, 12, 10), sleeve);
      add(
        el,
        new THREE.CapsuleGeometry(0.043, 0.2, 6, 14),
        sleeve,
        0,
        -0.13,
        0
      );
      // Parement de manche, poignet de dentelle.
      add(
        el,
        lathe(
          [
            [0.06, -0.2],
            [0.064, -0.25],
            [0.058, -0.27],
          ],
          16
        ),
        look.sailor ? linen : trim
      );
      add(
        el,
        lathe(
          [
            [0.045, -0.27],
            [0.055, -0.3],
          ],
          14
        ),
        linen
      );
      // Main : paume, doigts serrés, pouce.
      const palm = new THREE.CapsuleGeometry(0.032, 0.045, 4, 10);
      palm.scale(1.1, 1, 0.6);
      add(el, palm, skin, 0.005, -0.34, 0);
      const fingers = new THREE.CapsuleGeometry(0.026, 0.04, 4, 10);
      fingers.scale(1.15, 1, 0.55);
      add(el, fingers, skin, 0.012, -0.395, 0, 0, 0, 0.25);
      add(
        el,
        new THREE.CapsuleGeometry(0.011, 0.035, 4, 6),
        skin,
        0.035,
        -0.335,
        side * -0.015,
        0,
        0,
        0.7
      );
    }
    this.root.traverse((o) => {
      o.castShadow = true;
    });
  }

  pose(p: FigurePose) {
    this.root.position.set(p.x, 0, p.z);
    this.root.rotation.y = p.yaw;
    this.hip.position.y = 0.95 + p.bob;
    this.spine.rotation.set(0, p.twist, -p.lean);
    this.neck.rotation.set(0, p.headYaw, -p.nod);
    const arms = [p.armL, p.armR];
    this.shoulders.forEach((s, i) => {
      const a = arms[i];
      const side = i === 0 ? 1 : -1;
      // Écart vers l'extérieur (côté gauche : +z), puis balancement avant.
      s.rotation.set(-side * (a.side ?? 0.06), 0, a.fwd);
      this.elbows[i].rotation.set(0, side * (a.turn ?? 0), a.bend);
    });
    const legs = [p.legL, p.legR];
    this.hips.forEach((h, i) => {
      h.rotation.set(0, 0, legs[i].fwd);
      this.knees[i].rotation.set(0, 0, -legs[i].bend);
    });
  }

  dispose() {
    this.geoms.forEach((g) => g.dispose());
    this.mats.forEach((m) => m.dispose());
  }
}
