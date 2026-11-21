import type { WebGLRenderer } from 'three';

// Niveaux de qualité du rendu Three.js, choisis d'après la carte graphique.
// « bas » : ombres légères, ni occlusion ambiante ni anticrénelage ;
// « moyen » (portables récents) : ombres 2048, occlusion ambiante ;
// « haut » (cartes dédiées) : ombres 4096, occlusion, anticrénelage MSAA.

export type QualityTier = 'low' | 'medium' | 'high';

export interface Quality {
  tier: QualityTier;
  shadowSize: number;
  msaa: number;
  ao: boolean;
}

const PRESETS: Record<QualityTier, Quality> = {
  low: { tier: 'low', shadowSize: 1024, msaa: 0, ao: false },
  medium: { tier: 'medium', shadowSize: 2048, msaa: 0, ao: true },
  high: { tier: 'high', shadowSize: 4096, msaa: 4, ao: true },
};

/** Choix forcé par le joueur (stockage local), sinon détection. */
export const QUALITY_KEY = 'arp-quality';

export function qualityPreset(tier: QualityTier): Quality {
  return PRESETS[tier];
}

export function detectQuality(r: WebGLRenderer): Quality {
  try {
    const forced = localStorage.getItem(QUALITY_KEY);
    if (forced === 'low' || forced === 'medium' || forced === 'high')
      return PRESETS[forced];
  } catch {
    // stockage indisponible : détection
  }
  const gl = r.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  const mobile =
    typeof navigator !== 'undefined' &&
    /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (mobile || /SwiftShader|llvmpipe|Mali|Adreno|PowerVR|Software/i.test(name))
    return PRESETS.low;
  if (
    /NVIDIA|GeForce|RTX|GTX|Quadro|Radeon RX|Radeon Pro|RX \d{3,4}|Arc\(TM\) A|Apple M\d (Pro|Max|Ultra)/i.test(
      name
    )
  )
    return PRESETS.high;
  return PRESETS.medium;
}
