import { useRef, useState } from 'react';
import { ArpenteurAPI } from '../../api/client';
import { POSTS, SECTIONS } from '../../arpenteur/catalog';
import { shipSection } from '../../arpenteur/logic';
import type { UpdateFn } from '../../arpenteur/useArpenteur';
import type {
  ArpenteurDoc,
  ArpenteurPayload,
  ImportSummary,
  Perm,
} from '../../arpenteur/types';
import type { GameStore } from '../../realtime/gameStore';
import { getErrorMessage } from '../../utils/errorMessage';
import { Btn, Card, NumberField, TextField } from './ui';

interface Props {
  gameId: number;
  doc: ArpenteurDoc;
  update: UpdateFn;
  store: GameStore;
  onError: (msg: string) => void;
}

type Cell = 'none' | 'post' | 'fallback';

/** Réglages du MJ : identité du navire, import du classeur, droits par poste. */
export function SettingsPanel({ gameId, doc, update, store, onError }: Props) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const importSheet = async (f: File) => {
    setBusy(true);
    setSummary(null);
    try {
      const { data } = await ArpenteurAPI.importSheet(gameId, f);
      const res = data as ArpenteurPayload & { summary: ImportSummary };
      store.setArpenteurLocally({
        arpenteur: res.arpenteur,
        version: res.version,
      });
      setSummary(res.summary);
    } catch (e) {
      onError(getErrorMessage(e, 'Import impossible'));
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };

  const cell = (perm: Perm, post: string): Cell =>
    perm.posts.includes(post)
      ? 'post'
      : perm.fallback.includes(post)
        ? 'fallback'
        : 'none';
  const cycle = (section: string, post: string) => {
    const perm = doc.permissions[section] ?? { posts: [], fallback: [] };
    const cur = cell(perm, post);
    const next: Cell =
      cur === 'none' ? 'post' : cur === 'post' ? 'fallback' : 'none';
    const posts = perm.posts.filter((p) => p !== post);
    const fallback = perm.fallback.filter((p) => p !== post);
    if (next === 'post') posts.push(post);
    if (next === 'fallback') fallback.push(post);
    update('permissions', {
      ...doc.permissions,
      [section]: { posts, fallback },
    });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title="Identité du navire">
        <div className="grid grid-cols-3 gap-3">
          <TextField
            label="Nom"
            value={doc.name}
            onCommit={(v) =>
              update(
                'ship',
                { ...shipSection(doc), name: v },
                { log: `Le navire s'appelle désormais « ${v} »` }
              )
            }
            className="col-span-2"
          />
          <NumberField
            label="Numéro"
            value={doc.number}
            min={0}
            max={999}
            onCommit={(v) => update('ship', { ...shipSection(doc), number: v })}
          />
          <TextField
            label="Ancien propriétaire"
            value={doc.formerOwner}
            placeholder="Grisha Rouvaris"
            onCommit={(v) =>
              update('ship', { ...shipSection(doc), formerOwner: v })
            }
            className="col-span-3"
          />
        </div>
      </Card>

      <Card
        title="Importer le classeur"
        subtitle="Excel (.xlsx), LibreOffice (.ods) ou CSV"
      >
        <p className="text-sm text-fantasy-text-soft">
          Les tableaux reconnus remplacent ceux de l’arpenteur : équipage
          (colonnes « Nom … Poste affecté »), combat (« Constitution », « Canons
          A1 »…), cale et cave (« Type, Nom, Effet, Poids… »), expédition et
          coupons. Les feuilles de sauvegarde sont ignorées ; un personnage noté
          « Malrik (Luc) » est relié au joueur Luc s’il est dans la partie.
        </p>
        <input
          ref={file}
          type="file"
          accept=".xlsx,.ods,.csv"
          className="hidden"
          onChange={(e) =>
            e.target.files?.[0] && importSheet(e.target.files[0])
          }
        />
        <Btn
          variant="primary"
          className="mt-3"
          disabled={busy}
          onClick={() => file.current?.click()}
        >
          {busy ? 'Import…' : 'Choisir le classeur'}
        </Btn>
        {summary && (
          <p className="mt-3 text-sm text-emerald-300">
            Importé : {summary.crew} membre{summary.crew > 1 ? 's' : ''}{' '}
            d’équipage, {summary.hold} objet{summary.hold > 1 ? 's' : ''} en
            cale, {summary.cave} dans la cave
            {summary.combat ? ', feuille de combat' : ''}
            {summary.expedition ? ', expédition' : ''}.
            {summary.ignored.length > 0 && (
              <span className="block text-fantasy-muted">
                Feuilles ignorées : {summary.ignored.join(', ')}.
              </span>
            )}
          </p>
        )}
      </Card>

      <Card
        title="Droits par poste"
        subtitle="Cliquez une case : ✓ le poste modifie · ↺ il prend la relève si aucun joueur n’occupe un poste ✓ · le MJ peut toujours tout modifier"
        className="xl:col-span-2"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="text-left font-normal text-xs text-fantasy-muted pb-2 pr-3">
                  Partie de l’arpenteur
                </th>
                {POSTS.map((p) => (
                  <th
                    key={p}
                    className="font-normal text-xs text-fantasy-muted pb-2 px-1 whitespace-nowrap"
                  >
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map((s) => {
                const perm = doc.permissions[s.id] ?? {
                  posts: [],
                  fallback: [],
                };
                return (
                  <tr
                    key={s.id}
                    className="border-t border-fantasy-border-soft"
                  >
                    <td className="py-1.5 pr-3">
                      <span className="text-fantasy-text">{s.label}</span>
                      <span className="block text-[11px] text-fantasy-muted">
                        {s.hint}
                      </span>
                    </td>
                    {POSTS.map((p) => {
                      const c = cell(perm, p);
                      return (
                        <td key={p} className="text-center px-1">
                          <button
                            type="button"
                            onClick={() => cycle(s.id, p)}
                            aria-label={`${s.label} — ${p} : ${c === 'post' ? 'oui' : c === 'fallback' ? 'relève' : 'non'}`}
                            className={`w-9 h-9 rounded-lg border text-base ${c === 'post' ? 'bg-emerald-600/25 border-emerald-500/60 text-emerald-300' : c === 'fallback' ? 'bg-amber-500/15 border-amber-500/50 text-amber-300' : 'border-fantasy-border-soft text-fantasy-muted/40 hover:bg-black/20'}`}
                          >
                            {c === 'post' ? '✓' : c === 'fallback' ? '↺' : '·'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-fantasy-muted mt-3">
          Un joueur obtient les droits de son poste quand son personnage est
          relié à lui dans la fiche de l’équipage (« Incarné par »).
        </p>
      </Card>

      <Card
        title="Repartir de zéro"
        subtitle="Un arpenteur neuf, sans équipage ni cargaison"
        className="xl:col-span-2"
      >
        {confirmReset ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-red-300">
              Tout sera effacé (construction, équipage, cale, cave, carte,
              journal).
            </span>
            <Btn
              variant="danger"
              onClick={async () => {
                try {
                  const { data } = await ArpenteurAPI.reset(gameId);
                  store.setArpenteurLocally(data as ArpenteurPayload);
                } catch (e) {
                  onError(getErrorMessage(e, 'Réinitialisation impossible'));
                }
                setConfirmReset(false);
              }}
            >
              Confirmer
            </Btn>
            <Btn variant="ghost" onClick={() => setConfirmReset(false)}>
              Annuler
            </Btn>
          </div>
        ) : (
          <Btn
            variant="ghost"
            className="text-red-300"
            onClick={() => setConfirmReset(true)}
          >
            Réinitialiser l’arpenteur
          </Btn>
        )}
      </Card>
    </div>
  );
}
