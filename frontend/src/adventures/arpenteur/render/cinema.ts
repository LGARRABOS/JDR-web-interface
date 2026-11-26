// Réalisation des voyages : une suite de plans (poursuite, travelling
// latéral au ras des dunes, plongée aérienne, trois-quarts avant, plan
// héroïque en contre-plongée…) qui s'enchaînent selon la progression du
// trajet, puis une caméra amortie qui les rejoint avec de l'inertie.
// Tout reste du côté tribord (+z) : les grandes curiosités sont à bâbord.

export interface Shot {
  /** Azimut absolu (0 = travers tribord, > 0 vers la proue, < 0 vers la poupe). */
  yaw: number;
  /** Plongée (radians). */
  el: number;
  /** Facteur de distance. */
  mul: number;
  /** Décalage du navire dans le cadre (-1..1). */
  shift: number;
}

type Key = [number, Shot];
const S = (yaw: number, el: number, mul: number, shift = 0): Shot => ({
  yaw,
  el,
  mul,
  shift,
});

// Poursuite, travelling latéral, plongée, arrière haut, tempête (dans l'axe),
// trois-quarts avant, contre-plongée héroïque, poursuite vers l'arrivée.
const CHASE = S(-0.82, 0.15, 1.1, 0.12);
const SIDE = S(0.06, 0.035, 0.8, -0.25);
const AERIAL = S(0.4, 0.72, 1.3);
const HIGH_AFT = S(-1.0, 0.28, 1.05);
const STORM = S(-1.12, 0.12, 1.0);
const FRONT = S(1.12, 0.06, 0.95, 0.15);
const HERO = S(0.28, 0.025, 0.82, 0.2);

const VARIANTS: Key[][] = [
  [
    [0.1, CHASE],
    [0.2, SIDE],
    [0.3, AERIAL],
    [0.38, HIGH_AFT],
    [0.45, STORM],
    [0.56, STORM],
    [0.65, FRONT],
    [0.75, HERO],
    [0.85, CHASE],
  ],
  [
    [0.1, CHASE],
    [0.2, AERIAL],
    [0.3, SIDE],
    [0.38, HIGH_AFT],
    [0.45, STORM],
    [0.56, STORM],
    [0.65, HERO],
    [0.75, FRONT],
    [0.85, CHASE],
  ],
];

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** Plan visé au point p du trajet, et son poids (0 : vue du joueur). */
export function shotAt(
  p: number,
  seed: number,
  set = VARIANTS
): { shot: Shot; weight: number } {
  const keys = set[Math.abs(Math.floor(seed)) % set.length];
  let a = keys[0],
    b = keys[keys.length - 1];
  if (p <= keys[0][0]) b = a;
  else if (p >= b[0]) a = b;
  else
    for (let i = 0; i < keys.length - 1; i++)
      if (p >= keys[i][0] && p <= keys[i + 1][0]) {
        a = keys[i];
        b = keys[i + 1];
        break;
      }
  const t = b[0] > a[0] ? smooth((p - a[0]) / (b[0] - a[0])) : 0;
  const l = (x: number, y: number) => x + (y - x) * t;
  const shot = S(
    l(a[1].yaw, b[1].yaw),
    l(a[1].el, b[1].el),
    l(a[1].mul, b[1].mul),
    l(a[1].shift, b[1].shift)
  );
  // Départ et arrivée : on quitte puis on retrouve la vue du joueur.
  const weight = smooth((p - 0.03) / 0.07) * (1 - smooth((p - 0.9) / 0.08));
  return { shot, weight };
}

/**
 * Caméra amortie : deux filtres en cascade (démarrage et arrêt en douceur),
 * indépendants de la cadence. `snap` place directement sur la cible.
 */
export class CameraRig {
  private a: number[] | null = null;
  private b: number[] | null = null;

  follow(target: number[], dt: number, tau: number, snap = false): number[] {
    if (snap || !this.a || !this.b) {
      this.a = [...target];
      this.b = [...target];
      return this.b;
    }
    const k = 1 - Math.exp(-dt / Math.max(1e-3, tau));
    for (let i = 0; i < target.length; i++) {
      this.a[i] += (target[i] - this.a[i]) * k;
      this.b[i] += (this.a[i] - this.b[i]) * k;
    }
    return this.b;
  }

  reset() {
    this.a = null;
    this.b = null;
  }
}
