import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./version', () => ({
  startVersionWatch: (opts: { onOutdated: (v: string) => void }) => {
    trigger = opts.onOutdated;
    return () => {};
  },
}));

let trigger: ((v: string) => void) | null = null;

import { OutdatedVersionGuard } from './OutdatedVersionGuard';

describe('OutdatedVersionGuard', () => {
  afterEach(() => {
    trigger = null;
  });

  it("bloque la page et demande d'actualiser après un déploiement", () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    const onKey = vi.fn();
    const onClick = vi.fn();
    window.addEventListener('keydown', onKey);
    root.addEventListener('click', onClick);

    const { unmount } = render(<OutdatedVersionGuard />, { container: root });
    expect(screen.queryByRole('alertdialog')).toBeNull();

    act(() => trigger?.('nouvelle'));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('Actualiser la page')).toBeTruthy();
    expect(root.hasAttribute('inert')).toBe(true);

    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', bubbles: true })
    );
    root.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onKey).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();

    window.removeEventListener('keydown', onKey);
    unmount();
    expect(root.hasAttribute('inert')).toBe(false);
    root.remove();
  });
});
