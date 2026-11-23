import { useCallback, useEffect, useRef, useState } from 'react';
import { musicPositionAt, type MusicState } from '../realtime/protocol';

interface SyncedAudioOptions {
  music: MusicState;
  serverOffsetMs: number;
  /** URL du morceau courant (vide si aucun). */
  src: string;
  /** Volume local de l'auditeur (0–1), multiplié par le volume du MJ. */
  localVolume?: number;
  onEnded?: () => void;
}

const DRIFT_TOLERANCE_S = 1;

/**
 * Fait suivre à un élément <audio> l'état musical diffusé par le serveur.
 * La position est recalculée à partir de l'horloge serveur, donc un joueur qui
 * arrive en cours de morceau démarre au bon endroit.
 */
export function useSyncedAudio({
  music,
  serverOffsetMs,
  src,
  localVolume = 1,
  onEnded,
}: SyncedAudioOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const expectedPosition = useCallback(
    () => musicPositionAt(music, Date.now() + serverOffsetMs),
    [music, serverOffsetMs]
  );

  const tryPlay = useCallback((audio: HTMLAudioElement) => {
    audio
      .play()
      .then(() => setBlocked(false))
      .catch((err: unknown) => {
        // Les navigateurs bloquent la lecture tant que l'utilisateur n'a pas interagi avec la page.
        if ((err as { name?: string })?.name === 'NotAllowedError')
          setBlocked(true);
      });
  }, []);

  // Appliquer l'état (morceau, lecture/pause, position).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!src || music.trackId == null) {
      audio.pause();
      if (audio.dataset.src) {
        audio.removeAttribute('src');
        delete audio.dataset.src;
        audio.load();
      }
      setPosition(0);
      setDuration(0);
      return;
    }
    if (audio.dataset.src !== src) {
      audio.src = src;
      audio.dataset.src = src;
    }
    const seek = () => {
      const target = expectedPosition();
      if (Math.abs(audio.currentTime - target) > DRIFT_TOLERANCE_S) {
        try {
          audio.currentTime = target;
        } catch {
          // métadonnées pas encore chargées
        }
      }
    };
    if (audio.readyState >= 1) seek();
    else audio.addEventListener('loadedmetadata', seek, { once: true });

    if (music.playing) tryPlay(audio);
    else audio.pause();

    return () => audio.removeEventListener('loadedmetadata', seek);
  }, [music, src, expectedPosition, tryPlay]);

  // Volume (séparé pour ne pas provoquer de saut de position).
  useEffect(() => {
    const audio = audioRef.current;
    if (audio)
      audio.volume = Math.max(
        0,
        Math.min(1, (music.volume ?? 1) * localVolume)
      );
  }, [music.volume, localVolume]);

  // Corriger la dérive pendant la lecture.
  useEffect(() => {
    if (!music.playing || !src) return;
    const id = setInterval(() => {
      const audio = audioRef.current;
      if (!audio || audio.paused || audio.readyState < 1) return;
      const target = expectedPosition();
      if (Number.isFinite(audio.duration) && target >= audio.duration) return;
      if (Math.abs(audio.currentTime - target) > DRIFT_TOLERANCE_S * 2)
        audio.currentTime = target;
    }, 5000);
    return () => clearInterval(id);
  }, [music.playing, src, expectedPosition]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setPosition(audio.currentTime);
    // Certains fichiers (MP3 à débit variable, WAV volumineux) annoncent une
    // durée infinie : on se rabat sur la plage disponible au déplacement.
    const onDuration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
        return;
      }
      const r = audio.seekable;
      setDuration(r && r.length > 0 ? r.end(r.length - 1) : 0);
    };
    const ended = () => onEndedRef.current?.();
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('durationchange', onDuration);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('progress', onDuration);
    audio.addEventListener('ended', ended);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('durationchange', onDuration);
      audio.removeEventListener('loadedmetadata', onDuration);
      audio.removeEventListener('progress', onDuration);
      audio.removeEventListener('ended', ended);
    };
  }, []);

  /** À appeler depuis un clic quand la lecture automatique est bloquée. */
  const unlock = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = expectedPosition();
    tryPlay(audio);
  }, [expectedPosition, tryPlay]);

  return { audioRef, blocked, unlock, position, duration };
}

/**
 * Lit un temps saisi : « 1:30 », « 1:02:03 », « 90 » (secondes) ou « 1m30 ».
 * Renvoie null si la saisie n'est pas un temps valide.
 */
export function parseTime(input: string): number | null {
  const t = input.trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return null;
  const mh = /^(?:(\d+)h)?(?:(\d+)m(?:in)?)?(?:(\d+(?:[.,]\d+)?)s?)?$/.exec(t);
  if (/[hm]/.test(t) && mh) {
    const [, h, m, sec] = mh;
    return (
      +(h ?? 0) * 3600 +
      +(m ?? 0) * 60 +
      parseFloat((sec ?? '0').replace(',', '.'))
    );
  }
  const parts = t.split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+(?:[.,]\d+)?$/.test(p)))
    return null;
  return parts.reduce(
    (acc, p) => acc * 60 + parseFloat(p.replace(',', '.')),
    0
  );
}

export function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}
