import { THEMES, useTheme } from '../theme/themes';

interface ThemePickerProps {
  /** Version compacte : trois pastilles seulement (ex. bas de la page d'accueil). */
  compact?: boolean;
}

/** Choix de la palette de couleurs, appliqué immédiatement et mémorisé dans le navigateur. */
export function ThemePicker({ compact = false }: ThemePickerProps) {
  const { theme, setTheme } = useTheme();

  if (compact) {
    return (
      <div
        role="radiogroup"
        aria-label="Palette de couleurs"
        className="flex items-center gap-2"
      >
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={theme === t.id}
            aria-label={t.name}
            title={t.name}
            onClick={() => setTheme(t.id)}
            className={`w-7 h-7 rounded-full p-0.5 border-2 ${
              theme === t.id
                ? 'border-fantasy-accent'
                : 'border-transparent hover:border-fantasy-border'
            }`}
          >
            <span
              className="block w-full h-full rounded-full"
              style={{
                background: `linear-gradient(135deg, ${t.swatches[1]} 50%, ${t.swatches[2]} 50%)`,
              }}
            />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Palette de couleurs"
      className="grid grid-cols-3 gap-2"
    >
      {THEMES.map((t) => {
        const selected = theme === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(t.id)}
            className={`flex flex-col gap-2 p-2.5 rounded-xl border-2 text-left transition-colors ${
              selected
                ? 'border-fantasy-accent bg-fantasy-surface'
                : 'border-fantasy-border-soft hover:border-fantasy-border'
            }`}
          >
            <span
              className="flex h-8 rounded-md overflow-hidden"
              aria-hidden="true"
              style={{ backgroundColor: t.swatches[0] }}
            >
              {t.swatches.slice(1).map((c) => (
                <span
                  key={c}
                  className="flex-1"
                  style={{ backgroundColor: c }}
                />
              ))}
            </span>
            <span className="text-sm font-bold text-fantasy-text leading-tight">
              {t.name}
            </span>
            <span className="text-xs text-fantasy-muted leading-tight">
              {t.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
