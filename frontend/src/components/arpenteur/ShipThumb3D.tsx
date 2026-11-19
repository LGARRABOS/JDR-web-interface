import { useEffect, useState } from 'react';
import type { Build } from '../../arpenteur/types';
import { renderThumb } from '../../arpenteur3d/thumbs';
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
  useEffect(() => {
    let alive = true;
    renderThumb(build, { width, height, scaffolding }).then((url) => {
      if (alive) setImg({ key, url });
    });
    return () => {
      alive = false;
    };
    // build est décrit par key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, width, height, scaffolding]);
  const url = img?.url ?? null;
  if (!url) return <ShipThumb build={build} className={className} />;
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
