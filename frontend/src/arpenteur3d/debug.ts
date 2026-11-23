// Outils de débogage de la scène 3D : un panneau (Ctrl+Maj+D, ou ?debug3d
// dans l'adresse) qui affiche ce que fait le moteur, permet de couper les
// effets un par un et produit un rapport à copier-coller pour signaler un
// souci. Rien n'est envoyé nulle part : tout reste dans le navigateur.

export interface DebugFlags {
  /** Halo lumineux (bloom). */
  bloom: boolean;
  /** Occlusion ambiante (GTAO). */
  gtao: boolean;
  shadows: boolean;
  /** Brume atmosphérique. */
  fog: boolean;
  /** Garde-fou contre les pixels invalides (NaN) avant le halo. */
  guard: boolean;
  /** Allègement et résolution automatiques quand la machine peine. */
  adaptive: boolean;
  /** Animation figée (le temps ne s'écoule plus). */
  pause: boolean;
  // Éléments du rendu réaliste.
  ship: boolean;
  crew: boolean;
  npc: boolean;
  scenery: boolean;
  grass: boolean;
  particles: boolean;
  aetherSea: boolean;
  aetherPuffs: boolean;
  aetherIsles: boolean;
  landmarks: boolean;
  /** Surveillance des images noires (analyse une image toutes les 2 s). */
  watch: boolean;
}

export const FLAG_LABELS: [keyof DebugFlags, string, string][] = [
  ['bloom', 'Halo lumineux', 'Effets'],
  ['gtao', 'Occlusion ambiante', 'Effets'],
  ['shadows', 'Ombres', 'Effets'],
  ['fog', 'Brume atmosphérique', 'Effets'],
  ['guard', 'Garde-fou pixels invalides', 'Effets'],
  ['adaptive', 'Allègement automatique', 'Effets'],
  ['ship', 'Navire', 'Éléments'],
  ['crew', 'Équipage et habitants', 'Éléments'],
  ['npc', 'Autres navires', 'Éléments'],
  ['scenery', 'Décor du désert', 'Éléments'],
  ['grass', 'Herbes et troupeaux', 'Éléments'],
  ['particles', 'Fumée, vapeur, poussière', 'Éléments'],
  ['aetherSea', 'Mer de nuages', 'Position inconnue'],
  ['aetherPuffs', 'Voiles de brume', 'Position inconnue'],
  ['aetherIsles', 'Îles flottantes', 'Position inconnue'],
  ['landmarks', 'Repères des lieux-dits', 'Position inconnue'],
];

const DEFAULTS: DebugFlags = {
  bloom: true,
  gtao: true,
  shadows: true,
  fog: true,
  guard: true,
  adaptive: true,
  pause: false,
  ship: true,
  crew: true,
  npc: true,
  scenery: true,
  grass: true,
  particles: true,
  aetherSea: true,
  aetherPuffs: true,
  aetherIsles: true,
  landmarks: true,
  watch: false,
};

export interface BackendStats {
  calls: number;
  triangles: number;
  programs: number;
  geometries: number;
  textures: number;
  width: number;
  height: number;
  load: number;
  tier: string;
  gpu: string;
  webgl: string;
}

export interface SceneInfo {
  desert: string;
  biome: string;
  place: string;
  mood: string;
  inVoid: boolean;
  spot: string;
  hop: number | null;
  journey: number | null;
  scroll: number;
  camera: string;
}

interface Event {
  t: string;
  kind: string;
  msg: string;
}

const KEY = 'arp-debug3d';

class Debug {
  /** Panneau affiché (et mesures actives). */
  on = false;
  flags: DebugFlags = { ...DEFAULTS };
  /** Durées des dernières images (ms). */
  private times: number[] = [];
  stats: BackendStats | null = null;
  scene: SceneInfo | null = null;
  scale = 1;
  engine = '';
  events: Event[] = [];
  /** Dernière analyse d'image : part de pixels tout noirs (0..1). */
  black: number | null = null;
  /** Demandes traitées juste après le prochain rendu. */
  wantProbe = false;
  wantShot = false;
  shot: string | null = null;
  private lastWatch = 0;
  private listeners = new Set<() => void>();
  private hooked = false;

