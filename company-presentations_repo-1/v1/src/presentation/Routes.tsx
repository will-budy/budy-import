import { BASE_PATH } from './config';
import { AppSlide } from './AppSlide';
import { ImageSlide, SlidePage } from './Slide';
import { DECKS, deckAtPath, namespaces } from '../decks/registry';
import type { Deck, Namespace } from '../decks/registry';
import wordmark from '../assets/budy-wordmark.png';

export type Route = { kind: 'home' } | { kind: 'deck'; deck: Deck };

/** The address of the home page of this version: /v1/home. */
export const HOME_PATH = `${BASE_PATH}/home`;

/**
 * Which page a web address shows. /v1/home and /v1/ show the home page.
 * /v1/<group>/<namespace>/<deck> shows that deck. Unknown addresses show the home page.
 */
export function routeOf(pathname: string): Route {
  const p = pathname.replace(/\/+$/, '') || '/';
  const local = p.startsWith(`${BASE_PATH}/`) ? p.slice(BASE_PATH.length + 1) : '';
  const deck = deckAtPath(local);
  return deck ? { kind: 'deck', deck } : { kind: 'home' };
}

function DeckLink({ deck }: { deck: Deck }) {
  return (
    <a className="home-deck" href={deck.href}>
      <span className="home-deck-title">{deck.title}</span>
      {deck.description && <span className="home-deck-text">{deck.description}</span>}
      <span className="home-deck-path">{deck.href}</span>
    </a>
  );
}

function Section({ title, intro, items, empty }: { title: string; intro: string; items: Namespace[]; empty: string }) {
  return (
    <section className="home-section" aria-label={title}>
      <h2 className="home-section-title">{title}</h2>
      <p className="home-section-intro">{intro}</p>
      {items.length === 0 ? (
        <p className="home-empty">{empty}</p>
      ) : (
        <div className="home-groups">
          {items.map((n) => (
            <div className="home-group" key={n.id}>
              <h3 className="home-group-title">{n.title}</h3>
              {n.description && <p className="home-group-text">{n.description}</p>}
              <div className="home-decks">
                {n.decks.map((d) => (
                  <DeckLink key={d.path} deck={d} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * The home page. It lists every deck that is listed, found when the site is built (see registry.ts):
 * events first, then people. Nothing here is typed by hand.
 */
export function Home() {
  return (
    <main className="home">
      <header className="home-header">
        <img className="home-logo" src={wordmark} alt="Budy" />
        <h1 className="home-title">Presentations</h1>
        <p className="home-lead">{DECKS.filter((d) => d.listed).length} decks. Pick one to present.</p>
      </header>
      <Section
        title="Events"
        intro="Decks for a specific event. Shared by everyone."
        items={namespaces('events')}
        empty="No event decks yet."
      />
      <Section
        title="People"
        intro="Each person's own decks and drafts. Anyone can add a folder under src/decks/users/."
        items={namespaces('users')}
        empty="No personal decks yet. See AGENTS.md, section Adding decks."
      />
    </main>
  );
}

/** Shows a deck in order: pictures, with the live phone app where the deck has a live slide. */
export function DeckPage({ deck }: { deck: Deck }) {
  const { teammate, name, text } = deck.app;
  return (
    <SlidePage>
      {deck.flow.map((s) => (s === 'app' ? <AppSlide key="app" teammate={teammate} name={name} text={text} /> : <ImageSlide key={s.src} src={s.src} alt={s.alt} group={s.group} />))}
    </SlidePage>
  );
}

export function Root() {
  const route = routeOf(window.location.pathname);
  return route.kind === 'deck' ? <DeckPage deck={route.deck} /> : <Home />;
}
