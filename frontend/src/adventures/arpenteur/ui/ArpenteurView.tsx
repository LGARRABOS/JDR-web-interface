import { useEffect, useRef, useState, type ReactNode } from 'react';
import { spotById, spotsOf } from '../model/spots';
import { ArpenteurAPI } from '@/core/api/client';
import { nodeName, regionById, UNKNOWN } from '../model/keld';
import { crewPlaces, postsOf } from '../model/logic';
import { useArpenteur } from '../model/useArpenteur';
import type { ArpenteurPayload, Build } from '../model/types';
import type { GameStore } from '@/core/realtime/gameStore';
import type { Member } from '@/core/realtime/protocol';
import { AtelierPanel } from './AtelierPanel';
import { CombatPanel } from './CombatPanel';
import { CrewPanel } from './CrewPanel';
import { InventoryPanel } from './InventoryPanel';
import { MapPanel } from './MapPanel';
import { OverviewPanel } from './OverviewPanel';
import { SettingsPanel } from './SettingsPanel';
import type { CutawayTarget } from './ShipCutaway';
import { ShipScene3D } from './ShipScene3D';
import { Cog, healthColor } from './ui';
import { useTravel } from './useTravel';
import { WorldMap3D } from './WorldMap3D';

type Tab =
  | 'navire'
  | 'equipage'
  | 'combat'
  | 'cale'
  | 'carte'
  | 'atelier'
  | 'reglages';

export interface ArpenteurViewProps {
  gameId: number;
  isGM: boolean;
  userId: number;
  /** Joueurs de la partie (hors MJ), pour relier les personnages. */
  players: Member[];
  payload: ArpenteurPayload | null;
  store: GameStore;
  /** Panneau latéral ouvert (on lui laisse la place sur grand écran). */
  panelOpen: boolean;
  onRoll: (expression: string) => void;
}

