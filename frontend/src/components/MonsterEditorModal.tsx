import { useState, useCallback, useRef, useEffect } from 'react';

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
}

interface MonsterEditorModalProps {
  element: GameElementFull;
  onClose: () => void;
  onSave?: (data: Partial<GameElementFull>) => void;
  mode: 'edit' | 'view';
  tokenData?: { hp: number; maxHp: number; mana: number; maxMana: number };
}

export function MonsterEditorModal({
  element,
  onClose,
  onSave,
  mode,
  tokenData,
}: MonsterEditorModalProps) {
  const [name, setName] = useState(element.name);
  const [description, setDescription] = useState(element.description ?? '');
  const [uniqueTrait, setUniqueTrait] = useState(element.uniqueTrait ?? '');
  const [loot, setLoot] = useState(element.loot ?? '');
  const [maxHp, setMaxHp] = useState<number>(element.maxHp ?? 10);
  const [maxMana, setMaxMana] = useState<number>(element.maxMana ?? 0);
  const [iconPosX, setIconPosX] = useState(element.iconPosX ?? 50);
  const [iconPosY, setIconPosY] = useState(element.iconPosY ?? 50);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
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
              style={{ cursor: isEdit ? 'grab' : 'default' }}
            >
              <img
                src={element.imageUrl}
                alt=""
                className="w-full h-full object-cover"
                style={{
                  objectPosition: `${iconPosX}% ${iconPosY}%`,
                }}
                draggable={false}
              />
              {dragging && (
                <div className="absolute inset-0 bg-black/20 pointer-events-none" />
              )}
            </div>
            {isEdit && (
              <div className="flex gap-2 justify-center text-xs text-fantasy-muted-soft">
                <span>X: {iconPosX}%</span>
                <span>Y: {iconPosY}%</span>
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

          {/* Loot */}
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
