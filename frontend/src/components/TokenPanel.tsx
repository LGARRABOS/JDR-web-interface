import { useState, useEffect, useRef, useCallback } from 'react';
import { ModalConfirm } from './Modal';

export interface TokenFormData {
  name: string;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  iconUrl?: string;
  width?: number;
  height?: number;
}

interface GameElement {
  id: number;
  name: string;
  imageUrl: string;
  category: string;
}

interface Token {
  id: number;
  kind: string;
  name: string;
  iconUrl?: string;
  width?: number;
  height?: number;
  ownerUserId?: number;
  hp?: number;
  maxHp?: number;
  mana?: number;
  maxMana?: number;
}

interface TokenPanelProps {
  isGM: boolean;
  currentUserId: number;
  elements?: GameElement[];
  onStartPlacement: (data: TokenFormData) => void;
  placementActive: boolean;
  onCancelPlacement: () => void;
  selectedToken: Token | null;
  onTokenSelect: (token: Token | null) => void;
  onTokenUpdate: (
    id: number,
    data: {
      hp?: number;
      maxHp?: number;
      mana?: number;
      maxMana?: number;
      iconUrl?: string;
      width?: number;
      height?: number;
    }
  ) => void;
  onTokenDelete: (id: number) => void;
  tokens: Token[];
}

