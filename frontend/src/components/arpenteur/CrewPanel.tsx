import { useMemo, useState } from 'react';
import {
  POSTS,
  SKILLS,
  SKILL_LEVELS,
  loyaltyColor,
} from '../../arpenteur/catalog';
import {
  averageRespect,
  canonicalPost,
  crewPlaces,
  foldKey,
  initials,
  newId,
  postFit,
  type Rights,
} from '../../arpenteur/logic';
import type { UpdateFn } from '../../arpenteur/useArpenteur';
import type { ArpenteurDoc, CrewMember } from '../../arpenteur/types';
import type { Member } from '../../realtime/protocol';
import {
  Btn,
  Card,
  Dialog,
  LiveField,
  Meter,
  NumberField,
  Pips,
  ReadOnlyHint,
  SelectField,
  Stepper,
  healthColor,
} from './ui';

type Filter = 'all' | 'npc' | 'pc' | 'sortie';

interface Props {
  doc: ArpenteurDoc;
  rights: Rights;
  update: UpdateFn;
  players: Member[];
  isGM: boolean;
  userId: number;
}

const emptyMember = (): CrewMember => ({
  id: newId(),
  name: '',
  playerName: '',
  pc: false,
  userId: null,
  sex: '',
  race: '',
  loyalty: '',
  combat: 0,
  extraction: 0,
  entretien: 0,
  expertise: 0,
  post: '',
  goodPost: '',
  badPost: '',
  price: '',
  coupons: '',
  vie: 20,
  vieMax: 20,
  fatigue: 0,
  respect: 10,
  sortie: false,
  note: '',
});

