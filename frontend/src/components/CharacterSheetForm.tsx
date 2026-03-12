import { useCallback, useEffect, useRef, useState } from 'react';
import { CharacterSheetsAPI } from '../api/client';

export interface CharacterSheetData {
  tokenIconUrl?: string;
  tokenWidth?: number;
  tokenHeight?: number;
  tokenIconPosX?: number;
  tokenIconPosY?: number;
  tokenIconScale?: number;
  identite?: {
    nom?: string;
    race?: string;
    classe?: string;
    grade?: string;
    poidsSupplementaire?: string;
    niveau?: string;
    xpActuel?: string;
    xpPourNiveau?: string;
  };
  statsCombat?: {
    vie?: string;
    vieMax?: string;
    aether?: string;
    aetherMax?: string;
    armure?: string;
    vitesse?: string;
    modificateurs?: string;
  };
  argent?: { po?: string; pa?: string; pc?: string };
  caracteristiques?: {
    force?: { base?: string; mod?: string; bonus?: string };
    dex?: { base?: string; mod?: string; bonus?: string };
    con?: { base?: string; mod?: string; bonus?: string };
    int?: { base?: string; mod?: string; bonus?: string };
    sag?: { base?: string; mod?: string; bonus?: string };
    cha?: { base?: string; mod?: string; bonus?: string };
  };
  pouvoirs?: Array<{
    type?: string;
    nom?: string;
    cout?: string;
    effet?: string;
  }>;
  armes?: Array<{
    nom?: string;
    effet?: string;
    poids?: string;
    rarete?: string;
    prixVente?: string;
  }>;
  equipement?: Array<{
    nom?: string;
    effet?: string;
    poids?: string;
    rarete?: string;
    prixVente?: string;
  }>;
  inventaire?: Array<{
    nom?: string;
    effet?: string;
    poids?: string;
    rarete?: string;
    prixVente?: string;
  }>;
  fleches?: Array<{
    nom?: string;
    effet?: string;
    poids?: string;
    rarete?: string;
    prixVente?: string;
  }>;
  grimoire?: {
    emplacementsSorts?: string;
    sorts?: Array<{
      tradition?: string;
      grade?: string;
      nom?: string;
      effet?: string;
      coutAether?: string;
    }>;
  };
  sortsReserve?: {
    sorts?: Array<{
      tradition?: string;
      grade?: string;
      nom?: string;
      effet?: string;
      coutAether?: string;
    }>;
  };
  histoire?: {
    origines?: string;
    formation?: string;
    aventures?: string;
    conflits?: string;
    objectifs?: string;
  };
}

const emptySheet: CharacterSheetData = {};

const inputClass =
  'w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none';
const labelClass = 'block text-xs text-fantasy-muted-soft mb-1';

function Section({
  title,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="group overflow-hidden rounded-lg border border-fantasy-border-soft bg-fantasy-input-soft/30 shadow-sm transition-shadow hover:shadow-md"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 border-l-4 border-fantasy-accent/60 bg-fantasy-input-soft/40 px-4 py-3 font-semibold text-fantasy-text-soft transition-colors hover:border-fantasy-accent hover:bg-fantasy-input-soft/60 [&::-webkit-details-marker]:hidden">
        <span
          className="text-fantasy-muted-soft transition-transform duration-200 group-open:rotate-90"
          aria-hidden
        >
          ▶
        </span>
        {icon && (
          <span className="text-base opacity-80" aria-hidden>
            {icon}
          </span>
        )}
        <span>{title}</span>
      </summary>
      <div className="border-t border-fantasy-border-soft/50 bg-fantasy-surface/30 p-4">
        {children}
      </div>
    </details>
  );
}

