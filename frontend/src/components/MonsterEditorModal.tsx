import { useState, useCallback, useRef, useEffect } from 'react';
import type { StatusEffect } from './MapCanvas';

export interface GameElementFull {
  id: number;
  gameId: number;
  name: string;
  imageUrl: string;
  category: string;
  tags?: string[];
  createdAt: string;
  description?: string;
  uniqueTrait?: string;
  loot?: string;
  maxHp?: number;
  maxMana?: number;
  iconPosX?: number;
  iconPosY?: number;
  iconScale?: number;
}

interface MonsterEditorModalProps {
  element: GameElementFull;
  onClose: () => void;
  onSave?: (data: Partial<GameElementFull>) => void;
  mode: 'edit' | 'view';
  tokenData?: { hp: number; maxHp: number; mana: number; maxMana: number };
  /** Pour les joueurs : le loot n'est visible qu'après la mort du monstre (kind === 'MORT') */
  tokenKind?: string;
  isGM?: boolean;
  /** ID du jeton en jeu (pour éditer les effets de statut) */
  tokenId?: number;
  /** Effets de statut du jeton (poison, brûlure, etc.) */
  statusEffects?: StatusEffect[];
  /** Callback pour mettre à jour les effets de statut du jeton */
  onStatusUpdate?: (statusEffects: StatusEffect[]) => void;
}