export function CrewPanel({
  doc,
  rights,
  update,
  players,
  isGM,
  userId,
}: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<CrewMember | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const crew = doc.crew;
  const places = crewPlaces(crew.members);
  const respect = averageRespect(doc);
  const out = crew.members.filter((m) => m.sortie);
  const shown = crew.members.filter((m) =>
    filter === 'npc'
      ? !m.pc
      : filter === 'pc'
        ? m.pc
        : filter === 'sortie'
          ? m.sortie
          : true
  );
  const canCrew = rights.crew;
  const canHeal = rights.crew || rights.crewHealth;

  const saveMembers = (members: CrewMember[], log?: string) =>
    update('crew', { ...crew, members }, { log, immediate: !!log });

  const setHealth = (id: string, patch: { vie?: number; fatigue?: number }) => {
    const members = crew.members.map((m) =>
      m.id === id ? { ...m, ...patch } : m
    );
    if (rights.crew) saveMembers(members);
    else
      update(
        'crewHealth',
        members.map((m) => ({ id: m.id, vie: m.vie, fatigue: m.fatigue }))
      );
  };

  const loyalties = useMemo(
    () => [...new Set(crew.members.map((m) => m.loyalty).filter(Boolean))],
    [crew.members]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Places" value={`${places} / ${crew.capacity}`}>
          <Meter
            value={places}
            max={Math.max(1, crew.capacity)}
            color={places > crew.capacity ? '#d9573f' : undefined}
          />
        </Stat>
        <Stat
          label="Respect moyen"
          value={`${respect.value} / ${crew.respectMax}`}
          hint={
            crew.respectOverride != null && respect.computed !== respect.value
              ? `calculé : ${respect.computed}`
              : undefined
          }
        >
          <Meter
            value={respect.value}
            max={crew.respectMax}
            color={healthColor(respect.value / crew.respectMax)}
          />
        </Stat>
        <Stat
          label="Équipage de sortie"
          value={String(out.length)}
          hint={out.map((m) => m.name).join(', ') || 'personne'}
        />
        <Stat
          label="Personnages joueurs"
          value={String(crew.members.filter((m) => m.pc).length)}
          hint="hors places d'équipage"
        />
      </div>

      <Card
        title="Équipage"
        subtitle={`${crew.members.length} membre${crew.members.length > 1 ? 's' : ''} à bord`}
        actions={
          <>
            <div className="flex rounded-lg bg-black/25 p-0.5">
              {(
                [
                  ['all', 'Tous'],
                  ['npc', 'Équipage'],
                  ['pc', 'Personnages'],
                  ['sortie', 'En sortie'],
                ] as [Filter, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`h-8 px-2.5 rounded-md text-xs ${filter === id ? 'arp-btn-brass' : 'text-fantasy-text-soft hover:bg-fantasy-input-soft'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {canCrew && (
              <>
                <Btn onClick={() => setSettingsOpen(true)} variant="ghost">
                  Réglages
                </Btn>
                <Btn
                  onClick={() => setEditing(emptyMember())}
                  variant="primary"
                >
                  Recruter
                </Btn>
              </>
            )}
          </>
        }
      >
        {!canCrew && (
          <ReadOnlyHint doc={doc} section={canHeal ? 'crew' : 'crewHealth'} />
        )}
        {shown.length === 0 ? (
          <p className="text-sm text-fantasy-muted py-6 text-center">
            {crew.members.length
              ? 'Personne ici.'
              : 'Aucun membre. Recrutez votre équipage ou importez votre classeur (Réglages).'}
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3 mt-2">
            {shown.map((m) => (
              <MemberCard
                key={m.id}
                m={m}
                doc={doc}
                players={players}
                canEdit={canCrew}
                canHeal={canHeal}
                canSetMax={isGM || m.userId === userId}
                onMax={(v) => update('crewSelf', [{ id: m.id, vieMax: v }])}
                onEdit={() => setEditing(m)}
                onHealth={(p) => setHealth(m.id, p)}
                onSortie={() =>
                  saveMembers(
                    crew.members.map((x) =>
                      x.id === m.id ? { ...x, sortie: !x.sortie } : x
                    ),
                    `${m.name} ${m.sortie ? 'reste à bord' : "rejoint l'équipage de sortie"}`
                  )
                }
              />
            ))}
          </div>
        )}
      </Card>

      {editing && (
        <MemberEditor
          member={editing}
          isNew={!crew.members.some((m) => m.id === editing.id)}
          isGM={isGM}
          players={players}
          loyalties={loyalties}
          fatigueMax={crew.fatigueMax}
          respectMax={crew.respectMax}
          onClose={() => setEditing(null)}
          onSave={(m) => {
            const exists = crew.members.some((x) => x.id === m.id);
            saveMembers(
              exists
                ? crew.members.map((x) => (x.id === m.id ? m : x))
                : [...crew.members, m],
              exists
                ? undefined
                : `Recrutement : ${m.name}${m.post ? ` (${m.post})` : ''}`
            );
            setEditing(null);
          }}
          onDelete={() => {
            saveMembers(
              crew.members.filter((x) => x.id !== editing.id),
              `${editing.name} quitte l'équipage`
            );
            setEditing(null);
          }}
        />
      )}
      {settingsOpen && (
        <Dialog
          open
          onClose={() => setSettingsOpen(false)}
          title="Réglages de l'équipage"
          footer={<Btn onClick={() => setSettingsOpen(false)}>Fermer</Btn>}
        >
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Places d'équipage"
              value={crew.capacity}
              min={0}
              max={60}
              onCommit={(v) => update('crew', { ...crew, capacity: v })}
            />
            <NumberField
              label="Fatigue maximale"
              value={crew.fatigueMax}
              min={1}
              max={100}
              onCommit={(v) => update('crew', { ...crew, fatigueMax: v })}
            />
            <NumberField
              label="Respect maximal"
              value={crew.respectMax}
              min={1}
              max={100}
              onCommit={(v) => update('crew', { ...crew, respectMax: v })}
            />
            <label className="flex flex-col gap-1 text-xs text-fantasy-muted">
              Respect moyen
              <select
                className="arp-input"
                value={
                  crew.respectOverride == null
                    ? 'auto'
                    : String(crew.respectOverride)
                }
                onChange={(e) =>
                  update('crew', {
                    ...crew,
                    respectOverride:
                      e.target.value === 'auto'
                        ? null
                        : parseInt(e.target.value, 10),
                  })
                }
              >
                <option value="auto">Calculé ({respect.computed})</option>
                {Array.from({ length: crew.respectMax + 1 }, (_, i) => (
                  <option key={i} value={i}>
                    Fixé à {i}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="arp-card px-4 py-3.5 flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.12em] text-fantasy-muted">
        {label}
      </span>
      <span className="font-heading text-xl text-fantasy-text">{value}</span>
      {children}
      {hint && (
        <span className="text-[11px] text-fantasy-muted truncate" title={hint}>
          {hint}
        </span>
      )}
    </div>
  );
}

function MemberCard({
  m,
  doc,
  players,
  canEdit,
  canHeal,
  canSetMax,
  onMax,
  onEdit,
  onHealth,
  onSortie,
}: {
  m: CrewMember;
  doc: ArpenteurDoc;
  players: Member[];
  canEdit: boolean;
  canHeal: boolean;
  /** MJ, ou joueur de ce personnage : règle les points de vie maximum. */
  canSetMax: boolean;
  onMax: (v: number) => void;
  onEdit: () => void;
  onHealth: (p: { vie?: number; fatigue?: number }) => void;
  onSortie: () => void;
}) {
  const color = loyaltyColor(m.loyalty, foldKey);
  const fit = postFit(m);
  const player =
    m.userId != null ? players.find((p) => p.userId === m.userId) : undefined;
  const hasSkills = m.combat + m.extraction + m.entretien + m.expertise > 0;
  // Maximum réglé sur la fiche (la barre suit la vie jusqu'à ce maximum).
  const vieMax = m.vieMax > 0 ? m.vieMax : m.vie;
  return (
    <article className="relative rounded-xl border border-[#5a3e1c] bg-gradient-to-br from-[#2c2117] to-[#18110b] shadow-[inset_0_1px_0_rgb(255_220_150/0.08)] p-3.5 flex flex-col gap-3 overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: color }}
      />
      <header className="flex items-start gap-3">
        <div
          className="shrink-0 w-12 h-12 rounded-full grid place-items-center font-heading font-bold text-lg"
          style={{
            background: `radial-gradient(circle at 35% 30%, ${color}55, #140e0a)`,
            border: `2px solid ${color}`,
            boxShadow: `0 0 12px ${color}40`,
          }}
        >
          {initials(m.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-heading text-base text-fantasy-text truncate">
              {m.name}
            </h4>
            {m.pc && (
              <span
                className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-fantasy-accent/20 text-fantasy-accent"
                title={player ? `Joué par ${player.displayName}` : undefined}
              >
                PJ{m.playerName ? ` · ${m.playerName}` : ''}
              </span>
            )}
          </div>
          <p className="text-xs text-fantasy-muted truncate">
            {[m.race, m.sex].filter(Boolean).join(' · ') || '—'}
          </p>
          {m.loyalty && (
            <span
              className="inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full"
              style={{ background: `${color}26`, color }}
            >
              {m.loyalty}
            </span>
          )}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="icon-btn !w-8 !h-8 text-xs"
            aria-label={`Modifier ${m.name}`}
            title="Modifier"
          >
            ✎
          </button>
        )}
      </header>

      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span
          className={`px-2.5 py-1 rounded-lg font-semibold ${fit === 'good' ? 'bg-emerald-500/15 text-emerald-300' : fit === 'bad' ? 'bg-red-500/15 text-red-300' : 'bg-fantasy-input-soft text-fantasy-text-soft'}`}
          title={
            fit === 'good'
              ? 'Poste adéquat'
              : fit === 'bad'
                ? 'Poste inadapté'
                : undefined
          }
        >
          {m.post ? canonicalPost(m.post) : 'Sans poste'}
          {fit === 'good' && ' ✓'}
          {fit === 'bad' && ' ⚠'}
        </span>
        {(m.goodPost || m.badPost) && (
          <span className="text-fantasy-muted">
            {m.goodPost && <>adéquat : {m.goodPost}</>}
            {m.goodPost && m.badPost && ' · '}
            {m.badPost && <>inadapté : {m.badPost}</>}
          </span>
        )}
      </div>

      {hasSkills && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          {SKILLS.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-md bg-black/20 px-2 py-1"
              title={`${s.label} : ${SKILL_LEVELS[m[s.id]]}`}
            >
              <dt className="text-fantasy-muted w-[4.6rem] shrink-0">
                {s.short}
              </dt>
              <dd className="flex items-center gap-1.5">
                <Pips
                  value={m[s.id]}
                  max={4}
                  color={
                    ['#8a8172', '#a39b8b', '#7fb5e6', '#9fd27a', '#e8bd4f'][
                      m[s.id]
                    ]
                  }
                  size={7}
                />
                <span className="tabular-nums text-fantasy-text-soft">
                  {m[s.id]}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      )}

      {vieMax > 0 && (
        <div className="grid gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-14 text-fantasy-muted">Vie</span>
            <Meter
              value={m.vie}
              max={vieMax}
              color={healthColor(m.vie / vieMax)}
              className="flex-1"
            />
            {canHeal ? (
              <Stepper
                value={m.vie}
                max={9999}
                onChange={(v) => onHealth({ vie: v })}
                label="vie"
              />
            ) : (
              <span className="tabular-nums w-12 text-right">
                {m.vie}/{vieMax}
              </span>
            )}
          </div>
          {canSetMax && (
            <div className="flex items-center gap-2">
              <span className="w-14 text-fantasy-muted">Vie max</span>
              <span className="flex-1 text-fantasy-muted">
                {canHeal ? `${m.vie} / ${vieMax}` : ''}
              </span>
              <Stepper
                value={m.vieMax}
                min={1}
                max={9999}
                onChange={onMax}
                label="vie maximum"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="w-14 text-fantasy-muted">Fatigue</span>
            <div className="flex-1">
              <Pips
                value={m.fatigue}
                max={doc.crew.fatigueMax}
                color="#e3a53b"
                size={6}
              />
            </div>
            {canHeal ? (
              <Stepper
                value={m.fatigue}
                max={doc.crew.fatigueMax}
                onChange={(v) => onHealth({ fatigue: v })}
                label="fatigue"
              />
            ) : (
              <span className="tabular-nums w-12 text-right">{m.fatigue}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="w-14 text-fantasy-muted">Respect</span>
            <Meter
              value={m.respect}
              max={doc.crew.respectMax}
              color="#7f8cf0"
              className="flex-1"
            />
            <span className="tabular-nums w-12 text-right">
              {m.respect}/{doc.crew.respectMax}
            </span>
          </div>
        </div>
      )}

      <footer className="flex items-center justify-between gap-2 text-xs pt-1 border-t border-fantasy-border-soft/60">
        <span className="text-fantasy-muted">
          {m.price || '—'}
          {m.coupons && m.coupons !== '0' ? ` · ${m.coupons} coupons` : ''}
        </span>
        <button
          type="button"
          disabled={!canEdit}
          onClick={onSortie}
          className={`h-7 px-2.5 rounded-md border text-[11px] ${m.sortie ? 'border-fantasy-accent text-fantasy-accent bg-fantasy-accent/10' : 'border-fantasy-border-soft text-fantasy-muted'} disabled:cursor-default`}
          aria-pressed={m.sortie}
        >
          {m.sortie ? '⚑ En sortie' : 'À bord'}
        </button>
      </footer>
      {m.note && (
        <p className="text-xs text-fantasy-text-soft italic">{m.note}</p>
      )}
    </article>
  );
}

const POST_OPTIONS = [
  { id: '', label: '—' },
  ...POSTS.map((p) => ({ id: p, label: p })),
];

function MemberEditor({
  member,
  isNew,
  isGM,
  players,
  loyalties,
  fatigueMax,
  respectMax,
  onClose,
  onSave,
  onDelete,
}: {
  member: CrewMember;
  isNew: boolean;
  isGM: boolean;
  players: Member[];
  loyalties: string[];
  fatigueMax: number;
  respectMax: number;
  onClose: () => void;
  onSave: (m: CrewMember) => void;
  onDelete: () => void;
}) {
  const [m, setM] = useState<CrewMember>(member);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (p: Partial<CrewMember>) => setM((x) => ({ ...x, ...p }));
  const postOptions = (v: string) =>
    v && !POSTS.includes(canonicalPost(v))
      ? [...POST_OPTIONS, { id: v, label: v }]
      : POST_OPTIONS;
  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={isNew ? 'Recruter un membre' : `Fiche de ${member.name}`}
      footer={
        <>
          {!isNew &&
            (confirmDelete ? (
              <Btn variant="danger" onClick={onDelete}>
                Confirmer le départ
              </Btn>
            ) : (
              <Btn
                variant="ghost"
                onClick={() => setConfirmDelete(true)}
                className="mr-auto text-red-300"
              >
                Congédier
              </Btn>
            ))}
          <Btn onClick={onClose}>Annuler</Btn>
          <Btn
            variant="primary"
            disabled={!m.name.trim()}
            onClick={() =>
              onSave({
                ...m,
                name: m.name.trim(),
                post: canonicalPost(m.post),
                goodPost: canonicalPost(m.goodPost),
                badPost: canonicalPost(m.badPost),
              })
            }
          >
            {isNew ? 'Recruter' : 'Enregistrer'}
          </Btn>
        </>
      }
    >
      <div className="grid sm:grid-cols-3 gap-3">
        <LiveField
          label="Nom"
          value={m.name}
          onChange={(v) => set({ name: v })}
          className="sm:col-span-2"
        />
        <LiveField
          label="Joueur (texte libre)"
          value={m.playerName}
          onChange={(v) => set({ playerName: v })}
        />
        <LiveField
          label="Sexe"
          value={m.sex}
          onChange={(v) => set({ sex: v })}
        />
        <LiveField
          label="Race"
          value={m.race}
          onChange={(v) => set({ race: v })}
        />
        <label className="flex flex-col gap-1 text-xs text-fantasy-muted">
          Loyauté
          <input
            className="arp-input"
            list="arp-loyalties"
            value={m.loyalty}
            onChange={(e) => set({ loyalty: e.target.value })}
          />
          <datalist id="arp-loyalties">
            {loyalties.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </label>
        {isGM && (
          <>
            <label className="flex items-center gap-2 text-sm text-fantasy-text-soft sm:col-span-1 mt-5">
              <input
                type="checkbox"
                checked={m.pc}
                onChange={(e) => set({ pc: e.target.checked })}
              />
              Personnage joueur
            </label>
            <label className="flex flex-col gap-1 text-xs text-fantasy-muted sm:col-span-2">
              Incarné par (droits selon son poste)
              <select
                className="arp-input"
                value={m.userId ?? ''}
                onChange={(e) =>
                  set({
                    userId: e.target.value
                      ? parseInt(e.target.value, 10)
                      : null,
                  })
                }
              >
                <option value="">Personne (PNJ)</option>
                {players.map((p) => (
                  <option key={p.userId} value={p.userId}>
                    {p.displayName}
                    {p.characterName ? ` (${p.characterName})` : ''}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <SelectField
          label="Poste affecté"
          value={canonicalPost(m.post)}
          options={postOptions(canonicalPost(m.post))}
          onChange={(v) => set({ post: v })}
        />
        <SelectField
          label="Poste adéquat"
          value={canonicalPost(m.goodPost)}
          options={postOptions(canonicalPost(m.goodPost))}
          onChange={(v) => set({ goodPost: v })}
        />
        <SelectField
          label="Poste inadapté"
          value={canonicalPost(m.badPost)}
          options={postOptions(canonicalPost(m.badPost))}
          onChange={(v) => set({ badPost: v })}
        />
        {SKILLS.map((s) => (
          <SelectField
            key={s.id}
            label={s.label}
            value={String(m[s.id])}
            options={SKILL_LEVELS.map((l, i) => ({ id: String(i), label: l }))}
            onChange={(v) =>
              set({ [s.id]: parseInt(v, 10) } as Partial<CrewMember>)
            }
          />
        ))}
        <LiveField
          label="Prix"
          value={m.price}
          onChange={(v) => set({ price: v })}
          placeholder="15 PC"
        />
        <LiveField
          label="Prix en coupons"
          value={m.coupons}
          onChange={(v) => set({ coupons: v })}
        />
        <LiveField
          type="number"
          label="Vie"
          value={String(m.vie)}
          onChange={(v) => set({ vie: Math.max(0, parseInt(v, 10) || 0) })}
        />
        <LiveField
          type="number"
          label="Vie maximale"
          value={String(m.vieMax)}
          onChange={(v) => set({ vieMax: Math.max(0, parseInt(v, 10) || 0) })}
        />
        <NumberField
          label={`Fatigue (max ${fatigueMax})`}
          value={m.fatigue}
          min={0}
          max={fatigueMax}
          onCommit={(v) => set({ fatigue: v })}
        />
        <NumberField
          label={`Respect (max ${respectMax})`}
          value={m.respect}
          min={0}
          max={respectMax}
          onCommit={(v) => set({ respect: v })}
        />
        <LiveField
          label="Notes"
          value={m.note}
          multiline
          onChange={(v) => set({ note: v })}
          className="sm:col-span-3"
        />
      </div>
    </Dialog>
  );
}