function DynamicList<T extends Record<string, string | undefined>>({
  items,
  onChange,
  emptyItem,
  fields,
  renderField,
  readOnly = false,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  emptyItem: T;
  fields: (keyof T)[];
  renderField?: (
    item: T,
    i: number,
    onChange: (item: T) => void
  ) => React.ReactNode;
  readOnly?: boolean;
}) {
  const add = () => onChange([...items, { ...emptyItem }]);
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));
  const update = (i: number, item: T) =>
    onChange(items.map((old, j) => (j === i ? item : old)));

  if (renderField) {
    return (
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2 items-start">
            <div className="flex-1 min-w-0">
              {renderField(item, i, (upd) => update(i, upd))}
            </div>
            {!readOnly && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="shrink-0 p-1 rounded text-fantasy-error hover:bg-fantasy-danger/30 text-sm"
                title="Supprimer"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {!readOnly && (
          <button
            type="button"
            onClick={add}
            className="text-sm text-fantasy-accent hover:underline"
          >
            + Ajouter
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2 items-start">
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 gap-2">
            {fields.map((f) => (
              <div key={String(f)}>
                <label className={labelClass}>{String(f)}</label>
                <input
                  type="text"
                  value={item[f] ?? ''}
                  onChange={(e) => update(i, { ...item, [f]: e.target.value })}
                  className={inputClass}
                  placeholder={String(f)}
                  readOnly={readOnly}
                />
              </div>
            ))}
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => remove(i)}
              className="shrink-0 p-1 rounded text-fantasy-error hover:bg-fantasy-danger/30 text-sm"
              title="Supprimer"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={add}
          className="text-sm text-fantasy-accent hover:underline"
        >
          + Ajouter
        </button>
      )}
    </div>
  );
}

interface CharacterSheetFormProps {
  gameId: number;
  initialData?: CharacterSheetData | null;
  readOnly?: boolean;
}

