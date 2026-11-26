import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameConnection, type ConnectionStatus } from './connection';
import type { Envelope } from './protocol';

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  // Helpers de test
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(msg: object) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
}

function setup() {
  const received: Envelope[] = [];
  const statuses: Array<[ConnectionStatus, number]> = [];
  const conn = new GameConnection({
    gameId: 1,
    url: 'ws://test/api/ws?gameId=1',
    createSocket: (url) => new FakeSocket(url) as unknown as WebSocket,
    onMessage: (e) => received.push(e),
    onStatus: (s, n) => statuses.push([s, n]),
  });
  return { conn, received, statuses };
}

const snapshot = {
  type: 'sync.snapshot',
  gameId: 1,
  serverTime: 1,
  payload: {},
};

describe('GameConnection', () => {
  beforeEach(() => {
    FakeSocket.instances = [];
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('répond aux pings et transmet les autres messages', () => {
    const { conn, received } = setup();
    conn.start();
    const ws = FakeSocket.instances[0];
    ws.open();
    ws.receive({ type: 'ping', gameId: 1, serverTime: 1 });
    expect(ws.sent).toEqual([JSON.stringify({ action: 'pong' })]);
    expect(received).toHaveLength(0);
    ws.receive(snapshot);
    expect(received).toHaveLength(1);
    conn.stop();
  });

  it('se reconnecte après une coupure', () => {
    const { conn, statuses } = setup();
    conn.start();
    FakeSocket.instances[0].open();
    FakeSocket.instances[0].receive(snapshot);
    expect(statuses.at(-1)).toEqual(['open', 0]);

    FakeSocket.instances[0].drop();
    expect(statuses.at(-1)?.[0]).toBe('reconnecting');
    vi.advanceTimersByTime(10_000);
    expect(FakeSocket.instances).toHaveLength(2);
    conn.stop();
  });

  it('ferme une connexion silencieuse et en ouvre une nouvelle', () => {
    const { conn } = setup();
    conn.start();
    FakeSocket.instances[0].open();
    vi.advanceTimersByTime(46_000); // aucun message, pas même un ping
    vi.advanceTimersByTime(10_000);
    expect(FakeSocket.instances.length).toBeGreaterThan(1);
    conn.stop();
  });

  it("n'envoie rien si la connexion n'est pas ouverte", () => {
    const { conn } = setup();
    conn.start();
    expect(conn.send({ action: 'sync' })).toBe(false);
    conn.stop();
  });

  it('ne se reconnecte plus après stop()', () => {
    const { conn } = setup();
    conn.start();
    FakeSocket.instances[0].open();
    conn.stop();
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