/** Page de l'arpenteur : la scène animée puis les onglets de gestion. */
export function ArpenteurView({
  gameId,
  isGM,
  userId,
  players,
  payload,
  store,
  panelOpen,
  onRoll,
}: ArpenteurViewProps) {
  const { doc, rights, update, error, clearError, setError } = useArpenteur(
    gameId,
    payload,
    store,
    userId,
    isGM
  );
  const [tab, setTab] = useState<Tab>('navire');
  // Onglets déjà ouverts : ils restent montés, cachés, pour un retour immédiat.
  const [opened, setOpened] = useState<Set<Tab>>(() => new Set([tab]));
  if (!opened.has(tab)) setOpened(new Set(opened).add(tab));
  const pane = (id: Tab, node: ReactNode) =>
    opened.has(id) ? (
      <Pane key={id} active={tab === id}>
        {node}
      </Pane>
    ) : null;
  const [holdSide, setHoldSide] = useState<'hold' | 'entrepot'>('hold');
  const [view, setView] = useState<'profil' | 'coupe'>('profil');
  const [preview, setPreview] = useState<{
    id: string;
    build: Build;
    label: string;
  } | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  // Plein écran : la scène occupe tout l'écran, avec des raccourcis en bas
  // (carte des déserts, points d'intérêt, coupe). La carte s'ouvre après un fondu.
  const [full, setFull] = useState(false);
  const [world, setWorld] = useState<null | 'world' | 'zone'>(null);
  const [fade, setFade] = useState(false);
  const travelNow = useTravel(doc?.map.travel ?? null);
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFull(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement && !world)
        setFull(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full, world]);
  const enterFull = () => {
    setFull(true);
    // Vrai plein écran du navigateur quand il est permis ; sinon la scène
    // couvre simplement la page.
    document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const leaveFull = () => {
    setFull(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
  const openWorld = (w: 'world' | 'zone') => {
    setFade(true);
    setTimeout(() => {
      setWorld(w);
      setTimeout(() => setFade(false), 60);
    }, 380);
  };

  // Mode activé en cours de partie : l'instantané n'avait pas encore l'arpenteur.
  useEffect(() => {
    if (payload) return;
    ArpenteurAPI.get(gameId)
      .then(({ data }) => store.setArpenteurLocally(data as ArpenteurPayload))
      .catch((e) =>
        setError(e?.response?.data?.message ?? 'Arpenteur indisponible')
      );
  }, [payload, gameId, store, setError]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(clearError, 5000);
    return () => clearTimeout(t);
  }, [error, clearError]);

  if (!doc || !rights) {
    return (
      <div className="absolute inset-0 grid place-items-center text-fantasy-muted">
        {error ?? 'Préparation de l’arpenteur…'}
      </div>
    );
  }

  const goTo = (target: CutawayTarget) => {
    const map: Record<CutawayTarget, Tab> = {
      crew: 'equipage',
      combat: 'combat',
      hold: 'cale',
      entrepot: 'cale',
      map: 'carte',
      atelier: 'atelier',
    };
    if (target === 'hold' || target === 'entrepot') setHoldSide(target);
    setTab(map[target]);
    requestAnimationFrame(() =>
      tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    );
  };

  const myPosts = postsOf(doc, userId);
  const sector = doc.map.sector;
  const sectorLabel = sector
    ? `${nodeName(sector, doc.map.sectorNames)}${regionById(sector) && doc.map.sectorNames[sector] ? ` · ${sector}` : ''}`
    : 'Position inconnue';
  const spotHere = spotById(doc.map.spot);
  const shownBuild = preview?.build ?? doc.build;
  const constRatio =
    doc.combat.constitution / Math.max(1, doc.combat.constitutionMax);

  const chips = (
    <>
      <Chip label="Coque">
        <span style={{ color: healthColor(constRatio) }}>
          {doc.combat.constitution}/{doc.combat.constitutionMax}
        </span>
      </Chip>
      <Chip label="Coupons">{doc.expedition.coupons}</Chip>
      <Chip label="Équipage">
        {crewPlaces(doc.crew.members)}/{doc.crew.capacity}
      </Chip>
      <Chip label="Secteur">{sectorLabel}</Chip>
      {spotHere && <Chip label="Point d'intérêt">{spotHere.name}</Chip>}
      {doc.pending && <Chip label="Chantier">{doc.pending.label}</Chip>}
      {myPosts.length > 0 && <Chip label="Vous">{myPosts.join(', ')}</Chip>}
    </>
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: 'navire', label: 'Navire' },
    { id: 'equipage', label: 'Équipage' },
    { id: 'combat', label: 'Combat' },
    { id: 'cale', label: 'Cale & entrepôt' },
    { id: 'carte', label: 'Carte' },
    { id: 'atelier', label: 'Atelier' },
    ...(isGM ? [{ id: 'reglages' as Tab, label: 'Réglages' }] : []),
  ];

  return (
    <div
      className={`absolute inset-0 overflow-y-auto overscroll-contain pt-[118px] sm:pt-[88px] pb-28 px-2 sm:px-4 ${panelOpen ? 'sm:pr-[392px]' : 'sm:pr-4'}`}
    >
      <div className="mx-auto max-w-[1400px] flex flex-col gap-4">
        <div className="arp-bezel">
          <Cog
            size={46}
            className="absolute -left-4 -top-4 z-10 hidden sm:block"
          />
          <Cog
            size={34}
            teeth={9}
            className="absolute left-7 -top-4 z-10 hidden sm:block"
          />
          <Cog
            size={46}
            className="absolute -right-4 -bottom-4 z-10 hidden sm:block"
          />
          <Cog
            size={30}
            teeth={8}
            className="absolute right-8 -bottom-4 z-10 hidden sm:block"
          />
          <section
            className={
              full
                ? 'fixed inset-0 z-[45] w-full h-full overflow-hidden bg-black'
                : 'relative w-full rounded-3xl overflow-hidden border border-fantasy-border-soft shadow-2xl bg-black aspect-[4/3] sm:aspect-[5/2] max-h-[62vh] min-h-[230px]'
            }
          >
            <ShipScene3D
              doc={doc}
              build={shownBuild}
              view={view}
              scaffolding={!preview && !!doc.pending}
              onRoom={goTo}
              onMood={
                isGM
                  ? (mood) =>
                      update(
                        'map',
                        { ...doc.map, mood },
                        {
                          log:
                            mood === 'night'
                              ? 'La nuit tombe'
                              : 'Le jour se lève',
                          immediate: true,
                        }
                      )
                  : undefined
              }
              className="absolute inset-0 w-full h-full"
            />

            <div
              className={`absolute top-3 left-3 sm:top-5 sm:left-5 arp-nameplate rounded-lg px-4 sm:px-6 py-2 sm:py-3 max-w-[62%] pointer-events-none transition-opacity ${view === 'coupe' ? 'opacity-0' : ''}`}
            >
              <p className="font-heading text-[10px] sm:text-[11px] uppercase tracking-[0.3em] opacity-80">
                Arpenteur {doc.number || ''}
              </p>
              <h1 className="arp-np-title font-heading text-xl sm:text-3xl leading-tight truncate">
                {doc.name}
              </h1>
              {doc.formerOwner && (
                <p className="hidden sm:block text-xs italic opacity-80">
                  Anciennement sous le contrôle de {doc.formerOwner}
                </p>
              )}
            </div>

            <div className="absolute z-[5] top-3 right-3 sm:top-5 sm:right-5 arp-lever rounded-full p-1 flex">
              {(['profil', 'coupe'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={`h-8 px-3.5 rounded-full text-xs font-heading tracking-wide ${view === v ? 'arp-lever-on font-bold' : 'text-[#cdb68c] hover:bg-white/10'}`}
                >
                  {v === 'profil' ? 'Profil' : 'Coupe'}
                </button>
              ))}
              <button
                type="button"
                onClick={full ? leaveFull : enterFull}
                className="h-8 w-8 ml-0.5 rounded-full text-[#cdb68c] hover:bg-white/10 text-base leading-none flex items-center justify-center"
                title={full ? 'Quitter le plein écran (Échap)' : 'Plein écran'}
                aria-label={full ? 'Quitter le plein écran' : 'Plein écran'}
                aria-pressed={full}
              >
                {full ? '✕' : '⛶'}
              </button>
            </div>

            {preview ? (
              <div className="absolute z-[5] bottom-3 left-1/2 -translate-x-1/2 arp-plate rounded-xl pl-4 pr-1.5 py-1.5 flex items-center gap-3 text-sm max-w-[94%]">
                <span className="truncate">
                  <span className="text-fantasy-muted">Évolution :</span>{' '}
                  {preview.label}
                </span>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="h-8 px-3 rounded-lg arp-btn-brass text-xs whitespace-nowrap"
                >
                  Revenir au présent
                </button>
              </div>
            ) : view === 'coupe' ? (
              <p className="absolute z-[5] bottom-3 left-1/2 -translate-x-1/2 arp-plate rounded-xl px-3 py-1.5 text-xs text-fantasy-text-soft pointer-events-none">
                Cliquez sur une salle pour la gérer
              </p>
            ) : (
              <div
                className={`hidden sm:flex absolute left-5 right-5 flex-wrap gap-2 pointer-events-none ${full ? 'bottom-24' : 'bottom-5'}`}
              >
                {chips}
              </div>
            )}
            {full && (
              <nav
                className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[6] arp-plate rounded-2xl p-1.5 flex items-center gap-1.5 max-w-[96%] overflow-x-auto"
                aria-label="Raccourcis"
              >
                <Shortcut
                  icon="🗺"
                  label="Carte des déserts"
                  onClick={() => openWorld('world')}
                />
                {!travelNow &&
                  spotsOf(doc.map.sector || UNKNOWN).length > 0 && (
                    <Shortcut
                      icon="⚑"
                      label="Points d'intérêt"
                      onClick={() => openWorld('zone')}
                    />
                  )}
                <Shortcut
                  icon={view === 'coupe' ? '⛵' : '▤'}
                  label={view === 'coupe' ? 'Profil' : 'Coupe'}
                  onClick={() => setView(view === 'coupe' ? 'profil' : 'coupe')}
                />
                <Shortcut icon="✕" label="Quitter" onClick={leaveFull} />
              </nav>
            )}
            <div
              className={`pointer-events-none absolute inset-0 z-[60] bg-black transition-opacity duration-[380ms] ${fade ? 'opacity-100' : 'opacity-0'}`}
              aria-hidden
            />
          </section>
          {world && (
            <WorldMap3D
              doc={doc}
              can={rights.map}
              isGM={isGM}
              save={(next, log) =>
                update('map', next, { log, immediate: !!log })
              }
              startInZone={world === 'zone'}
              onClose={() => setWorld(null)}
            />
          )}
        </div>
        {!preview && view === 'profil' && (
          <div className="sm:hidden flex flex-wrap gap-1.5 -mt-1">{chips}</div>
        )}

        <div
          ref={tabsRef}
          role="tablist"
          className="arp-tabbar flex gap-2 overflow-x-auto scroll-mt-24"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className="arp-tab"
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Un onglet déjà ouvert reste monté (caché) : y revenir est immédiat. */}
        <div>
          {pane(
            'navire',
            <OverviewPanel
              doc={doc}
              rights={rights}
              update={update}
              previewId={preview?.id ?? null}
              onPreview={(id, build, label) =>
                setPreview(
                  id && build ? { id, build, label: label ?? '' } : null
                )
              }
            />
          )}
          {pane(
            'equipage',
            <CrewPanel
              doc={doc}
              rights={rights}
              update={update}
              players={players}
              isGM={isGM}
              userId={userId}
            />
          )}
          {pane(
            'combat',
            <CombatPanel
              doc={doc}
              rights={rights}
              update={update}
              onRoll={onRoll}
            />
          )}
          {pane(
            'cale',
            <InventoryPanel
              key={holdSide}
              doc={doc}
              rights={rights}
              update={update}
              initial={holdSide}
              isGM={isGM}
            />
          )}
          {pane(
            'carte',
            <MapPanel
              gameId={gameId}
              doc={doc}
              rights={rights}
              update={update}
              isGM={isGM}
              store={store}
              onError={setError}
            />
          )}
          {pane(
            'atelier',
            <AtelierPanel
              doc={doc}
              rights={rights}
              update={update}
              isGM={isGM}
            />
          )}
          {isGM &&
            pane(
              'reglages',
              <SettingsPanel
                gameId={gameId}
                doc={doc}
                update={update}
                store={store}
                onError={setError}
              />
            )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 glass rounded-xl px-4 py-2 text-sm text-red-300 max-w-[92vw]"
        >
          {error}
        </div>
      )}
    </div>
  );
}

function Shortcut({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-11 px-3 sm:px-4 rounded-xl flex items-center gap-2 text-sm font-heading text-[#f3dfb4] hover:bg-white/10 whitespace-nowrap"
    >
      <span aria-hidden className="text-lg leading-none">
        {icon}
      </span>
      {label}
    </button>
  );
}

function Chip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span className="arp-plate rounded-full px-3.5 py-1.5 text-xs sm:text-sm flex items-baseline gap-1.5 max-w-full">
      <span className="text-[10px] uppercase tracking-[0.16em] text-[#c9a466]">
        {label}
      </span>
      <span className="text-fantasy-text font-semibold truncate">
        {children}
      </span>
    </span>
  );
}

/**
 * Onglet gardé monté. Caché, il garde son dernier rendu : React ne le
 * recalcule pas à chaque changement du navire, seulement quand on y revient.
 */
function Pane({ active, children }: { active: boolean; children: ReactNode }) {
  const last = useRef(children);
  if (active) last.current = children;
  return (
    <div hidden={!active} className="animate-[fadeIn_.25s_ease-out]">
      {last.current}
    </div>
  );
}