export function CharacterSheetForm({
  gameId,
  initialData,
  readOnly = false,
}: CharacterSheetFormProps) {
  const [data, setData] = useState<CharacterSheetData>(
    initialData ?? emptySheet
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setData(initialData ?? emptySheet);
  }, [initialData]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      await CharacterSheetsAPI.patch(gameId, data as Record<string, unknown>);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [gameId, data]);

  const id = data.identite ?? {};
  const stats = data.statsCombat ?? {};
  const argent = data.argent ?? {};
  const carac = data.caracteristiques ?? {};
  const pouvoirs = data.pouvoirs ?? [];
  const armes = data.armes ?? [];
  const equipement = data.equipement ?? [];
  const inventaire = data.inventaire ?? [];
  const fleches = data.fleches ?? [];
  const grimoire = data.grimoire ?? { sorts: [] };
  const sortsReserve = data.sortsReserve ?? { sorts: [] };
  const histoire = data.histoire ?? {};

  const setIdentite = (id: CharacterSheetData['identite']) =>
    setData((d) => ({ ...d, identite: id }));
  const setStatsCombat = (s: CharacterSheetData['statsCombat']) =>
    setData((d) => ({ ...d, statsCombat: s }));
  const setArgent = (a: CharacterSheetData['argent']) =>
    setData((d) => ({ ...d, argent: a }));
  const setCaracteristiques = (c: CharacterSheetData['caracteristiques']) =>
    setData((d) => ({ ...d, caracteristiques: c }));
  const setPouvoirs = (p: CharacterSheetData['pouvoirs']) =>
    setData((d) => ({ ...d, pouvoirs: p ?? [] }));
  const setArmes = (a: CharacterSheetData['armes']) =>
    setData((d) => ({ ...d, armes: a ?? [] }));
  const setEquipement = (e: CharacterSheetData['equipement']) =>
    setData((d) => ({ ...d, equipement: e ?? [] }));
  const setInventaire = (i: CharacterSheetData['inventaire']) =>
    setData((d) => ({ ...d, inventaire: i ?? [] }));
  const setFleches = (f: CharacterSheetData['fleches']) =>
    setData((d) => ({ ...d, fleches: f ?? [] }));
  const setGrimoire = (g: CharacterSheetData['grimoire']) =>
    setData((d) => ({ ...d, grimoire: g ?? {} }));
  const setSortsReserve = (s: CharacterSheetData['sortsReserve']) =>
    setData((d) => ({ ...d, sortsReserve: s ?? {} }));
  const setHistoire = (h: CharacterSheetData['histoire']) =>
    setData((d) => ({ ...d, histoire: h ?? {} }));

  const tokenIconUrl = data.tokenIconUrl ?? '';
  const setTokenIconUrl = (url: string) =>
    setData((d) => ({ ...d, tokenIconUrl: url }));
  const tokenWidth = data.tokenWidth ?? 56;
  const tokenHeight = data.tokenHeight ?? 56;
  const tokenIconPosX = data.tokenIconPosX ?? 50;
  const tokenIconPosY = data.tokenIconPosY ?? 50;
  const tokenIconScale = data.tokenIconScale ?? 1;
  const setTokenWidth = (v: number) =>
    setData((d) => ({ ...d, tokenWidth: v }));
  const setTokenHeight = (v: number) =>
    setData((d) => ({ ...d, tokenHeight: v }));
  const setTokenIconPos = (x: number, y: number) =>
    setData((d) => ({ ...d, tokenIconPosX: x, tokenIconPosY: y }));
  const setTokenIconScale = (s: number) =>
    setData((d) => ({ ...d, tokenIconScale: Math.max(0.5, Math.min(2, s)) }));

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [draggingIcon, setDraggingIcon] = useState(false);
  const tokenPreviewRef = useRef<HTMLDivElement>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTokenImageDrag = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (readOnly || !tokenPreviewRef.current) return;
      e.preventDefault();
      const rect = tokenPreviewRef.current.getBoundingClientRect();
      const size = Math.min(rect.width, rect.height);
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const move = (ev: MouseEvent) => {
        const dx = (ev.clientX - centerX) / (size / 2);
        const dy = (ev.clientY - centerY) / (size / 2);
        const x = Math.round(50 + dx * 50);
        const y = Math.round(50 + dy * 50);
        setTokenIconPos(
          Math.max(0, Math.min(100, x)),
          Math.max(0, Math.min(100, y))
        );
      };

      const up = () => {
        setDraggingIcon(false);
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };

      setDraggingIcon(true);
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      move(e.nativeEvent);
    },
    [readOnly]
  );

  const handleAvatarChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || readOnly) return;
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      if (!['.png', '.jpg', '.jpeg', '.gif'].includes(ext)) {
        setAvatarError('Format non autorisé (png, jpg, jpeg, gif)');
        return;
      }
      setAvatarError(null);
      setUploadingAvatar(true);
      try {
        const { data: res } = await CharacterSheetsAPI.uploadAvatar(
          gameId,
          file
        );
        const url = (res as { url?: string })?.url;
        if (url) {
          setTokenIconUrl(url);
          setAvatarError(null);
        }
      } catch (err) {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response
            ?.data?.message ?? "Erreur lors de l'upload";
        setAvatarError(msg);
      } finally {
        setUploadingAvatar(false);
        e.target.value = '';
      }
    },
    [gameId, readOnly]
  );

  return (
    <div className="max-h-[60vh] space-y-2 overflow-y-auto pb-2">
      <Section title="Identité" icon="👤" defaultOpen>
        {!readOnly && (
          <div className="mb-3">
            <label className={labelClass}>
              Image du jeton (apparaît sur la carte)
            </label>
            <div className="flex items-center gap-3 flex-wrap">
              {tokenIconUrl ? (
                <>
                  <div
                    ref={tokenPreviewRef}
                    className="relative w-24 h-24 rounded-full overflow-hidden bg-fantasy-input-soft border-2 border-fantasy-border-soft cursor-grab"
                    onMouseDown={handleTokenImageDrag}
                    onWheel={(e) => {
                      e.preventDefault();
                      const delta = e.deltaY > 0 ? -0.1 : 0.1;
                      setTokenIconScale(tokenIconScale + delta);
                    }}
                  >
                    <img
                      src={tokenIconUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      style={{
                        objectPosition: `${tokenIconPosX}% ${tokenIconPosY}%`,
                        transform: `scale(${tokenIconScale})`,
                        transformOrigin: `${tokenIconPosX}% ${tokenIconPosY}%`,
                      }}
                      draggable={false}
                    />
                    {draggingIcon && (
                      <div className="absolute inset-0 bg-black/20 pointer-events-none" />
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2 items-center text-xs text-fantasy-muted-soft">
                      <span>
                        Position: X {tokenIconPosX}% Y {tokenIconPosY}%
                      </span>
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className="text-xs text-fantasy-muted-soft">
                        Zoom:
                      </span>
                      <button
                        type="button"
                        onClick={() => setTokenIconScale(tokenIconScale - 0.1)}
                        className="w-6 h-6 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-sm font-bold"
                      >
                        −
                      </button>
                      <span className="text-xs w-8 text-center">
                        {Math.round(tokenIconScale * 100)}%
                      </span>
                      <button
                        type="button"
                        onClick={() => setTokenIconScale(tokenIconScale + 0.1)}
                        className="w-6 h-6 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-sm font-bold"
                      >
                        +
                      </button>
                    </div>
                    <div className="flex gap-2 items-center">
                      <label className="text-xs text-fantasy-muted-soft">
                        Format jeton:
                      </label>
                      <input
                        type="number"
                        min={20}
                        className="w-14 rounded bg-fantasy-input-soft px-2 py-1 text-sm text-fantasy-text-soft border border-fantasy-border-soft"
                        value={tokenWidth}
                        onChange={(e) =>
                          setTokenWidth(
                            Math.max(20, parseInt(e.target.value, 10) || 56)
                          )
                        }
                      />
                      <span className="text-fantasy-muted-soft text-sm">×</span>
                      <input
                        type="number"
                        min={20}
                        className="w-14 rounded bg-fantasy-input-soft px-2 py-1 text-sm text-fantasy-text-soft border border-fantasy-border-soft"
                        value={tokenHeight}
                        onChange={(e) =>
                          setTokenHeight(
                            Math.max(20, parseInt(e.target.value, 10) || 56)
                          )
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".png,.jpg,.jpeg,.gif"
                        onChange={handleAvatarChange}
                        disabled={uploadingAvatar}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingAvatar}
                        className="text-sm text-fantasy-accent hover:underline"
                      >
                        {uploadingAvatar ? 'Envoi...' : 'Changer'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setTokenIconUrl('')}
                        disabled={uploadingAvatar}
                        className="text-sm text-fantasy-error hover:underline"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.gif"
                    onChange={handleAvatarChange}
                    disabled={uploadingAvatar}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="px-3 py-2 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-sm text-fantasy-text-soft border border-fantasy-border-soft"
                  >
                    {uploadingAvatar ? 'Envoi...' : '+ Ajouter une image'}
                  </button>
                </>
              )}
              {avatarError && (
                <p className="text-sm text-fantasy-error mt-1">{avatarError}</p>
              )}
            </div>
          </div>
        )}
        {readOnly && tokenIconUrl && (
          <div className="mb-3">
            <label className={labelClass}>Image du jeton</label>
            <div className="w-24 h-24 rounded-full overflow-hidden bg-fantasy-input-soft border-2 border-fantasy-border-soft">
              <img
                src={tokenIconUrl}
                alt=""
                className="w-full h-full object-cover"
                style={{
                  objectPosition: `${tokenIconPosX}% ${tokenIconPosY}%`,
                  transform: `scale(${tokenIconScale})`,
                  transformOrigin: `${tokenIconPosX}% ${tokenIconPosY}%`,
                }}
              />
            </div>
            <p className="text-xs text-fantasy-muted-soft mt-1">
              Format: {tokenWidth}×{tokenHeight} px · Zoom:{' '}
              {Math.round(tokenIconScale * 100)}%
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {[
            ['nom', 'Nom'],
            ['race', 'Race'],
            ['classe', 'Classe'],
            ['grade', 'Grade'],
            ['poidsSupplementaire', 'Poids supplémentaire'],
            ['niveau', 'Niveau'],
            ['xpActuel', 'XP actuel'],
            ['xpPourNiveau', 'XP pour niveau'] as const,
          ].map(([k, label]) => (
            <div key={k}>
              <label className={labelClass}>{label}</label>
              <input
                type="text"
                value={id[k] ?? ''}
                onChange={(e) => setIdentite({ ...id, [k]: e.target.value })}
                className={inputClass}
                readOnly={readOnly}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Statistiques de combat" icon="🛡️">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            ['vie', 'Vie'],
            ['vieMax', 'Vie max'],
            ['aether', 'Aether'],
            ['aetherMax', 'Aether max'],
            ['armure', 'Armure'],
            ['vitesse', 'Vitesse'],
          ].map(([k, label]) => (
            <div key={k}>
              <label className={labelClass}>{label}</label>
              <input
                type="text"
                value={stats[k as keyof typeof stats] ?? ''}
                onChange={(e) =>
                  setStatsCombat({ ...stats, [k]: e.target.value })
                }
                className={inputClass}
                readOnly={readOnly}
              />
            </div>
          ))}
        </div>
        <div>
          <label className={labelClass}>Modificateurs</label>
          <textarea
            value={stats.modificateurs ?? ''}
            onChange={(e) =>
              setStatsCombat({ ...stats, modificateurs: e.target.value })
            }
            className={inputClass}
            rows={2}
            readOnly={readOnly}
          />
        </div>
      </Section>

      <Section title="Argent" icon="💰">
        <div className="flex gap-2">
          {(['po', 'pa', 'pc'] as const).map((k) => (
            <div key={k} className="flex-1">
              <label className={labelClass}>{k.toUpperCase()}</label>
              <input
                type="text"
                value={argent[k] ?? ''}
                onChange={(e) => setArgent({ ...argent, [k]: e.target.value })}
                className={inputClass}
                readOnly={readOnly}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Caractéristiques" icon="⚡">
        <div className="space-y-2">
          {(
            [
              ['force', 'Force'],
              ['dex', 'Dextérité'],
              ['con', 'Constitution'],
              ['int', 'Intelligence'],
              ['sag', 'Sagesse'],
              ['cha', 'Charisme'],
            ] as const
          ).map(([key, label]) => {
            const c = carac[key] ?? {};
            return (
              <div key={key} className="flex gap-2 items-center flex-wrap">
                <span className="w-24 text-sm font-medium">{label}</span>
                <input
                  type="text"
                  placeholder="Base"
                  value={c.base ?? ''}
                  onChange={(e) =>
                    setCaracteristiques({
                      ...carac,
                      [key]: { ...c, base: e.target.value },
                    })
                  }
                  className="w-14 rounded px-2 py-1 text-sm bg-fantasy-input-soft"
                  readOnly={readOnly}
                />
                <input
                  type="text"
                  placeholder="Mod"
                  value={c.mod ?? ''}
                  onChange={(e) =>
                    setCaracteristiques({
                      ...carac,
                      [key]: { ...c, mod: e.target.value },
                    })
                  }
                  className="w-14 rounded px-2 py-1 text-sm bg-fantasy-input-soft"
                  readOnly={readOnly}
                />
                <input
                  type="text"
                  placeholder="Bonus dés"
                  value={c.bonus ?? ''}
                  onChange={(e) =>
                    setCaracteristiques({
                      ...carac,
                      [key]: { ...c, bonus: e.target.value },
                    })
                  }
                  className="w-16 rounded px-2 py-1 text-sm bg-fantasy-input-soft"
                  readOnly={readOnly}
                />
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Pouvoirs" icon="✨">
        <DynamicList
          items={pouvoirs}
          onChange={setPouvoirs}
          emptyItem={{ type: '', nom: '', cout: '', effet: '' }}
          fields={['type', 'nom', 'cout', 'effet']}
          readOnly={readOnly}
          renderField={(item, _, onChange) => (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Type"
                value={item.type ?? ''}
                onChange={(e) => onChange({ ...item, type: e.target.value })}
                className={inputClass}
                readOnly={readOnly}
              />
              <input
                type="text"
                placeholder="Nom"
                value={item.nom ?? ''}
                onChange={(e) => onChange({ ...item, nom: e.target.value })}
                className={inputClass}
                readOnly={readOnly}
              />
              <input
                type="text"
                placeholder="Coût"
                value={item.cout ?? ''}
                onChange={(e) => onChange({ ...item, cout: e.target.value })}
                className={inputClass}
                readOnly={readOnly}
              />
              <textarea
                placeholder="Effet"
                value={item.effet ?? ''}
                onChange={(e) => onChange({ ...item, effet: e.target.value })}
                className={inputClass}
                rows={2}
                readOnly={readOnly}
              />
            </div>
          )}
        />
      </Section>

      <Section title="Armes" icon="⚔️">
        <DynamicList
          items={armes}
          onChange={setArmes}
          emptyItem={{
            nom: '',
            effet: '',
            poids: '',
            rarete: '',
            prixVente: '',
          }}
          fields={['nom', 'effet', 'poids', 'rarete', 'prixVente']}
          readOnly={readOnly}
        />
      </Section>

      <Section title="Equipement" icon="🎒">
        <DynamicList
          items={equipement}
          onChange={setEquipement}
          emptyItem={{
            nom: '',
            effet: '',
            poids: '',
            rarete: '',
            prixVente: '',
          }}
          fields={['nom', 'effet', 'poids', 'rarete', 'prixVente']}
          readOnly={readOnly}
        />
      </Section>

      <Section title="Inventaire">
        <DynamicList
          items={inventaire}
          onChange={setInventaire}
          emptyItem={{
            nom: '',
            effet: '',
            poids: '',
            rarete: '',
            prixVente: '',
          }}
          fields={['nom', 'effet', 'poids', 'rarete', 'prixVente']}
          readOnly={readOnly}
        />
      </Section>

      <Section title="Flèches" icon="🏹">
        <DynamicList
          items={fleches}
          onChange={setFleches}
          emptyItem={{
            nom: '',
            effet: '',
            poids: '',
            rarete: '',
            prixVente: '',
          }}
          fields={['nom', 'effet', 'poids', 'rarete', 'prixVente']}
          readOnly={readOnly}
        />
      </Section>

      <Section title="Grimoire" icon="📖">
        <div className="mb-2">
          <label className={labelClass}>Emplacements de sorts</label>
          <input
            type="text"
            value={grimoire.emplacementsSorts ?? ''}
            onChange={(e) =>
              setGrimoire({ ...grimoire, emplacementsSorts: e.target.value })
            }
            className={inputClass}
            readOnly={readOnly}
          />
        </div>
        <DynamicList
          items={grimoire.sorts ?? []}
          onChange={(sorts) => setGrimoire({ ...grimoire, sorts })}
          emptyItem={{
            tradition: '',
            grade: '',
            nom: '',
            effet: '',
            coutAether: '',
          }}
          fields={['tradition', 'grade', 'nom', 'effet', 'coutAether']}
          readOnly={readOnly}
        />
      </Section>

      <Section title="Catalogue des sorts (Réserve)" icon="📜">
        <DynamicList
          items={sortsReserve.sorts ?? []}
          onChange={(sorts) => setSortsReserve({ ...sortsReserve, sorts })}
          emptyItem={{
            tradition: '',
            grade: '',
            nom: '',
            effet: '',
            coutAether: '',
          }}
          fields={['tradition', 'grade', 'nom', 'effet', 'coutAether']}
          readOnly={readOnly}
        />
      </Section>

      <Section title="Histoire" icon="📋">
        {(
          [
            ['origines', 'Origines et jeunesse'],
            ['formation', 'Formation et découverte de talents'],
            ['aventures', 'Premières aventures et quête personnelle'],
            ['conflits', 'Conflits et adversaires'],
            ['objectifs', 'Objectifs et motivations'],
          ] as const
        ).map(([k, label]) => (
          <div key={k}>
            <label className={labelClass}>{label}</label>
            <textarea
              value={histoire[k] ?? ''}
              onChange={(e) =>
                setHistoire({ ...histoire, [k]: e.target.value })
              }
              className={inputClass}
              rows={3}
              readOnly={readOnly}
            />
          </div>
        ))}
      </Section>

      {!readOnly && (
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || readOnly}
            className="px-4 py-2 rounded bg-fantasy-accent hover:bg-fantasy-accent-hover text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
          {saved && (
            <span className="text-sm text-fantasy-accent">Enregistré</span>
          )}
        </div>
      )}
    </div>
  );
}
