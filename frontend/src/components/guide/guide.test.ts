import { describe, expect, it } from 'vitest';
import { linkTargets, parseGuide, parseInline } from './guideMarkup';
import {
  GUIDE_ARTICLES,
  GUIDE_CHAPTERS,
  QUICK_START,
  getArticle,
  neighbours,
  searchGuide,
} from '../../data/guide';

describe('format des articles', () => {
  it('reconnaît gras et liens', () => {
    expect(
      parseInline('Voir **ceci** et [[regle|la règle]] ou [[des]].')
    ).toEqual([
      { kind: 'text', text: 'Voir ' },
      { kind: 'bold', text: 'ceci' },
      { kind: 'text', text: ' et ' },
      { kind: 'link', id: 'regle', text: 'la règle' },
      { kind: 'text', text: ' ou ' },
      { kind: 'link', id: 'des', text: 'des' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('découpe titres, étapes, listes, astuces et paragraphes', () => {
    const blocks = parseGuide(
      '## Titre\n1. un\n2. deux\n\n- a\n- b\nTexte\nsuite\n\n> astuce'
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      'heading',
      'steps',
      'bullets',
      'paragraph',
      'tip',
    ]);
  });
});

describe('contenu du guide', () => {
  it('chaque article a un chapitre connu et un identifiant unique', () => {
    const chapters = new Set(GUIDE_CHAPTERS.map((c) => c.id));
    const ids = new Set<string>();
    for (const a of GUIDE_ARTICLES) {
      expect(chapters.has(a.chapter)).toBe(true);
      expect(ids.has(a.id)).toBe(false);
      ids.add(a.id);
    }
  });

  it('tous les liens internes mènent à un article', () => {
    for (const a of GUIDE_ARTICLES) {
      for (const id of [...linkTargets(a.body), ...(a.related ?? [])]) {
        expect(getArticle(id), `${a.id} → ${id}`).toBeTruthy();
      }
    }
    for (const id of [...QUICK_START.joueur, ...QUICK_START.mj]) {
      expect(getArticle(id), id).toBeTruthy();
    }
  });

  it('la recherche ignore accents et majuscules, et filtre par rôle', () => {
    expect(searchGuide('REGLE')[0].id).toBe('regle');
    expect(searchGuide('brouillard').some((a) => a.id === 'brouillard')).toBe(
      true
    );
    const joueur = searchGuide('', 'joueur');
    expect(joueur.every((a) => a.audience !== 'mj')).toBe(true);
    expect(searchGuide('mot introuvable zzz')).toHaveLength(0);
  });

  it('donne les articles voisins', () => {
    const first = GUIDE_ARTICLES[0].id;
    expect(neighbours(first).prev).toBeUndefined();
    expect(neighbours(first).next?.id).toBe(GUIDE_ARTICLES[1].id);
  });
});
