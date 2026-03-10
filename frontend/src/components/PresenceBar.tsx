interface ConnectedUser {
  userId: number;
  displayName: string;
  characterName?: string;
  role: string;
}

interface PresenceBarProps {
  users: ConnectedUser[];
}

const ROLE_COLORS: Record<string, string> = {
  MJ: 'bg-fantasy-accent/80',
  PLAYER: 'bg-fantasy-input-soft',
};

export function PresenceBar({ users }: PresenceBarProps) {
  return (
    <div className="rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-3">
      <h3 className="text-sm font-semibold font-heading mb-2 text-fantasy-text-soft">
        Connectés ({users.length})
      </h3>
      <div className="flex flex-wrap gap-2">
        {users.map((u) => (
          <div
            key={u.userId}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs text-fantasy-text-soft ${ROLE_COLORS[u.role] ?? 'bg-fantasy-input-soft'}`}
            title={u.role}
          >
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <span>
              {u.displayName || u.characterName || `Joueur ${u.userId}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
