import { useCallback, useEffect, useState } from 'react';
import { MusicAPI } from '../api/client';
import {
  musicPositionAt,
  type ClientAction,
  type MusicState,
} from '../realtime/protocol';
import { useSyncedAudio } from './useSyncedAudio';

export interface Track {
  id: number;
  gameId?: number;
  filename: string;
  url: string;
}

/** Nom affichable d'un morceau (sans extension). */
export function trackTitle(track: Track | undefined) {
  if (!track) return '';
  return track.filename.replace(/\.[a-z0-9]+$/i, '');
}

interface Options {
  gameId: number;
  music: MusicState;
  serverOffsetMs: number;
  isGM: boolean;
  send: (action: ClientAction) => boolean;
}

/**
 * Musique d'ambiance de la table : un seul lecteur audio pour toute la page,
 * qui suit l'état diffusé par le serveur. Le MJ dispose en plus des commandes.
 * Le lecteur reste actif quel que soit l'onglet ouvert.
 */
export function useAmbientMusic({
  gameId,
  music,
  serverOffsetMs,
  isGM,
  send,
}: Options) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [localVolume, setLocalVolume] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    MusicAPI.list(gameId)
      .then(({ data }) => !cancelled && setTracks(data.tracks ?? []))
      .catch(() => !cancelled && setTracks([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const current = tracks.find((t) => t.id === music.trackId);
  const src =
    music.trackId == null
      ? ''
      : (current?.url ?? `/api/games/${gameId}/music/${music.trackId}/file`);
  const index = tracks.findIndex((t) => t.id === music.trackId);

  const play = useCallback(
    (trackId: number, position = 0) =>
      send({ action: 'music.play', trackId, position }),
    [send]
  );
  const next = useCallback(() => {
    if (!isGM || tracks.length === 0) return;
    play(tracks[index < 0 || index >= tracks.length - 1 ? 0 : index + 1].id);
  }, [isGM, tracks, index, play]);
  const prev = useCallback(() => {
    if (tracks.length === 0) return;
    play(tracks[index <= 0 ? tracks.length - 1 : index - 1].id);
  }, [tracks, index, play]);

  const audio = useSyncedAudio({
    music,
    serverOffsetMs,
    src,
    localVolume: isGM ? 1 : localVolume,
    // Seul le MJ enchaîne sur le morceau suivant.
    onEnded: isGM ? next : undefined,
  });

  const togglePlay = useCallback(() => {
    if (music.playing) send({ action: 'music.pause' });
    else if (music.trackId != null)
      play(music.trackId, musicPositionAt(music, Date.now() + serverOffsetMs));
    else if (tracks[0]) play(tracks[0].id);
  }, [music, serverOffsetMs, tracks, play, send]);

  return {
    ...audio,
    tracks,
    loading,
    current,
    title: trackTitle(current),
    music,
    isGM,
    localVolume,
    setLocalVolume,
    play,
    next,
    prev,
    togglePlay,
    stop: () => send({ action: 'music.stop' }),
    seek: (position: number) => send({ action: 'music.seek', position }),
    setVolume: (volume: number) => send({ action: 'music.volume', volume }),
  };
}

export type AmbientMusic = ReturnType<typeof useAmbientMusic>;
