import { useEffect, useRef, useState } from 'react';
import type { Build } from '../model/types';
import { renderThumb } from '../render/thumbs';
import { ShipThumb } from './ShipProfile';

/** Miniature 3D du navire ; le dessin 2D s'affiche le temps du rendu ou sans WebGL2. */
export function ShipThumb3D({
  build,
  className = '',
  width = 480,
  height = 270,
  scaffolding = false,
}: {
  build: Build;
  className?: string;
  width?: number;
  height?: number;
  scaffolding?: boolean;
}) {
  const key = JSON.stringify(build);
  const [img, setImg] = useState<{ key: string; url: string | null } | null>(
    null
  );
  const ref = useRef<HTMLDivElement>(null);
  // Rendu seulement quand la miniature est à l'écran (ou presque).
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    if (typeof IntersectionObserver === 'undefined') return setSeen(true);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSeen(true);
      },
      { rootMargin: '200px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  useEffect(() => {
    if (!seen) return;
    const ctrl = new AbortController();
    renderThumb(build, {
      width,
      height,
      scaffolding,
      signal: ctrl.signal,
    }).then((url) => {
      if (!ctrl.signal.aborted) setImg({ key, url });
    });
    return () => ctrl.abort();
    // build est décrit par key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen, key, width, height, scaffolding]);
  const url = img?.url ?? null;
  if (!url)
    return (
      <div ref={ref}>
        <ShipThumb build={build} className={className} />
      </div>
    );
  return (
    <img
      src={url}
      alt=""
      width={width}
      height={height}
      className={`${className} block rounded-lg object-cover`}
      style={{ aspectRatio: `${width} / ${height}` }}
    />
  );
}
