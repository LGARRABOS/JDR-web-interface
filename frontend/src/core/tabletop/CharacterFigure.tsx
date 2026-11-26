import { characterLook, darken } from './character';

interface CharacterFigureProps {
  /** Couleur du joueur (vêtements). */
  color: string;
  /** Direction du regard en degrés (0 bas, 90 gauche, 180 haut, 270 droite). */
  facing: number;
  size: number;
  /** Graine de l'apparence (peau, cheveux) : l'id du joueur. */
  seed: number;
  /** Contour lumineux (tour du joueur, jeton déplaçable). */
  ring?: string;
  glow?: boolean;
}

/**
 * Petit personnage vu du dessus, dessiné tourné vers le bas puis pivoté dans
 * la direction de son regard.
 */
export function CharacterFigure({
  color,
  facing,
  size,
  seed,
  ring,
  glow,
}: CharacterFigureProps) {
  const { skin, hair } = characterLook(seed);
  const outline = darken(color);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className="pointer-events-none overflow-visible"
      style={{
        filter: glow
          ? 'drop-shadow(0 0 6px rgb(var(--c-accent)))'
          : 'drop-shadow(0 2px 2px rgb(0 0 0 / 0.45))',
      }}
      aria-hidden
    >
      {ring && (
        <circle
          cx="32"
          cy="32"
          r="30"
          fill="none"
          stroke={ring}
          strokeWidth="2.5"
          strokeDasharray="5 4"
        />
      )}
      <g
        transform={`rotate(${facing} 32 32)`}
        style={{ transition: 'transform 150ms ease-out' }}
      >
        {/* Repère de direction, devant le personnage */}
        <path
          d="M26 54 L32 62 L38 54 Z"
          fill={color}
          stroke={outline}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Épaules et corps */}
        <ellipse
          cx="32"
          cy="34"
          rx="21"
          ry="13"
          fill={color}
          stroke={outline}
          strokeWidth="2"
        />
        {/* Mains */}
        <circle
          cx="12"
          cy="40"
          r="4.5"
          fill={skin}
          stroke={outline}
          strokeWidth="1.5"
        />
        <circle
          cx="52"
          cy="40"
          r="4.5"
          fill={skin}
          stroke={outline}
          strokeWidth="1.5"
        />
        {/* Tête */}
        <circle
          cx="32"
          cy="32"
          r="12.5"
          fill={skin}
          stroke={outline}
          strokeWidth="2"
        />
        {/* Cheveux, à l'arrière de la tête */}
        <path
          d="M19.5 31 A12.5 12.5 0 0 1 44.5 31 Q38 27 32 28 Q26 27 19.5 31 Z"
          fill={hair}
        />
        {/* Yeux, vers l'avant */}
        <circle cx="27.5" cy="37.5" r="1.8" fill="#1b1b1b" />
        <circle cx="36.5" cy="37.5" r="1.8" fill="#1b1b1b" />
      </g>
    </svg>
  );
}
