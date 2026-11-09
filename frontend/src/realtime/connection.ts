import { parseEnvelope, type ClientAction, type Envelope } from './protocol';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting';

export interface GameConnectionOptions {
  gameId: number;
  onMessage: (env: Envelope) => void;
  onStatus?: (status: ConnectionStatus, failedAttempts: number) => void;
  /** Pour les tests. */
  createSocket?: (url: string) => WebSocket;
  url?: string;
}

/** Si aucun message n'arrive pendant ce délai, la connexion est considérée morte (le serveur ping toutes les 25 s). */
const LIVENESS_TIMEOUT_MS = 45_000;
const MIN_RETRY_MS = 500;
const MAX_RETRY_MS = 10_000;

/**
 * Connexion WebSocket à une partie :
 * - reconnexion automatique avec délai croissant ;
 * - détection des connexions mortes (absence de ping) ;
 * - reconnexion immédiate quand le réseau revient ou l'onglet redevient visible.
 * À chaque reconnexion le serveur renvoie un instantané complet : rien à rattraper côté client.
 */
export class GameConnection {
  private ws: WebSocket | null = null;
  private stopped = true;
  private failedAttempts = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private livenessTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly opts: GameConnectionOptions;

  constructor(opts: GameConnectionOptions) {
    this.opts = opts;
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleWake);
      document.addEventListener('visibilitychange', this.handleVisibility);
    }
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleWake);
      document.removeEventListener('visibilitychange', this.handleVisibility);
    }
    this.clearTimers();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
      try {
        ws.close();
      } catch {
        // déjà fermée
      }
    }
  }

  /** Envoie une action. Retourne false si la connexion n'est pas ouverte. */
  send(action: ClientAction): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(action));
      return true;
    } catch {
      return false;
    }
  }

  /** Demande un nouvel instantané (ex. après l'échec d'une modification). */
  resync() {
    if (!this.send({ action: 'sync' })) this.reconnectNow();
  }

  private url() {
    if (this.opts.url) return this.opts.url;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Même hôte que la page pour que le cookie de session soit envoyé.
    return `${protocol}//${window.location.host}/api/ws?gameId=${this.opts.gameId}`;
  }

  private connect() {
    if (this.stopped) return;
    this.clearTimers();
    this.opts.onStatus?.(
      this.failedAttempts === 0 ? 'connecting' : 'reconnecting',
      this.failedAttempts
    );

    let ws: WebSocket;
    try {
      ws = this.opts.createSocket
        ? this.opts.createSocket(this.url())
        : new WebSocket(this.url());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.armLiveness();
    };
    ws.onmessage = (event) => {
      this.armLiveness();
      const env = parseEnvelope(String(event.data));
      if (!env) return;
      if (env.type === 'ping') {
        this.send({ action: 'pong' });
        return;
      }
      if (env.type === 'sync.snapshot') {
        this.failedAttempts = 0;
        this.opts.onStatus?.('open', 0);
      }
      this.opts.onMessage(env);
    };
    ws.onerror = () => {
      // onclose suit toujours onerror.
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.failedAttempts += 1;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.stopped) return;
    this.clearTimers();
    this.opts.onStatus?.('reconnecting', this.failedAttempts);
    const base = Math.min(
      MAX_RETRY_MS,
      MIN_RETRY_MS * 2 ** Math.max(0, this.failedAttempts - 1)
    );
    const delay = base / 2 + Math.random() * (base / 2);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  private reconnectNow() {
    if (this.stopped) return;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    this.connect();
  }

  private armLiveness() {
    if (this.livenessTimer) clearTimeout(this.livenessTimer);
    this.livenessTimer = setTimeout(() => {
      // Connexion silencieuse depuis trop longtemps : on la considère morte.
      this.failedAttempts += 1;
      this.reconnectNow();
    }, LIVENESS_TIMEOUT_MS);
  }

  private clearTimers() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.livenessTimer) clearTimeout(this.livenessTimer);
    this.retryTimer = null;
    this.livenessTimer = null;
  }

  private handleWake = () => {
    // En attente d'une nouvelle tentative : on n'attend pas la fin du délai.
    if (!this.stopped && !this.ws) this.reconnectNow();
  };

  private handleVisibility = () => {
    if (document.visibilityState === 'visible') this.handleWake();
  };
}
