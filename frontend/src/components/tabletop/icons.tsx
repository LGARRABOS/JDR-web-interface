/** Icônes au trait (style Lucide), dessinées en currentColor. */

interface IconProps {
  size?: number;
  className?: string;
}

function Svg({
  size = 20,
  className,
  children,
  fill = 'none',
}: IconProps & { children: React.ReactNode; fill?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={fill === 'none' ? 'currentColor' : 'none'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const ChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 18l-6-6 6-6" />
  </Svg>
);
export const ChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);
export const ChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);
export const MapIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
    <path d="M9 4v14M15 6v14" />
  </Svg>
);
export const Cursor = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 3l7 17 2.5-7.5L21 10z" />
  </Svg>
);
export const PlusCircle = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v8M8 12h8" />
  </Svg>
);
export const Moon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
  </Svg>
);
export const Lock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 018 0v4" />
  </Svg>
);
export const Flag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </Svg>
);
export const Focus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5" />
    <circle cx="12" cy="12" r="2" />
  </Svg>
);
export const Copy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 012-2h8" />
  </Svg>
);
export const Check = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12l5 5L20 7" />
  </Svg>
);
export const Close = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const Send = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);
export const Trash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Svg>
);
export const Eye = (p: IconProps) => (
  <Svg {...p}>
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
export const EyeOff = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0112 5c7 0 11 7 11 7a18 18 0 01-3.2 4M6.6 6.6A18 18 0 001 12s4 7 11 7a10.6 10.6 0 005.4-1.4" />
    <path d="M9.9 9.9a3 3 0 004.2 4.2" />
  </Svg>
);
export const Music = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </Svg>
);
export const Play = (p: IconProps) => (
  <Svg {...p} fill="currentColor">
    <path d="M7 4.5v15l13-7.5z" />
  </Svg>
);
export const Pause = (p: IconProps) => (
  <Svg {...p} fill="currentColor">
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </Svg>
);
export const SkipBack = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 20L9 12l10-8v16zM5 19V5" />
  </Svg>
);
export const SkipForward = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 4l10 8-10 8V4zM19 5v14" />
  </Svg>
);
export const Square = (p: IconProps) => (
  <Svg {...p} fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
  </Svg>
);
export const Volume = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 5L6 9H2v6h4l5 4V5z" />
    <path d="M15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14" />
  </Svg>
);
export const Scroll = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 21h11a2 2 0 002-2v-2H10v2a2 2 0 01-2 2zm0 0a2 2 0 01-2-2V5a2 2 0 00-2-2h11a2 2 0 012 2v12" />
  </Svg>
);
export const Cloud = (p: IconProps) => (
  <Svg {...p}>
    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z" />
  </Svg>
);
export const Undo = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Svg>
);
export const LogOut = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </Svg>
);
export const Library = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </Svg>
);