export function TokenPanel({
  isGM,
  currentUserId,
  elements = [],
  onStartPlacement,
  placementActive,
  onCancelPlacement,
  selectedToken,
  onTokenSelect,
  onTokenUpdate,
  onTokenDelete,
  tokens,
}: TokenPanelProps) {
  const [name, setName] = useState('');
  const [hp, setHp] = useState<number>(10);
  const [maxHp, setMaxHp] = useState<number>(10);
  const [mana, setMana] = useState<number>(0);
  const [maxMana, setMaxMana] = useState<number>(0);
  const [iconUrl, setIconUrl] = useState<string>('');
  const [width, setWidth] = useState<number>(56);
  const [height, setHeight] = useState<number>(56);
  const [editHp, setEditHp] = useState<number>(10);
  const [editMaxHp, setEditMaxHp] = useState<number>(10);
  const [editMana, setEditMana] = useState<number>(0);
  const [editMaxMana, setEditMaxMana] = useState<number>(0);
  const [editWidth, setEditWidth] = useState<number>(56);
  const [editHeight, setEditHeight] = useState<number>(56);
  const [deleteTokenId, setDeleteTokenId] = useState<number | null>(null);
  const [deleteTokenName, setDeleteTokenName] = useState<string>('');

  const canEditToken = (t: Token) => isGM || t.ownerUserId === currentUserId;

  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleTokenUpdate = useCallback(
    (
      t: Token,
      data: {
        hp?: number;
        maxHp?: number;
        mana?: number;
        maxMana?: number;
        width?: number;
        height?: number;
      }
    ) => {
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = setTimeout(() => {
        updateTimeoutRef.current = null;
        onTokenUpdate(t.id, data);
      }, 400);
    },
    [onTokenUpdate]
  );

  useEffect(() => {
    if (selectedToken) {
      setEditHp(selectedToken.hp ?? selectedToken.maxHp ?? 10);
      setEditMaxHp(selectedToken.maxHp ?? 10);
      setEditMana(selectedToken.mana ?? selectedToken.maxMana ?? 0);
      setEditMaxMana(selectedToken.maxMana ?? 0);
      setEditWidth(selectedToken.width ?? 56);
      setEditHeight(selectedToken.height ?? 56);
    }
  }, [selectedToken]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim() || 'Ennemi';
    const h = Math.max(0, hp);
    const m = Math.max(0, maxHp);
    const ma = Math.max(0, mana);
    const maxMa = Math.max(0, maxMana);
    onStartPlacement({
      name: n,
      hp: h,
      maxHp: m,
      mana: ma,
      maxMana: maxMa,
      iconUrl: iconUrl || undefined,
      width: iconUrl ? width : undefined,
      height: iconUrl ? height : undefined,
    });
  };

  if (placementActive && isGM) {
    return (
      <div className="rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-4">
        <p className="text-sm text-fantasy-accent-hover mb-2">
          Cliquez sur la carte pour placer l&apos;ennemi.
        </p>
        <button
          type="button"
          onClick={onCancelPlacement}
          className="px-3 py-1 rounded bg-fantasy-input hover:bg-fantasy-input-hover text-sm"
        >
          Annuler
        </button>
      </div>
    );
  }

  const allTokens = isGM
    ? tokens
    : tokens.filter((t) => t.ownerUserId === currentUserId);

  const handleDeleteConfirm = () => {
    if (deleteTokenId !== null) {
      onTokenDelete(deleteTokenId);
      setDeleteTokenId(null);
      setDeleteTokenName('');
    }
  };

  return (
    <div className="rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-4">
      <ModalConfirm
        open={deleteTokenId !== null}
        onClose={() => {
          setDeleteTokenId(null);
          setDeleteTokenName('');
        }}
        onConfirm={handleDeleteConfirm}
        title="Supprimer le jeton"
        message={`Supprimer le jeton « ${deleteTokenName} » ?`}
        confirmLabel="Supprimer"
        danger
      />
      {isGM && (
        <>
          <h3 className="text-sm font-medium mb-3 text-fantasy-text-soft">
            Ajouter un ennemi
          </h3>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label className="block text-xs text-fantasy-muted-soft mb-1">
                Nom
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Gobelin, Orc..."
                className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft placeholder:text-fantasy-muted-soft"
              />
            </div>
            {elements.length > 0 && (
              <div>
                <label className="block text-xs text-fantasy-muted-soft mb-1">
                  Image (optionnel)
                </label>
                <select
                  value={iconUrl}
                  onChange={(e) => {
                    const val = e.target.value;
                    setIconUrl(val);
                    if (val) {
                      const el = elements.find((x) => x.imageUrl === val);
                      if (el) setName(el.name);
                    }
                  }}
                  className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft"
                >
                  <option value="">Aucune (cercle coloré)</option>
                  {elements
                    .filter((el) => el.category === 'monster')
                    .map((el) => (
                      <option key={el.id} value={el.imageUrl}>
                        {el.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
            {iconUrl && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-fantasy-muted-soft mb-1">
                    Largeur
                  </label>
                  <input
                    type="number"
                    min={20}
                    max={200}
                    value={width}
                    onChange={(e) =>
                      setWidth(Math.max(20, parseInt(e.target.value, 10) || 56))
                    }
                    className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-fantasy-muted-soft mb-1">
                    Hauteur
                  </label>
                  <input
                    type="number"
                    min={20}
                    max={200}
                    value={height}
                    onChange={(e) =>
                      setHeight(
                        Math.max(20, parseInt(e.target.value, 10) || 56)
                      )
                    }
                    className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft"
                  />
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-fantasy-muted-soft mb-1">
                  PV actuels
                </label>
                <input
                  type="number"
                  min={0}
                  value={hp}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10) || 0;
                    setHp(v);
                    if (v > maxHp) setMaxHp(v);
                  }}
                  className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-fantasy-muted-soft mb-1">
                  PV max
                </label>
                <input
                  type="number"
                  min={0}
                  value={maxHp}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10) || 0;
                    setMaxHp(v);
                    if (hp > v) setHp(v);
                  }}
                  className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-fantasy-muted-soft mb-1">
                  Mana actuel
                </label>
                <input
                  type="number"
                  min={0}
                  value={mana}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10) || 0;
                    setMana(v);
                    if (v > maxMana) setMaxMana(v);
                  }}
                  className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-fantasy-muted-soft mb-1">
                  Mana max
                </label>
                <input
                  type="number"
                  min={0}
                  value={maxMana}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10) || 0;
                    setMaxMana(v);
                    if (mana > v) setMana(v);
                  }}
                  className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft"
                />
              </div>
            </div>
            <button
              type="submit"
              className="px-3 py-2 rounded bg-fantasy-accent hover:bg-fantasy-accent-hover text-sm font-medium"
            >
              Placer sur la carte
            </button>
          </form>
        </>
      )}

      {allTokens.length > 0 && (
        <div
          className={`pt-4 border-t border-fantasy-border ${isGM ? 'mt-4' : ''}`}
        >
          <h3 className="text-sm font-medium mb-2">
            {isGM ? 'Jetons sur la carte' : 'Mes jetons'}
          </h3>
          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
            {allTokens.map((t) => (
              <div
                key={t.id}
                className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-sm cursor-pointer ${
                  selectedToken?.id === t.id
                    ? 'bg-fantasy-accent/30'
                    : 'hover:bg-fantasy-input-soft/50'
                }`}
                onClick={() =>
                  onTokenSelect(selectedToken?.id === t.id ? null : t)
                }
              >
                <span
                  className="truncate flex-1 text-fantasy-text-soft"
                  title={t.name}
                >
                  {t.name}
                </span>
                {selectedToken?.id === t.id && !canEditToken(t) ? (
                  <span className="flex items-center gap-1">
                    {(t.maxHp != null || t.maxMana != null) && (
                      <span className="text-fantasy-muted-soft text-xs">
                        {t.maxHp != null && `PV ${t.hp ?? t.maxHp}/${t.maxHp}`}
                        {t.maxHp != null && t.maxMana != null && ' '}
                        {t.maxMana != null &&
                          `Mana ${t.mana ?? t.maxMana}/${t.maxMana}`}
                      </span>
                    )}
                    {isGM && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTokenId(t.id);
                          setDeleteTokenName(t.name);
                        }}
                        className="opacity-50 hover:opacity-100 text-fantasy-error hover:text-fantasy-error text-xs p-0.5"
                        title="Supprimer"
                      >
                        ✕
                      </button>
                    )}
                  </span>
                ) : selectedToken?.id === t.id && canEditToken(t) ? (
                  <div
                    className="flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isGM && (
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteTokenId(t.id);
                          setDeleteTokenName(t.name);
                        }}
                        className="p-0.5 rounded text-fantasy-error hover:bg-fantasy-danger/30 text-xs"
                        title="Supprimer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="flex items-center gap-1">
                    {(t.maxHp != null || t.maxMana != null) && (
                      <span className="text-fantasy-muted-soft text-xs">
                        {t.maxHp != null && `PV ${t.hp ?? t.maxHp}/${t.maxHp}`}
                        {t.maxHp != null && t.maxMana != null && ' '}
                        {t.maxMana != null &&
                          `Mana ${t.mana ?? t.maxMana}/${t.maxMana}`}
                      </span>
                    )}
                    {isGM && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTokenId(t.id);
                          setDeleteTokenName(t.name);
                        }}
                        className="opacity-50 hover:opacity-100 text-fantasy-error hover:text-fantasy-error text-xs p-0.5"
                        title="Supprimer"
                      >
                        ✕
                      </button>
                    )}
                  </span>
                )}
              </div>
            ))}
          </div>
          {selectedToken && canEditToken(selectedToken) && (
            <div className="mt-3 p-3 rounded-lg bg-fantasy-input-soft/50 border border-fantasy-border-soft space-y-3">
              <div className="text-sm font-medium text-fantasy-text-soft truncate">
                {selectedToken.name}
              </div>
              {selectedToken.iconUrl && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-fantasy-muted-soft mb-0.5">
                      Taille (W × H)
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={20}
                        className="w-14 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft px-2 py-1.5 text-sm text-fantasy-text-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none"
                        value={editWidth}
                        onChange={(e) => {
                          const v = Math.max(
                            20,
                            parseInt(e.target.value, 10) || 56
                          );
                          setEditWidth(v);
                          scheduleTokenUpdate(selectedToken, {
                            width: v,
                            height: editHeight,
                          });
                        }}
                      />
                      <span className="text-fantasy-muted-soft text-sm">×</span>
                      <input
                        type="number"
                        min={20}
                        className="w-14 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft px-2 py-1.5 text-sm text-fantasy-text-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none"
                        value={editHeight}
                        onChange={(e) => {
                          const v = Math.max(
                            20,
                            parseInt(e.target.value, 10) || 56
                          );
                          setEditHeight(v);
                          scheduleTokenUpdate(selectedToken, {
                            width: editWidth,
                            height: v,
                          });
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-fantasy-muted-soft mb-0.5">
                    PV
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      className="w-14 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft px-2 py-1.5 text-sm text-fantasy-text-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none"
                      value={editHp}
                      onChange={(e) => {
                        const v = Math.max(
                          0,
                          parseInt(e.target.value, 10) || 0
                        );
                        setEditHp(v);
                        scheduleTokenUpdate(selectedToken, { hp: v });
                      }}
                    />
                    <span className="text-fantasy-muted-soft text-sm">/</span>
                    <input
                      type="number"
                      min={0}
                      className="w-14 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft px-2 py-1.5 text-sm text-fantasy-text-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none"
                      value={editMaxHp}
                      onChange={(e) => {
                        const v = Math.max(
                          0,
                          parseInt(e.target.value, 10) || 0
                        );
                        setEditMaxHp(v);
                        if (editHp > v) setEditHp(v);
                        scheduleTokenUpdate(selectedToken, { maxHp: v });
                      }}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-fantasy-muted-soft mb-0.5">
                    Mana
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      className="w-14 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft px-2 py-1.5 text-sm text-fantasy-text-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none"
                      value={editMana}
                      onChange={(e) => {
                        const v = Math.max(
                          0,
                          parseInt(e.target.value, 10) || 0
                        );
                        setEditMana(v);
                        scheduleTokenUpdate(selectedToken, { mana: v });
                      }}
                    />
                    <span className="text-fantasy-muted-soft text-sm">/</span>
                    <input
                      type="number"
                      min={0}
                      className="w-14 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft px-2 py-1.5 text-sm text-fantasy-text-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none"
                      value={editMaxMana}
                      onChange={(e) => {
                        const v = Math.max(
                          0,
                          parseInt(e.target.value, 10) || 0
                        );
                        setEditMaxMana(v);
                        if (editMana > v) setEditMana(v);
                        scheduleTokenUpdate(selectedToken, { maxMana: v });
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
