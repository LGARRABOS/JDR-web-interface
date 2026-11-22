import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SceneLoader } from '../components/arpenteur/SceneLoader';
import type { RefMood, RefViewer } from '../scene3d/ref/viewer';

// Labo de la refonte 3D : la scène de référence (navire neuf, canyon de
// falaises stratifiées), à explorer librement avant le déploiement en jeu.
export function LabPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<RefViewer | null>(null);
  const [mood, setMood] = useState<RefMood>('dusk');
  const [underway, setUnderway] = useState(true);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [tier, setTier] = useState('');
  const [prog, setProg] = useState({ f: 0, label: 'Ouverture des soutes' });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    import('../scene3d/ref/viewer')
      .then(({ RefViewer }) => {
        if (cancelled) return;
        const v = new RefViewer(canvas, {
          textures: '/textures/pbr/',
          interactive: true,
          onProgress: (f, label) => {
            if (!cancelled) setProg({ f, label });
          },
        });
        viewerRef.current = v;
        setTier(v.quality.tier);
        const resize = () =>
          v.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1);
        ro = new ResizeObserver(resize);
        ro.observe(canvas);
        resize();
        return v.ready.then(() => {
          if (cancelled) return;
          v.start();
          // Laisse passer la première image avant de lever le rideau.
          requestAnimationFrame(() =>
            requestAnimationFrame(() => !cancelled && setState('ready'))
          );
        });
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
      ro?.disconnect();
      viewerRef.current?.dispose();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (state === 'ready') viewerRef.current?.setMood(mood);
  }, [mood, state]);

  useEffect(() => {
    if (state === 'ready') viewerRef.current?.setUnderway(underway);
  }, [underway, state]);

  const btn = (m: RefMood, label: string) => (
    <button
      type="button"
      onClick={() => setMood(m)}
      className={`px-3 py-1.5 rounded border text-sm ${
        mood === m
          ? 'bg-amber-700/80 border-amber-400 text-amber-50'
          : 'bg-black/40 border-amber-900/60 text-amber-100 hover:bg-black/60'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black">
      <canvas ref={canvasRef} className="w-full h-full block touch-none" />
      <SceneLoader
        visible={state !== 'ready'}
        f={prog.f}
        label={
          state === 'error' ? 'Rendu indisponible sur cet appareil' : prog.label
        }
      />
      <div className="absolute top-3 left-3 flex flex-col gap-2 p-3 rounded-lg bg-black/55 border border-amber-900/50 text-amber-100 max-w-xs">
        <div className="font-semibold">Labo — scène de référence</div>
        <div className="text-xs text-amber-200/80">
          Clic gauche : tourner · clic droit : déplacer · molette : zoom
        </div>
        <div className="flex gap-2">
          {btn('dusk', 'Crépuscule')}
          {btn('night', 'Nuit')}
        </div>
        <div className="flex gap-2">
          {[
            [true, 'En route'],
            [false, 'À l’arrêt'],
          ].map(([on, label]) => (
            <button
              key={String(on)}
              type="button"
              onClick={() => setUnderway(on as boolean)}
              className={`px-3 py-1.5 rounded border text-sm ${
                underway === on
                  ? 'bg-amber-700/80 border-amber-400 text-amber-50'
                  : 'bg-black/40 border-amber-900/60 text-amber-100 hover:bg-black/60'
              }`}
            >
              {label as string}
            </button>
          ))}
        </div>
        <div className="text-xs text-amber-200/70">
          {state === 'loading' && 'Préparation des matériaux…'}
          {state === 'error' && 'Rendu indisponible sur cet appareil.'}
          {state === 'ready' && `Qualité : ${tier}`}
        </div>
        <Link to="/games" className="text-xs underline text-amber-300">
          ← Retour aux parties
        </Link>
      </div>
    </div>
  );
}