export function MonsterEditorModal({
  element,
  onClose,
  onSave,
  mode,
  tokenData,
  tokenId,
  statusEffects = [],
  onStatusUpdate,
}: MonsterEditorModalProps) {
  const [name, setName] = useState(element.name);
  const [description, setDescription] = useState(element.description ?? '');
  const [uniqueTrait, setUniqueTrait] = useState(element.uniqueTrait ?? '');
  const [loot, setLoot] = useState(element.loot ?? '');
  const [maxHp, setMaxHp] = useState<number>(element.maxHp ?? 10);
  const [maxMana, setMaxMana] = useState<number>(element.maxMana ?? 0);
  const [iconPosX, setIconPosX] = useState(element.iconPosX ?? 50);
  const [iconPosY, setIconPosY] = useState(element.iconPosY ?? 50);
  const [iconScale, setIconScale] = useState(element.iconScale ?? 1);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [localStatusEffects, setLocalStatusEffects] = useState<StatusEffect[]>(
    statusEffects
  );
  const [newStatusName, setNewStatusName] = useState('');
  const [newStatusEffect, setNewStatusEffect] = useState('');
  const [newStatusTurns, setNewStatusTurns] = useState(1);

  useEffect(() => {
    setLocalStatusEffects(statusEffects);
  }, [statusEffects]);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const isEdit = mode === 'edit';
  const displayHp = tokenData ? tokenData.hp : (element.maxHp ?? 10);
  const displayMaxHp = tokenData ? tokenData.maxHp : (element.maxHp ?? 10);
  const displayMana = tokenData ? tokenData.mana : (element.maxMana ?? 0);
  const displayMaxMana = tokenData ? tokenData.maxMana : (element.maxMana ?? 0);

  const handleImageDrag = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isEdit || !containerRef.current) return;
      e.preventDefault();
      const rect = containerRef.current.getBoundingClientRect();
      const size = Math.min(rect.width, rect.height);
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const move = (ev: MouseEvent) => {
        const dx = (ev.clientX - centerX) / (size / 2);
        const dy = (ev.clientY - centerY) / (size / 2);
        const x = Math.round(50 + dx * 50);
        const y = Math.round(50 + dy * 50);
        setIconPosX(Math.max(0, Math.min(100, x)));
        setIconPosY(Math.max(0, Math.min(100, y)));
      };

      const up = () => {
        setDragging(false);
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };

      setDragging(true);
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      move(e.nativeEvent);
    },
    [isEdit]
  );

  const handleSave = useCallback(async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave({
        name,
        description: description || undefined,
        uniqueTrait: uniqueTrait || undefined,
        loot: loot || undefined,
        maxHp,
        maxMana,
        iconPosX,
        iconPosY,
        iconScale,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }, [
    name,
    description,
    uniqueTrait,
    loot,
    maxHp,
    maxMana,
    iconPosX,
    iconPosY,
    iconScale,
    onSave,
    onClose,
  ]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => e.target === overlayRef.current && onClose()}
    >
      <div
        className="rounded-lg bg-fantasy-surface border border-fantasy-border-soft shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-fantasy-border-soft flex justify-between items-center">
          <h2 className="text-lg font-semibold font-heading text-fantasy-text-soft">
            {isEdit ? 'Éditer le monstre' : 'Fiche monstre'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-fantasy-muted-soft hover:text-fantasy-text-soft p-1"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {/* Zone image avec positionnement */}
          <div className="flex flex-col gap-2">
            <label className="block text-sm text-fantasy-muted-soft">
              Aperçu du jeton
            </label>
            <div
              ref={containerRef}
              className="relative w-32 h-32 mx-auto rounded-full overflow-hidden bg-fantasy-input-soft border-2 border-fantasy-border-soft cursor-pointer"
              onMouseDown={handleImageDrag}
              onWheel={(e) => {
                if (!isEdit) return;
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.1 : 0.1;
                setIconScale((s) => Math.max(0.5, Math.min(2, s + delta)));
              }}
              style={{ cursor: isEdit ? 'grab' : 'default' }}
            >
              <img
                src={element.imageUrl}
                alt=""
                className="w-full h-full object-cover"
                style={{
                  objectPosition: `${iconPosX}% ${iconPosY}%`,
                  transform: `scale(${iconScale})`,
                  transformOrigin: `${iconPosX}% ${iconPosY}%`,
                }}
                draggable={false}
              />
              {dragging && (
                <div className="absolute inset-0 bg-black/20 pointer-events-none" />
              )}
            </div>
            {isEdit && (
              <div className="flex flex-wrap gap-3 justify-center text-xs text-fantasy-muted-soft items-center">
                <span>X: {iconPosX}%</span>
                <span>Y: {iconPosY}%</span>
                <div className="flex gap-1 items-center">
                  <span>Zoom:</span>
                  <button
                    type="button"
                    onClick={() => setIconScale((s) => Math.max(0.5, s - 0.1))}
                    className="w-5 h-5 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft font-bold text-[10px]"
                  >
                    −
                  </button>
                  <span className="w-7 text-center">
                    {Math.round(iconScale * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setIconScale((s) => Math.min(2, s + 0.1))}
                    className="w-5 h-5 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft font-bold text-[10px]"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Nom */}
          <div>
            <label className="block text-sm text-fantasy-muted-soft mb-1">
              Nom
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              readOnly={!isEdit}
              className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft placeholder:text-fantasy-muted-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none disabled:opacity-70"
            />
          </div>

          {/* PV / Mana */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-fantasy-muted-soft mb-1">
                PV
              </label>
              {tokenData ? (
                <div className="rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft">
                  {displayHp} / {displayMaxHp}
                </div>
              ) : (
                <input
                  type="number"
                  min={0}
                  value={maxHp}
                  onChange={(e) =>
                    setMaxHp(Math.max(0, parseInt(e.target.value, 10) || 0))
                  }
                  readOnly={!isEdit}
                  className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none disabled:opacity-70"
                />
              )}
            </div>
            <div>
              <label className="block text-sm text-fantasy-muted-soft mb-1">
                Mana
              </label>
              {tokenData ? (
                <div className="rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft">
                  {displayMana} / {displayMaxMana}
                </div>
              ) : (
                <input
                  type="number"
                  min={0}
                  value={maxMana}
                  onChange={(e) =>
                    setMaxMana(Math.max(0, parseInt(e.target.value, 10) || 0))
                  }
                  readOnly={!isEdit}
                  className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none disabled:opacity-70"
                />
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm text-fantasy-muted-soft mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              readOnly={!isEdit}
              rows={3}
              className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft placeholder:text-fantasy-muted-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none resize-y disabled:opacity-70"
            />
          </div>

          {/* Caractéristique unique */}
          <div>
            <label className="block text-sm text-fantasy-muted-soft mb-1">
              Caractéristique unique
            </label>
            <textarea
              value={uniqueTrait}
              onChange={(e) => setUniqueTrait(e.target.value)}
              readOnly={!isEdit}
              rows={2}
              className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft placeholder:text-fantasy-muted-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none resize-y disabled:opacity-70"
            />
          </div>

          {/* Loot : visible uniquement pour le MJ, ou pour les joueurs après la mort du monstre */}
          {(isGM || tokenKind === 'MORT') && (
            <div>
              <label className="block text-sm text-fantasy-muted-soft mb-1">
                Loot disponible
              </label>
              <textarea
                value={loot}
                onChange={(e) => setLoot(e.target.value)}
                readOnly={!isEdit}
                rows={2}
                className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft placeholder:text-fantasy-muted-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none resize-y disabled:opacity-70"
              />
            </div>
          )}

          {/* Effets de statut : visible uniquement en vue jeton (tokenData présent) */}
          {tokenData && (
            <div>
              <label className="block text-sm text-fantasy-muted-soft mb-2">
                Effets de statut
              </label>
              {localStatusEffects.length === 0 ? (
                <p className="text-sm text-fantasy-muted-soft italic">
                  Aucun effet actif
                </p>
              ) : (
                <div className="space-y-2">
                  {localStatusEffects.map((s, i) => (
                    <div
                      key={i}
                      className="rounded bg-fantasy-input-soft px-3 py-2 text-sm border border-fantasy-border-soft"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-fantasy-text-soft">
                            {s.name}
                          </span>
                          {s.effect && (
                            <p className="text-fantasy-muted-soft text-xs mt-0.5">
                              {s.effect}
                            </p>
                          )}
                          <span className="text-fantasy-muted-soft text-xs">
                            {s.turnsRemaining} tour{s.turnsRemaining !== 1 ? 's' : ''} restant{s.turnsRemaining !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {tokenId != null && onStatusUpdate && (
                          <div className="flex gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...localStatusEffects];
                                next[i] = {
                                  ...next[i],
                                  turnsRemaining: Math.max(
                                    0,
                                    next[i].turnsRemaining - 1
                                  ),
                                };
                                if (next[i].turnsRemaining === 0) {
                                  next.splice(i, 1);
                                }
                                setLocalStatusEffects(next);
                                onStatusUpdate(next);
                              }}
                              className="px-2 py-0.5 rounded text-xs bg-fantasy-input-hover-soft hover:bg-fantasy-accent/30 text-fantasy-text-soft"
                              title="Réduire d'un tour"
                            >
                              −1
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const next = localStatusEffects.filter(
                                  (_, j) => j !== i
                                );
                                setLocalStatusEffects(next);
                                onStatusUpdate(next);
                              }}
                              className="px-2 py-0.5 rounded text-xs bg-fantasy-danger/30 hover:bg-fantasy-danger/50 text-fantasy-error"
                              title="Supprimer"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {tokenId != null && onStatusUpdate && (
                <div className="mt-3 p-3 rounded bg-fantasy-input-soft/50 border border-fantasy-border-soft space-y-2">
                  <p className="text-xs text-fantasy-muted-soft">
                    Ajouter un effet
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    <input
                      type="text"
                      value={newStatusName}
                      onChange={(e) => setNewStatusName(e.target.value)}
                      placeholder="Nom (ex: Poison)"
                      className="w-full rounded bg-fantasy-input-soft px-3 py-1.5 text-sm text-fantasy-text-soft placeholder:text-fantasy-muted-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none"
                    />
                    <input
                      type="text"
                      value={newStatusEffect}
                      onChange={(e) => setNewStatusEffect(e.target.value)}
                      placeholder="Effet (ex: -2 PV/tour)"
                      className="w-full rounded bg-fantasy-input-soft px-3 py-1.5 text-sm text-fantasy-text-soft placeholder:text-fantasy-muted-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none"
                    />
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-fantasy-muted-soft">
                        Tours :
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={newStatusTurns}
                        onChange={(e) =>
                          setNewStatusTurns(
                            Math.max(1, parseInt(e.target.value, 10) || 1)
                          )
                        }
                        className="w-16 rounded bg-fantasy-input-soft px-2 py-1.5 text-sm text-fantasy-text-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!newStatusName.trim()) return;
                          const next: StatusEffect = {
                            name: newStatusName.trim(),
                            effect: newStatusEffect.trim(),
                            turnsRemaining: newStatusTurns,
                          };
                          const updated = [...localStatusEffects, next];
                          setLocalStatusEffects(updated);
                          onStatusUpdate(updated);
                          setNewStatusName('');
                          setNewStatusEffect('');
                          setNewStatusTurns(1);
                        }}
                        className="px-3 py-1.5 rounded text-sm bg-fantasy-accent hover:bg-fantasy-accent-hover text-fantasy-bg font-medium"
                      >
                        Ajouter
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {isEdit && (
          <div className="px-4 py-3 border-t border-fantasy-border-soft flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-sm"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded bg-fantasy-accent hover:bg-fantasy-accent-hover text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
