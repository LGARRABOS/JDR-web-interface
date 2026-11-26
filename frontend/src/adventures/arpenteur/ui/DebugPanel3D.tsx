import { useEffect, useState } from 'react';
import { dbg, FLAG_LABELS, type DebugFlags } from '../render/debug';

// Panneau de débogage de la scène 3D (Ctrl+Maj+D, ou ?debug3d dans
// l'adresse) : mesures, réglages pour couper les effets un par un, analyse
// des images noires, capture et rapport à copier-coller.

export function DebugPanel3D() {
  const [, setTick] = useState(0);
  const [small, setSmall] = useState(false);
  const [copied, setCopied] = useState<'' | 'ok' | 'manual'>('');
  const [manual, setManual] = useState('');

  useEffect(() => {
    const off = dbg.subscribe(() => setTick((t) => t + 1));
    return off;
  }, []);
  // Mesures rafraîchies deux fois par seconde quand le panneau est ouvert.
  const open = dbg.on;
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [open]);
  // Capture prête : téléchargement.
  useEffect(() => {
    if (!dbg.shot) return;
    const a = document.createElement('a');
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    a.href = dbg.shot;
    a.download = `arpenteur-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
    a.click();
    dbg.shot = null;
  });

  if (!dbg.on) return null;
  const tm = dbg.timing();
  const s = dbg.stats;
  const sc = dbg.scene;
  const F = dbg.flags;

  const copy = async () => {
    const text = dbg.report();
    try {
      await navigator.clipboard.writeText(text);
      setCopied('ok');
      setTimeout(() => setCopied(''), 2500);
    } catch {
      setManual(text);
      setCopied('manual');
    }
  };
  const toggle = (k: keyof DebugFlags) => dbg.set(k, !F[k]);
  const btn =
    'rounded px-2 py-0.5 border border-white/20 hover:bg-white/10 text-[11px] whitespace-nowrap';
  const on = 'bg-[#d9a441] !text-[#1a120b] border-[#d9a441]';
  const groups = [...new Set(FLAG_LABELS.map((f) => f[2]))];
  const pct = (v: number | null) =>
    v === null ? '—' : `${Math.round(v * 100)} %`;

  return (
    <div
      className="absolute left-2 top-2 z-30 w-[290px] max-h-[calc(100%-1rem)] overflow-y-auto rounded-lg bg-black/80 text-[#e9dcc0] text-[11px] leading-tight font-mono shadow-xl border border-white/15"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-white/10 sticky top-0 bg-black/90">
        <strong className="font-heading text-xs tracking-wide">
          Débogage 3D
        </strong>
        <span
          className={
            tm.fps < 30
              ? 'text-red-400'
              : tm.fps < 50
                ? 'text-amber-300'
                : 'text-emerald-300'
          }
        >
          {tm.fps} img/s
        </span>
        <button
          type="button"
          className="ml-auto opacity-70 hover:opacity-100"
          onClick={() => setSmall(!small)}
          title={small ? 'Déplier' : 'Réduire'}
        >
          {small ? '▸' : '▾'}
        </button>
        <button
          type="button"
          className="opacity-70 hover:opacity-100"
          onClick={() => dbg.toggle(false)}
          title="Fermer (Ctrl+Maj+D)"
        >
          ✕
        </button>
      </div>
      {!small && (
        <div className="p-2 flex flex-col gap-2">
          <section>
            <p>
              Image : moy. {tm.avg} ms · pire {tm.worst} ms · {tm.slow} lentes
            </p>
            {s && (
              <>
                <p>
                  {s.width}×{s.height} · ×{dbg.scale.toFixed(1)} · qualité{' '}
                  {s.tier} · allègement {s.load}/3
                </p>
                <p>
                  {s.calls} appels · {Math.round(s.triangles / 1000)}k tri ·{' '}
                  {s.programs} prog.
                </p>
                <p className="opacity-70 truncate" title={s.gpu}>
                  {s.gpu}
                </p>
              </>
            )}
            <p className="opacity-70">Moteur : {dbg.engine || '—'}</p>
          </section>
          {sc && (
            <section className="border-t border-white/10 pt-1.5">
              <p>
                {sc.place} · {sc.biome} · {sc.mood}
              </p>
              <p>
                lieu-dit {sc.spot || '—'} · trajet {pct(sc.hop)} · voyage{' '}
                {pct(sc.journey)}
              </p>
              <p className="opacity-70">
                {sc.camera} · défil. {Math.round(sc.scroll)}
              </p>
            </section>
          )}
          {groups.map((g) => (
            <section key={g} className="border-t border-white/10 pt-1.5">
              <p className="uppercase tracking-wider opacity-60 text-[10px] mb-0.5">
                {g}
              </p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                {FLAG_LABELS.filter((f) => f[2] === g).map(([k, label]) => (
                  <label
                    key={k}
                    className="flex items-center gap-1 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={!!F[k]}
                      onChange={() => toggle(k)}
                      className="accent-[#d9a441]"
                    />
                    <span className={F[k] ? '' : 'line-through opacity-60'}>
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          ))}
          <section className="border-t border-white/10 pt-1.5 flex flex-wrap gap-1">
            <button
              type="button"
              className={`${btn} ${F.pause ? on : ''}`}
              onClick={() => toggle('pause')}
            >
              {F.pause ? '▶ Reprendre' : '⏸ Figer'}
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => {
                dbg.wantProbe = true;
                dbg.emit();
              }}
              title="Compte les pixels tout noirs de l'image affichée"
            >
              Analyser l'image
            </button>
            <button
              type="button"
              className={`${btn} ${F.watch ? on : ''}`}
              onClick={() => toggle('watch')}
              title="Analyse une image toutes les 2 s et note dans le journal quand l'écran devient noir"
            >
              Surveiller le noir
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => {
                dbg.wantShot = true;
                dbg.emit();
              }}
            >
              Capture
            </button>
            <button
              type="button"
              className={`${btn} ${copied === 'ok' ? on : ''}`}
              onClick={() => void copy()}
            >
              {copied === 'ok' ? 'Copié !' : 'Copier le rapport'}
            </button>
            {!dbg.pristine && (
              <button type="button" className={btn} onClick={() => dbg.reset()}>
                Tout rétablir
              </button>
            )}
          </section>
          <p>
            Pixels noirs :{' '}
            {dbg.black === null
              ? 'non mesuré'
              : `${Math.round(dbg.black * 1000) / 10} %`}
          </p>
          {copied === 'manual' && (
            <textarea
              readOnly
              value={manual}
              className="w-full h-28 bg-black/60 border border-white/20 p-1 text-[10px]"
              onFocus={(e) => e.currentTarget.select()}
              autoFocus
            />
          )}
          {dbg.events.length > 0 && (
            <section className="border-t border-white/10 pt-1.5">
              <p className="uppercase tracking-wider opacity-60 text-[10px] mb-0.5">
                Journal
              </p>
              {dbg.events.slice(-8).map((e, i) => (
                <p
                  key={i}
                  className={
                    e.kind === 'erreur'
                      ? 'text-red-300'
                      : e.kind === 'image'
                        ? 'text-amber-300'
                        : 'opacity-80'
                  }
                >
                  {e.t} {e.msg}
                </p>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
