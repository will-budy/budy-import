/**
 * Settings shared by every page: the base path and the phone app address.
 * The decks themselves are not listed here. Each deck is a folder under src/decks/ (see registry.ts and AGENTS.md).
 */

/**
 * Where this version of the site lives. Must match `base` in vite.config.ts (a test checks it).
 * A future version gets its own folder and its own base, for example /v2.
 */
export const BASE_PATH = '/v1';

/**
 * The address of the Budy phone app shown in the phone frame of a deck's live slide.
 * The app runs on the rep's own laptop (see README.md). `frame=off` removes the app's own phone frame.
 * `teammate=` signs in as the mock demo user and opens that teammate (needs the `demo-auto-sign-in` change in the app repository).
 */
export const DEMO_APP_BASE = 'http://localhost:8081/';
export type DemoTeammate = 'megan' | 'claire';
export const demoAppUrl = (teammate: DemoTeammate) => `${DEMO_APP_BASE}?frame=off&teammate=${teammate}`;

export interface ImageSlideInfo {
  src: string;
  alt: string;
  /** Slides with the same group are build steps of one slide: going between them shows the next picture at once, with no scroll. */
  group?: string;
}

/** One place in a deck: a picture, or the live phone app. */
export type DeckSlide = ImageSlideInfo | 'app';
