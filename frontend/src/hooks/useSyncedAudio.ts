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
    const onDuration = () =>
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const ended = () => onEndedRef.current?.();
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('durationchange', onDuration);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('ended', ended);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('durationchange', onDuration);
      audio.removeEventListener('loadedmetadata', onDuration);
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

export function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
