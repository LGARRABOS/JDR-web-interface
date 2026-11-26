import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArpenteurAPI } from '@/core/api/client';
import type { GameStore } from '@/core/realtime/gameStore';
import { getErrorMessage } from '@/shared/utils/errorMessage';
import { rightsFor, withSection, type Rights } from './logic';
import type { ArpenteurDoc, ArpenteurPayload, Section } from './types';

interface Pending {
  value: unknown;
  log?: string;
  timer: ReturnType<typeof setTimeout>;
}

export interface UpdateOptions {
  /** Ligne ajoutée au journal de bord. */
  log?: string;
  /** Envoi immédiat (tir, déplacement, amélioration…) plutôt que regroupé. */
  immediate?: boolean;
}

export type UpdateFn = (
  section: Section,
  value: unknown,
  opts?: UpdateOptions
) => void;

/**
 * Document de l'arpenteur avec modifications locales immédiates : un clic
 * s'affiche tout de suite, les clics rapprochés sur une même section sont
 * regroupés en une seule requête, et l'état du serveur reprend la main dès
 * qu'il n'y a plus rien en attente pour cette section.
 */
export function useArpenteur(
  gameId: number,
  payload: ArpenteurPayload | null,
  store: GameStore,
  userId: number,
  isGM: boolean
) {
  const [overrides, setOverrides] = useState<Partial<Record<Section, unknown>>>(
    {}
  );
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(new Map<Section, Pending>());
  const latest = useRef(new Map<Section, number>());
  const seq = useRef(0);

  const dropOverride = (section: Section) =>
    setOverrides((o) => {
      if (!(section in o)) return o;
      const next = { ...o };
      delete next[section];
      return next;
    });

  const flush = useCallback(
    (section: Section) => {
      const p = pending.current.get(section);
      if (!p) return;
      pending.current.delete(section);
      clearTimeout(p.timer);
      const mine = ++seq.current;
      latest.current.set(section, mine);
      ArpenteurAPI.patch(gameId, section, p.value, p.log)
        .then(({ data }) => {
          store.setArpenteurLocally(data as ArpenteurPayload);
          if (
            latest.current.get(section) === mine &&
            !pending.current.has(section)
          )
            dropOverride(section);
        })
        .catch((e) => {
          setError(getErrorMessage(e, 'Modification refusée'));
          if (
            latest.current.get(section) === mine &&
            !pending.current.has(section)
          )
            dropOverride(section);
        });
    },
    [gameId, store]
  );

  const update: UpdateFn = useCallback(
    (section, value, opts) => {
      setOverrides((o) => ({ ...o, [section]: value }));
      const prev = pending.current.get(section);
      if (prev) clearTimeout(prev.timer);
      const log = opts?.log ?? prev?.log;
      const timer = setTimeout(() => flush(section), opts?.immediate ? 0 : 400);
      pending.current.set(section, { value, log, timer });
    },
    [flush]
  );

  // En quittant la page, on envoie ce qui reste en attente.
  useEffect(() => {
    const map = pending.current;
    return () => {
      for (const s of [...map.keys()]) flush(s);
    };
  }, [flush]);

  const doc: ArpenteurDoc | null = useMemo(() => {
    if (!payload) return null;
    let d = payload.arpenteur;
    for (const [s, v] of Object.entries(overrides))
      d = withSection(d, s as Section, v);
    return d;
  }, [payload, overrides]);

  const rights: Rights | null = useMemo(
    () => (doc ? rightsFor(doc, userId, isGM) : null),
    [doc, userId, isGM]
  );

  return {
    doc,
    rights,
    update,
    error,
    clearError: () => setError(null),
    setError,
  };
}
