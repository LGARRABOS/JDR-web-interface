import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchDeployedVersion,
  isOutdated,
  requestVersionCheck,
  startVersionWatch,
} from './version';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('isOutdated', () => {
  it('ne bloque que si les deux versions sont connues et différentes', () => {
    expect(isOutdated('a', 'b')).toBe(true);
    expect(isOutdated('a', 'a')).toBe(false);
    expect(isOutdated('a', null)).toBe(false);
    expect(isOutdated('', 'b')).toBe(false);
  });
});

describe('fetchDeployedVersion', () => {
  it('lit la version de version.json', async () => {
    const f = vi.fn(
      async () => new Response(JSON.stringify({ version: 'abc' }))
    );
    expect(await fetchDeployedVersion(f as unknown as typeof fetch)).toBe(
      'abc'
    );
  });

  it('renvoie null sur réponse invalide ou erreur', async () => {
    const html = vi.fn(async () => new Response('<!doctype html>'));
    expect(await fetchDeployedVersion(html as unknown as typeof fetch)).toBe(
      null
    );
    const notFound = vi.fn(async () => new Response('', { status: 404 }));
    expect(
      await fetchDeployedVersion(notFound as unknown as typeof fetch)
    ).toBe(null);
    const down = vi.fn(async () => {
      throw new Error('réseau');
    });
    expect(await fetchDeployedVersion(down as unknown as typeof fetch)).toBe(
      null
    );
  });
});

describe('startVersionWatch', () => {
  let stop: (() => void) | null = null;
  afterEach(() => {
    stop?.();
    stop = null;
  });

  it('ne fait rien sans version compilée (dev)', async () => {
    const fetchVersion = vi.fn(async () => 'b');
    const onOutdated = vi.fn();
    stop = startVersionWatch({ loaded: '', fetchVersion, onOutdated });
    await flush();
    expect(fetchVersion).not.toHaveBeenCalled();
  });

  it('prévient une seule fois quand une nouvelle version est déployée', async () => {
    let deployed = 'a';
    const fetchVersion = vi.fn(async () => deployed);
    const onOutdated = vi.fn();
    stop = startVersionWatch({ loaded: 'a', fetchVersion, onOutdated });
    await flush();
    expect(onOutdated).not.toHaveBeenCalled();

    deployed = 'b';
    requestVersionCheck();
    await flush();
    expect(onOutdated).toHaveBeenCalledWith('b');

    requestVersionCheck();
    await flush();
    expect(onOutdated).toHaveBeenCalledTimes(1);
  });
});
