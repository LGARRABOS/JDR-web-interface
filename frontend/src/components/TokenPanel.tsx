import { useState, useEffect } from 'react';

export interface TokenFormData {
  name: string;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
}

interface Token {
  id: number;
  kind: string;
  name: string;
  ownerUserId?: number;
  hp?: number;
  maxHp?: number;
  mana?: number;
  maxMana?: number;
}

interface TokenPanelProps {
  isGM: boolean;
  currentUserId: number;
  onStartPlacement: (data: TokenFormData) => void;
  placementActive: boolean;
  onCancelPlacement: () => void;
  selectedToken: Token | null;
  onTokenSelect: (token: Token | null) => void;
  onTokenUpdate: (
    id: number,
    data: { hp?: number; maxHp?: number; mana?: number; maxMana?: number }
  ) => void;
  onTokenDelete: (id: number) => void;
  tokens: Token[];
}

export function TokenPanel({
  isGM,
  currentUserId,
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
  const [editHp, setEditHp] = useState<number>(10);
  const [editMaxHp, setEditMaxHp] = useState<number>(10);
  const [editMana, setEditMana] = useState<number>(0);
  const [editMaxMana, setEditMaxMana] = useState<number>(0);

  const canEditToken = (t: Token) =>
    isGM || t.ownerUserId === currentUserId;

  useEffect(() => {
    if (selectedToken) {
      setEditHp(selectedToken.hp ?? selectedToken.maxHp ?? 10);
      setEditMaxHp(selectedToken.maxHp ?? 10);
      setEditMana(selectedToken.mana ?? selectedToken.maxMana ?? 0);
      setEditMaxMana(selectedToken.maxMana ?? 0);
    }
  }, [selectedToken]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim() || 'Ennemi';
    const h = Math.max(0, hp);
    const m = Math.max(0, maxHp);
    const ma = Math.max(0, mana);
    const maxMa = Math.max(0, maxMana);
    onStartPlacement({ name: n, hp: h, maxHp: m, mana: ma, maxMana: maxMa });
  };

  if (placementActive && isGM) {
    return (
      <div className="rounded-lg bg-slate-800/80 p-4">
        <p className="text-sm text-amber-200/90 mb-2">
          Cliquez sur la carte pour placer l&apos;ennemi.
        </p>
        <button
          type="button"
          onClick={onCancelPlacement}
          className="px-3 py-1 rounded bg-slate-600 hover:bg-slate-500 text-sm"
        >
          Annuler
        </button>
      </div>
    );
  }

  const allTokens = isGM
    ? tokens
    : tokens.filter((t) => t.ownerUserId === currentUserId);

  return (
    <div className="rounded-lg bg-slate-800/80 p-4">
      {isGM && (
        <>
          <h3 className="text-sm font-medium mb-3">Ajouter un ennemi</h3>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nom</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Gobelin, Orc..."
                className="w-full rounded bg-slate-700 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">
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
                  className="w-full rounded bg-slate-700 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">
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
                  className="w-full rounded bg-slate-700 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">
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
                  className="w-full rounded bg-slate-700 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">
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
                  className="w-full rounded bg-slate-700 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <button
              type="submit"
              className="px-3 py-2 rounded bg-amber-600 hover:bg-amber-500 text-sm font-medium"
            >
              Placer sur la carte
            </button>
          </form>
        </>
      )}

      {allTokens.length > 0 && (
        <div className={`pt-4 border-t border-slate-700 ${isGM ? 'mt-4' : ''}`}>
          <h3 className="text-sm font-medium mb-2">
            {isGM ? 'Jetons sur la carte' : 'Mes jetons'}
          </h3>
          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
            {allTokens.map((t) => (
              <div
                key={t.id}
                className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-sm cursor-pointer ${
                  selectedToken?.id === t.id
                    ? 'bg-amber-600/30'
                    : 'hover:bg-slate-700/50'
                }`}
                onClick={() =>
                  onTokenSelect(selectedToken?.id === t.id ? null : t)
                }
              >
                <span className="truncate flex-1" title={t.name}>
                  {t.name}
                </span>
                {selectedToken?.id === t.id && canEditToken(t) ? (
                  <div
                    className="flex items-center gap-1 flex-wrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-0.5">
                      <input
                        type="number"
                        min={0}
                        className="w-10 rounded bg-slate-700 px-1 py-0.5 text-xs"
                        placeholder="PV"
                        value={editHp}
                        onChange={(e) =>
                          setEditHp(parseInt(e.target.value, 10) || 0)
                        }
                      />
                      <span className="text-xs">/</span>
                      <input
                        type="number"
                        min={0}
                        className="w-10 rounded bg-slate-700 px-1 py-0.5 text-xs"
                        value={editMaxHp}
                        onChange={(e) =>
                          setEditMaxHp(parseInt(e.target.value, 10) || 0)
                        }
                      />
                    </div>
                    <div className="flex items-center gap-0.5">
                      <input
                        type="number"
                        min={0}
                        className="w-10 rounded bg-slate-700 px-1 py-0.5 text-xs"
                        placeholder="Mana"
                        value={editMana}
                        onChange={(e) =>
                          setEditMana(parseInt(e.target.value, 10) || 0)
                        }
                      />
                      <span className="text-xs">/</span>
                      <input
                        type="number"
                        min={0}
                        className="w-10 rounded bg-slate-700 px-1 py-0.5 text-xs"
                        value={editMaxMana}
                        onChange={(e) =>
                          setEditMaxMana(parseInt(e.target.value, 10) || 0)
                        }
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onTokenUpdate(t.id, {
                          hp: editHp,
                          maxHp: editMaxHp,
                          mana: editMana,
                          maxMana: editMaxMana,
                        })
                      }
                      className="px-1 py-0.5 rounded bg-slate-600 hover:bg-slate-500 text-xs"
                    >
                      OK
                    </button>
                    {isGM && (
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Supprimer le jeton « ${t.name} » ?`
                            )
                          ) {
                            onTokenDelete(t.id);
                          }
                        }}
                        className="px-1 py-0.5 rounded bg-red-600 hover:bg-red-500 text-xs"
                        title="Supprimer le jeton"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="flex items-center gap-1">
                    {(t.maxHp != null || t.maxMana != null) && (
                      <span className="text-slate-400 text-xs">
                        {t.maxHp != null &&
                          `PV ${t.hp ?? t.maxHp}/${t.maxHp}`}
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
                          if (
                            window.confirm(
                              `Supprimer le jeton « ${t.name} » ?`
                            )
                          ) {
                            onTokenDelete(t.id);
                          }
                        }}
                        className="opacity-50 hover:opacity-100 text-red-400 hover:text-red-300 text-xs p-0.5"
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
        </div>
      )}
    </div>
  );
}
