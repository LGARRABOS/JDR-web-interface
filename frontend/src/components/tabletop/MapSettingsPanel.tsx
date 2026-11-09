import { useEffect, useState } from 'react';
import { Checkbox } from '../Checkbox';

interface MapSettingsPanelProps {
  fogVisionRadius: number;
  onChangeFogRadius: (radius: number) => void;
}

/** Réglages de la carte pour le MJ (zone d'obscurité). */
export function MapSettingsPanel({
  fogVisionRadius,
  onChangeFogRadius,
}: MapSettingsPanelProps) {
  const [draft, setDraft] = useState(String(fogVisionRadius || 120));
  useEffect(() => {
    if (fogVisionRadius > 0) setDraft(String(fogVisionRadius));
  }, [fogVisionRadius]);

  const enabled = fogVisionRadius > 0;
  const commit = () => {
    const v = parseInt(draft, 10);
    if (!Number.isNaN(v) && v > 0 && v !== fogVisionRadius)
      onChangeFogRadius(Math.min(1000, v));
  };

  return (
    <div className="rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-4">
      <h3 className="text-sm font-semibold font-heading mb-2 text-fantasy-text-soft">
        Paramètres carte
      </h3>
      <label className="flex items-center gap-2 cursor-pointer mb-2">
        <Checkbox
          checked={enabled}
          onChange={() =>
            onChangeFogRadius(enabled ? 0 : parseInt(draft, 10) || 120)
          }
          aria-label="Zone d'obscurité"
        />
        <span className="text-sm text-fantasy-muted-soft">
          Zone d&apos;obscurité (nuit/grotte)
        </span>
      </label>
      {enabled && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-fantasy-muted-soft">Rayon :</span>
          <input
            type="number"
            min={40}
            max={300}
            step={20}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            className="w-16 rounded bg-fantasy-input-soft px-2 py-1 text-sm text-fantasy-text-soft"
          />
          <span className="text-xs text-fantasy-muted-soft">px</span>
        </div>
      )}
    </div>
  );
}
