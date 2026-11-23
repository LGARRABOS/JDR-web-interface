import { useState } from 'react';
import { MARKER_KINDS } from '../../arpenteur/catalog';
import { CITIES, DESERTS, REGIONS, isKnownNode } from '../../arpenteur/keld';
import type { Marker } from '../../arpenteur/types';
import { Btn, Dialog, LiveField, SelectField } from './ui';

// Repères de la carte : liste et fenêtre d'édition (onglet Carte et maquette 3D).

const NODE_OPTIONS = [
  { id: '', label: '—' },
  ...REGIONS.map((r) => ({
    id: r.id,
    label: `${r.id} (${DESERTS[r.desert].name})`,
  })),
  ...CITIES.map((c) => ({ id: c.id, label: c.name })),
];

export function MarkerList({
  markers,
  can,
  onEdit,
}: {
  markers: Marker[];
  can: boolean;
  onEdit: (m: Marker) => void;
}) {
  if (!markers.length)
    return <p className="text-xs text-fantasy-muted">Aucun repère.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {markers.map((m) => {
        const k = MARKER_KINDS.find((x) => x.id === m.kind);
        return (
          <li key={m.id}>
            <button
              type="button"
              disabled={!can}
              onClick={() => onEdit(m)}
              className="w-full text-left flex items-start gap-2 rounded-lg px-2 py-1.5 bg-black/20 hover:bg-black/30 disabled:hover:bg-black/20"
            >
              <span
                className="mt-1 w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: k?.color }}
              />
              <span className="min-w-0">
                <span className="text-sm text-fantasy-text">
                  {m.label || k?.label}
                </span>
                {m.hidden && (
                  <span className="ml-1.5 text-[10px] uppercase text-fantasy-muted">
                    caché
                  </span>
                )}
                {m.note && (
                  <span className="block text-xs text-fantasy-muted">
                    {m.note}
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function MarkerEditor({
  marker,
  isGM,
  isNew,
  onClose,
  onSave,
  onDelete,
}: {
  marker: Marker;
  isGM: boolean;
  isNew: boolean;
  onClose: () => void;
  onSave: (m: Marker) => void;
  onDelete: () => void;
}) {
  const [m, setM] = useState<Marker>(marker);
  const set = (p: Partial<Marker>) => setM((x) => ({ ...x, ...p }));
  return (
    <Dialog
      open
      onClose={onClose}
      title={isNew ? 'Nouveau repère' : m.label || 'Repère'}
      footer={
        <>
          {!isNew && (
            <Btn
              variant="ghost"
              className="mr-auto text-red-300"
              onClick={onDelete}
            >
              Supprimer
            </Btn>
          )}
          <Btn onClick={onClose}>Annuler</Btn>
          <Btn
            variant="primary"
            onClick={() =>
              onSave({
                ...m,
                label:
                  m.label.trim() ||
                  (MARKER_KINDS.find((k) => k.id === m.kind)?.label ??
                    'Repère'),
              })
            }
          >
            Enregistrer
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <LiveField
          label="Nom"
          value={m.label}
          onChange={(v) => set({ label: v })}
          className="col-span-2"
          placeholder="Nid de Draals, oasis…"
        />
        <SelectField
          label="Type"
          value={m.kind}
          options={MARKER_KINDS.map((k) => ({ id: k.id, label: k.label }))}
          onChange={(v) => set({ kind: v })}
        />
        <SelectField
          label="Sous-région / ville"
          value={
            isKnownNode(m.sector.toUpperCase()) ? m.sector.toUpperCase() : ''
          }
          options={NODE_OPTIONS}
          onChange={(v) => set({ sector: v })}
        />
        <LiveField
          label="Note"
          value={m.note}
          multiline
          onChange={(v) => set({ note: v })}
          className="col-span-2"
        />
        {isGM && (
          <label className="col-span-2 flex items-center gap-2 text-sm text-fantasy-text-soft">
            <input
              type="checkbox"
              checked={m.hidden}
              onChange={(e) => set({ hidden: e.target.checked })}
            />
            Caché aux joueurs
          </label>
        )}
      </div>
    </Dialog>
  );
}
