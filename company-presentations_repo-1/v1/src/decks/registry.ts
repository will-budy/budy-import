/**
 * The deck registry: every deck is a folder under src/decks/, found when the site is built. There is no list to edit.
 *
 *   src/decks/events/<event>/<deck>/        decks for an event, for example events/slif-nov-2026/sales
 *   src/decks/users/<name>/<deck>/          a person's own decks and drafts, for example users/alex/pitch
 *
 * A deck folder holds `deck.json` (see DeckManifest) and the slide pictures `01.png`, `02.png`, ... named by place in the deck.
 * The address of a deck is its folder path under /v1/: /v1/events/slif-nov-2026/sales. The home page /v1/home lists all decks.
 * Optional `event.json` ({ title, description }) in an event folder and `user.json` ({ name }) in a user folder set the display names.
 */
import { BASE_PATH } from '../presentation/config';
import type { DeckSlide, DemoTeammate } from '../presentation/config';

export type DeckGroup = 'events' | 'users';

/** What a deck.json file holds. */
export interface DeckManifest {
  title: string;
  description?: string;
  /** Position on the home page, smallest first. Default 100. */
  order?: number;
  /** false: the deck has an address but no link on the home page. Default true. */
  listed?: boolean;
  /** The live phone slide: the teammate that is signed in, and the words on the slide. */
  app?: { teammate: DemoTeammate; name: string; text: string };
  /** The slides in order. A picture slide has `alt` (and `group` for build steps). `{ "live": true }` is the live phone slide. */
  slides: ({ alt: string; group?: string; live?: undefined } | { live: true })[];
}

export interface Deck {
  group: DeckGroup;
  namespace: string;
  slug: string;
  /** The folder path under src/decks, for example "events/slif-nov-2026/sales". */
  path: string;
  /** The address of the deck, for example "/v1/events/slif-nov-2026/sales". */
  href: string;
  title: string;
  description: string;
  listed: boolean;
  order: number;
  flow: readonly DeckSlide[];
  app: { teammate: DemoTeammate; name: string; text: string };
}

export interface Namespace {
  group: DeckGroup;
  id: string;
  title: string;
  description: string;
  decks: Deck[];
}

const manifests = import.meta.glob<DeckManifest>('./*/*/*/deck.json', { eager: true, import: 'default' });
const pictures = import.meta.glob<string>('./*/*/*/*.png', { eager: true, import: 'default' });
const eventInfo = import.meta.glob<{ title?: string; description?: string }>('./events/*/event.json', { eager: true, import: 'default' });
const userInfo = import.meta.glob<{ name?: string }>('./users/*/user.json', { eager: true, import: 'default' });

const DEFAULT_APP = { teammate: 'claire', name: 'Claire', text: '' } as const;

/** "mary-ann" gives "Mary Ann". */
const titleCase = (slug: string) => slug.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

/** Builds one deck from its manifest. `file` is the picture of a place: 01.png for the first place. */
export function buildDeck(group: DeckGroup, namespace: string, slug: string, manifest: DeckManifest, picture: (file: string) => string | undefined): Deck {
  const path = `${group}/${namespace}/${slug}`;
  const flow = manifest.slides.map((s, i): DeckSlide => {
    if (s.live) return 'app';
    const file = `${String(i + 1).padStart(2, '0')}.png`;
    return { src: picture(file) as string, alt: `Slide ${i + 1}: ${s.alt}`, group: s.group };
  });
  return {
    group,
    namespace,
    slug,
    path,
    href: `${BASE_PATH}/${path}`,
    title: manifest.title,
    description: manifest.description ?? '',
    listed: manifest.listed ?? true,
    order: manifest.order ?? 100,
    flow,
    app: manifest.app ?? DEFAULT_APP,
  };
}

export const DECKS: readonly Deck[] = Object.entries(manifests)
  .flatMap(([file, manifest]) => {
    const m = file.match(/^\.\/(events|users)\/([^/]+)\/([^/]+)\/deck\.json$/);
    if (!m) return [];
    const [, group, namespace, slug] = m as unknown as [string, DeckGroup, string, string];
    const folder = `./${group}/${namespace}/${slug}/`;
    return [buildDeck(group, namespace, slug, manifest, (f) => pictures[folder + f])];
  })
  .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

/** The deck at a folder path such as "events/slif-nov-2026/sales", or undefined. */
export const deckAtPath = (path: string) => DECKS.find((d) => d.path === path);

/** The events and the people, each with their decks. Pass `listedOnly` to leave out decks that have no home page link. */
export function namespaces(group: DeckGroup, listedOnly = true): Namespace[] {
  const ids = [...new Set(DECKS.filter((d) => d.group === group).map((d) => d.namespace))].sort();
  return ids
    .map((id) => {
      const decks = DECKS.filter((d) => d.group === group && d.namespace === id && (!listedOnly || d.listed));
      const event = group === 'events' ? eventInfo[`./events/${id}/event.json`] : undefined;
      const user = group === 'users' ? userInfo[`./users/${id}/user.json`] : undefined;
      return {
        group,
        id,
        title: event?.title ?? user?.name ?? titleCase(id),
        description: event?.description ?? '',
        decks,
      };
    })
    .filter((n) => n.decks.length > 0);
}