  constructor() {
    if (typeof window === 'undefined') return;
    try {
      const q = new URLSearchParams(window.location.search);
      this.on = q.has('debug3d') || localStorage.getItem(KEY) === '1';
    } catch {
      // stockage indisponible : panneau fermé
    }
    if (this.on) this.hook();
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  toggle(on = !this.on) {
    this.on = on;
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch {
      // sans importance
    }
    if (on) this.hook();
    this.emit();
  }

  set<K extends keyof DebugFlags>(k: K, v: DebugFlags[K]) {
    this.flags[k] = v;
    this.log('réglage', `${k} → ${v ? 'oui' : 'non'}`);
    this.emit();
  }

  reset() {
    this.flags = { ...DEFAULTS };
    this.log('réglage', 'réglages par défaut');
    this.emit();
  }

  /** Les flags sont-ils tous à leur valeur par défaut ? */
  get pristine() {
    return (Object.keys(DEFAULTS) as (keyof DebugFlags)[]).every(
      (k) => k === 'watch' || this.flags[k] === DEFAULTS[k]
    );
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  emit() {
    this.listeners.forEach((f) => f());
  }

  frame(ms: number) {
    if (!this.on) return;
    this.times.push(ms);
    if (this.times.length > 180) this.times.shift();
    const now = performance.now();
    if (this.flags.watch && now - this.lastWatch > 2000) {
      this.lastWatch = now;
      this.wantProbe = true;
    }
  }

  timing() {
    const t = this.times;
    if (!t.length) return { fps: 0, avg: 0, worst: 0, slow: 0 };
    const avg = t.reduce((a, b) => a + b, 0) / t.length;
    return {
      fps: Math.round(1000 / Math.max(1, avg)),
      avg: Math.round(avg * 10) / 10,
      worst: Math.round(Math.max(...t)),
      slow: t.filter((x) => x > 33).length,
    };
  }

  /** Résultat d'analyse d'image (appelé par le moteur). */
  probed(black: number) {
    this.black = black;
    if (black > 0.02) {
      const s = this.scene;
      this.log(
        'image',
        `${Math.round(black * 100)} % de pixels noirs` +
          (s
            ? ` (${s.place}, ${s.biome}${s.spot ? ', ' + s.spot : ''}${s.hop !== null ? `, trajet ${Math.round(s.hop * 100)} %` : ''}${s.journey !== null ? `, voyage ${Math.round(s.journey * 100)} %` : ''})`
            : '')
      );
    }
  }

  log(kind: string, msg: string) {
    const d = new Date();
    const t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    this.events.push({ t, kind, msg: msg.slice(0, 400) });
    if (this.events.length > 60) this.events.shift();
  }

  /** Erreurs et avertissements du navigateur, mis dans le journal. */
  private hook() {
    if (this.hooked || typeof window === 'undefined') return;
    this.hooked = true;
    const wrap = (kind: 'error' | 'warn') => {
      const orig = console[kind].bind(console);
      console[kind] = (...args: unknown[]) => {
        try {
          this.log(
            kind === 'error' ? 'erreur' : 'alerte',
            args
              .map((a) =>
                a instanceof Error
                  ? a.message
                  : typeof a === 'string'
                    ? a
                    : JSON.stringify(a)
              )
              .join(' ')
          );
        } catch {
          // objet non sérialisable : ignoré
        }
        orig(...args);
      };
    };
    wrap('error');
    wrap('warn');
    window.addEventListener('error', (e) =>
      this.log(
        'erreur',
        `${e.message} (${e.filename?.split('/').pop()}:${e.lineno})`
      )
    );
    window.addEventListener('unhandledrejection', (e) =>
      this.log('erreur', String((e.reason as Error)?.message ?? e.reason))
    );
  }

  /** Rapport texte à copier-coller. */
  report() {
    const s = this.stats;
    const sc = this.scene;
    const tm = this.timing();
    const off = (Object.keys(DEFAULTS) as (keyof DebugFlags)[]).filter(
      (k) => k !== 'watch' && this.flags[k] !== DEFAULTS[k]
    );
    const lines = [
      '=== Rapport scène 3D ===',
      `Date : ${new Date().toISOString()}`,
      `Navigateur : ${navigator.userAgent}`,
      `Écran : ${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}`,
      `Moteur : ${this.engine}`,
      s ? `Carte graphique : ${s.gpu} (${s.webgl})` : 'Carte graphique : ?',
      s
        ? `Qualité : ${s.tier} · allègement ${s.load}/3 · résolution ×${this.scale.toFixed(1)} · ${s.width}×${s.height}`
        : '',
      `Cadence : ${tm.fps} img/s · moyenne ${tm.avg} ms · pire ${tm.worst} ms · ${tm.slow} images lentes sur ${this.times.length}`,
      s
        ? `Rendu : ${s.calls} appels · ${Math.round(s.triangles / 1000)}k triangles · ${s.programs} programmes · ${s.geometries} géométries · ${s.textures} textures`
        : '',
      sc
        ? `Scène : ${sc.place} · désert ${sc.desert} · paysage ${sc.biome} · ${sc.mood}${sc.inVoid ? ' · position inconnue' : ''}${sc.spot ? ` · lieu-dit ${sc.spot}` : ''}${sc.hop !== null ? ` · trajet ${Math.round(sc.hop * 100)} %` : ''}${sc.journey !== null ? ` · voyage ${Math.round(sc.journey * 100)} %` : ''}`
        : '',
      sc ? `Caméra : ${sc.camera} · défilement ${Math.round(sc.scroll)}` : '',
      `Pixels noirs (dernière analyse) : ${this.black === null ? 'non mesuré' : Math.round(this.black * 1000) / 10 + ' %'}`,
      `Réglages modifiés : ${off.length ? off.map((k) => `${k}=${this.flags[k] ? 'oui' : 'non'}`).join(', ') : 'aucun'}`,
      '--- Journal ---',
      ...this.events.map((e) => `${e.t} [${e.kind}] ${e.msg}`),
    ];
    return lines.filter(Boolean).join('\n');
  }
}

/** Débogage de la scène 3D (instance unique). */
export const dbg = new Debug();
