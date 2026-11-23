/** Écran d'attente : engrenages, jauge de laiton, étape en cours. */
function Gear({
  size,
  teeth,
  className,
}: {
  size: number;
  teeth: number;
  className: string;
}) {
  const r = size / 2;
  const pts: string[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? r * 0.8 : r;
    const da = (Math.PI / (teeth * 2)) * 0.55;
    pts.push(`${r + Math.cos(a - da) * rr},${r + Math.sin(a - da) * rr}`);
    pts.push(`${r + Math.cos(a + da) * rr},${r + Math.sin(a + da) * rr}`);
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
    >
      <polygon
        points={pts.join(' ')}
        fill="url(#lab-brass)"
        stroke="#5a3a14"
        strokeWidth={1.5}
      />
      <circle
        cx={r}
        cy={r}
        r={r * 0.55}
        fill="none"
        stroke="#5a3a14"
        strokeWidth={2}
      />
      <circle
        cx={r}
        cy={r}
        r={r * 0.18}
        fill="#2a1a0c"
        stroke="#e8c27a"
        strokeWidth={1.5}
      />
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <line
            key={i}
            x1={r + Math.cos(a) * r * 0.2}
            y1={r + Math.sin(a) * r * 0.2}
            x2={r + Math.cos(a) * r * 0.55}
            y2={r + Math.sin(a) * r * 0.55}
            stroke="#5a3a14"
            strokeWidth={3}
          />
        );
      })}
    </svg>
  );
}

export function SceneLoader({
  visible,
  f,
  label,
}: {
  visible: boolean;
  f: number;
  label: string;
}) {
  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center gap-6 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      style={{
        // Apparition immédiate (avant un éventuel gel), disparition en fondu.
        transition: visible ? 'none' : 'opacity .7s',
        background:
          'radial-gradient(ellipse at 50% 60%, #4a2a16 0%, #1d120b 55%, #0a0705 100%)',
      }}
    >
      <style>{`
        @keyframes lab-spin { to { transform: rotate(360deg); } }
        @keyframes lab-spin-r { to { transform: rotate(-360deg); } }
        @keyframes lab-puff { 0% { transform: translateY(0) scale(.6); opacity: .0; }
          20% { opacity: .5; } 100% { transform: translateY(-70px) scale(1.8); opacity: 0; } }
      `}</style>
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient id="lab-brass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f3d08a" />
            <stop offset="0.5" stopColor="#c08a3e" />
            <stop offset="1" stopColor="#7a4e1e" />
          </linearGradient>
        </defs>
      </svg>
      <div className="relative" style={{ width: 190, height: 130 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="absolute rounded-full bg-amber-100/40 blur-md"
            style={{
              width: 26,
              height: 26,
              left: 120,
              top: 0,
              animation: `lab-puff 2.4s ${i * 0.8}s infinite ease-out`,
            }}
          />
        ))}
        <Gear
          size={110}
          teeth={12}
          className="absolute left-0 top-4 [animation:lab-spin_6s_linear_infinite]"
        />
        <Gear
          size={70}
          teeth={8}
          className="absolute left-[100px] top-[52px] [animation:lab-spin-r_3.8s_linear_infinite]"
        />
      </div>
      <div
        className="text-amber-100 text-xl tracking-wide"
        style={{ fontFamily: 'serif' }}
      >
        L’arpenteur se prépare…
      </div>
      <div className="w-72 h-3 rounded-full border border-amber-700/80 bg-black/50 p-[2px] shadow-[0_0_12px_rgba(255,170,80,.25)]">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{
            width: `${Math.round(f * 100)}%`,
            background: 'linear-gradient(90deg, #7a4e1e, #e8b45a, #ffe2a0)',
          }}
        />
      </div>
      <div className="text-sm text-amber-200/80 h-5">{label}</div>
      <div className="text-xs text-amber-200/40 max-w-sm text-center">
        Les matériaux (bois, cuivre, laiton, toile, roche) sont fabriqués sur
        votre machine : la première ouverture prend quelques secondes.
      </div>
    </div>
  );
}
