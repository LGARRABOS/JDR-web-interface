import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedElement, setSelectedElement] = useState<GameElement | null>(
    null
  );
  const [hp, setHp] = useState<number>(10);
  const [maxHp, setMaxHp] = useState<number>(10);
  const [mana, setMana] = useState<number>(0);
  const [maxMana, setMaxMana] = useState<number>(0);
  const [width, setWidth] = useState<number>(56);
  const [height, setHeight] = useState<number>(56);

  const monsters = elements.filter((el) => el.category === 'monster');
  const searchLower = searchQuery.trim().toLowerCase();
  const filteredMonsters = searchLower
    ? monsters.filter((el) => el.name.toLowerCase().includes(searchLower))
    : monsters;
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

  const handleSelectElement = (el: GameElement) => {
    setSelectedElement(el);
    setHp(10);
    setMaxHp(10);
    setMana(0);
    setMaxMana(0);
    setWidth(56);
    setHeight(56);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedElement) return;
    const h = Math.max(0, hp);
    const m = Math.max(0, maxHp);
    const ma = Math.max(0, mana);
    const maxMa = Math.max(0, maxMana);
    onStartPlacement({
      name: selectedElement.name,
      hp: h,
      maxHp: m,
      mana: ma,
      maxMana: maxMa,
      iconUrl: selectedElement.imageUrl,
      width: width,
      height: height,
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
          {monsters.length === 0 ? (
            <p className="text-sm text-fantasy-muted-soft">
              Aucun ennemi dans les ressources. Ajoutez-en depuis la page{' '}
              <Link
                to="resources"
                className="text-fantasy-accent hover:underline"
              >
                Ressources
              </Link>
              .
            </p>
          ) : selectedElement ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex items-center gap-2 p-2 rounded bg-fantasy-input-soft/50 border border-fantasy-border-soft">
                <img
                  src={selectedElement.imageUrl}
                  alt=""
                  className="w-10 h-10 rounded object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-fantasy-text-soft truncate block">
                    {selectedElement.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedElement(null)}
                    className="text-xs text-fantasy-muted-soft hover:text-fantasy-accent"
                  >
                    Changer
                  </button>
                </div>
              </div>
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
          ) : (
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher par nom (ex: Gobelin, Orc...)"
                className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft placeholder:text-fantasy-muted-soft"
              />
              <div className="max-h-32 overflow-y-auto flex flex-col gap-1">
                {filteredMonsters.map((el) => (
                  <button
                    key={el.id}
                    type="button"
                    onClick={() => handleSelectElement(el)}
                    className="flex items-center gap-2 p-2 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-left w-full"
                  >
                    <img
                      src={el.imageUrl}
                      alt=""
                      className="w-8 h-8 rounded object-cover flex-shrink-0"
                    />
                    <span className="text-sm text-fantasy-text-soft truncate">
                      {el.name}
                    </span>
                  </button>
                ))}
                {filteredMonsters.length === 0 && searchQuery.trim() && (
                  <p className="text-sm text-fantasy-muted-soft py-2">
                    Aucun ennemi trouvé pour « {searchQuery} »
                  </p>
                )}
              </div>
            </div>
          )}
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
                  {t.kind === 'MORT' && '💀 '}
                  {t.name}
                  {t.kind === 'MORT' && (
                    <span className="text-fantasy-muted-soft text-xs ml-1">
                      (vaincu)
                    </span>
                  )}
                </span>
                {selectedToken?.id === t.id && !canEditToken(t) ? (
                  <span className="flex items-center gap-1">
                    {t.kind !== 'MORT' &&
                      (t.maxHp != null || t.maxMana != null) && (
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
                    {t.kind !== 'MORT' &&
                      (t.maxHp != null || t.maxMana != null) && (
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
                {selectedToken.kind === 'MORT' && '💀 '}
                {selectedToken.name}
                {selectedToken.kind === 'MORT' && (
                  <span className="text-fantasy-muted-soft text-xs ml-1">
                    (vaincu)
                  </span>
                )}
              </div>
              {selectedToken.kind === 'MORT' ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-fantasy-muted-soft flex-1">
                    Marqueur de créature vaincue. Supprimez pour retirer de la
                    carte.
                  </p>
                  {isGM && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteTokenId(selectedToken.id);
                        setDeleteTokenName(selectedToken.name);
                      }}
                      className="px-2 py-1 rounded text-fantasy-error hover:bg-fantasy-danger/30 text-xs"
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              ) : (
                <>
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
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
