import type { Member } from '../../realtime/protocol';

const PALETTE = [
  { bg: '#3a5f8a', ring: '#8fb4dc' },
  { bg: '#5b7a3a', ring: '#a9c97f' },
  { bg: '#6d4a8a', ring: '#bca0d6' },
  { bg: '#8a4a3a', ring: '#e0a08f' },
  { bg: '#2f7a72', ring: '#8fd1c8' },
  { bg: '#8a6a2e', ring: '#e0c27f' },
  { bg: '#7a3a5f', ring: '#d69fbf' },
];

/** Couleur stable d'un participant (même couleur dans le chat et la barre de présence). */
export function colorForUser(userId: number, players: Member[]) {
  const playerIds = players.filter((p) => p.role !== 'MJ').map((p) => p.userId);
  const idx = playerIds.indexOf(userId);
  return PALETTE[(idx >= 0 ? idx : userId) % PALETTE.length];
}

export function displayNameOf(
  m: Pick<Member, 'characterName' | 'displayName'>
) {
  return m.characterName?.trim() || m.displayName || 'Joueur';
}

export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
