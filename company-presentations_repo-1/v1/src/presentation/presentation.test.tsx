// @vitest-environment jsdom
/** The home page, the decks under /v1/, slide order (the live phone slide), navigation, and no saving of anything. */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DeckPage, HOME_PATH, Home, routeOf } from './Routes';
import { BASE_PATH, demoAppUrl } from './config';
import type { DeckSlide } from './config';
import { DECKS, buildDeck, deckAtPath, namespaces } from '../decks/registry';
import type { Deck, DeckManifest } from '../decks/registry';

const scrollIntoView = vi.fn();
beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const deck = (path: string): Deck => {
  const d = deckAtPath(path);
  if (!d) throw new Error(`No deck at ${path}`);
  return d;
};
const ops = deck('events/slif-nov-2026/ops');
const sales = deck('events/slif-nov-2026/sales');
const integrated = deck('events/slif-nov-2026/integrated');

/** Every section must be the picture named in the flow, or the live app where the flow says 'app'. */
function expectOrder(container: HTMLElement, flow: readonly DeckSlide[]) {
  const sections = Array.from(container.querySelectorAll('section.slide'));
  expect(sections).toHaveLength(flow.length);
  flow.forEach((s, i) => {
    if (s === 'app') expect(sections[i]).toHaveAttribute('aria-label', 'Live demo');
    else expect(sections[i].querySelector('img')).toHaveAttribute('alt', s.alt);
  });
}

describe('routes', () => {
  it('uses the same base path as the build', () => {
    const viteConfig = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');
    expect(viteConfig).toContain(`base: '${BASE_PATH}/'`);
    expect(viteConfig).toContain(`outDir: 'dist${BASE_PATH}'`);
  });
  it('the home page is /v1/home and /v1/', () => {
    expect(HOME_PATH).toBe('/v1/home');
    for (const p of ['/v1', '/v1/', '/v1/home', '/v1/home/']) expect(routeOf(p).kind).toBe('home');
  });
  it('a deck is its folder path under /v1/', () => {
    const r = routeOf('/v1/events/slif-nov-2026/sales/');
    expect(r.kind).toBe('deck');
    expect(r.kind === 'deck' && r.deck.path).toBe('events/slif-nov-2026/sales');
    expect(sales.href).toBe('/v1/events/slif-nov-2026/sales');
  });
  it('pages only exist under /v1/, and unknown addresses show the home page', () => {
    for (const p of ['/', '/sales', '/v1/sales', '/v1/events/slif-nov-2026/nope', '/v1/events/slif-nov-2026', '/v1ops', '/v1/users/nobody/deck']) {
      expect(routeOf(p).kind).toBe('home');
    }
  });
});

describe('registry', () => {
  it('finds the three event decks in folders, in order', () => {
    expect(DECKS.map((d) => d.path)).toEqual(expect.arrayContaining(['events/slif-nov-2026/ops', 'events/slif-nov-2026/sales', 'events/slif-nov-2026/integrated']));
    const listed = namespaces('events')[0].decks.map((d) => d.slug);
    expect(listed).toEqual(['ops', 'sales']);
  });
  it('every deck has exactly one live slide and a picture for every other slide', () => {
    for (const d of DECKS) {
      expect(d.flow.filter((s) => s === 'app')).toHaveLength(1);
      d.flow.forEach((s) => s !== 'app' && expect(s.src, `${d.path} ${s.alt}`).toBeTruthy());
    }
  });
  it('every deck path is a lower-case folder path of three parts', () => {
    for (const d of DECKS) expect(d.path).toMatch(/^(events|users)\/[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/);
  });
  it('builds a deck from a manifest: pictures are named by place, the live slide takes a place', () => {
    const manifest: DeckManifest = { title: 'Pitch', slides: [{ alt: 'One' }, { live: true }, { alt: 'Three', group: 'g' }] };
    const d = buildDeck('users', 'alex', 'pitch', manifest, (f) => `pic:${f}`);
    expect(d.href).toBe('/v1/users/alex/pitch');
    expect(d.listed).toBe(true);
    expect(d.flow).toEqual([{ src: 'pic:01.png', alt: 'Slide 1: One', group: undefined }, 'app', { src: 'pic:03.png', alt: 'Slide 3: Three', group: 'g' }]);
  });
});

describe('home page', () => {
  it('lists the listed decks of the events as links to their addresses', () => {
    render(<Home />);
    const events = screen.getByRole('region', { name: 'Events' });
    expect(within(events).getByRole('link', { name: /Sales/ })).toHaveAttribute('href', '/v1/events/slif-nov-2026/sales');
    expect(within(events).getByRole('link', { name: /Ops/ })).toHaveAttribute('href', '/v1/events/slif-nov-2026/ops');
    expect(within(events).getByText('SLIF, November 2026')).toBeInTheDocument();
  });
  it('has a People section, with an empty message when nobody has a deck yet', () => {
    render(<Home />);
    const people = screen.getByRole('region', { name: 'People' });
    if (namespaces('users').length === 0) expect(within(people).getByText(/No personal decks yet/)).toBeInTheDocument();
  });
  it('does not link a deck that is not listed', () => {
    render(<Home />);
    expect(screen.queryByRole('link', { name: /integrated/i })).toBeNull();
  });
});

describe('the Ops deck', () => {
  it('shows the 12 visible slides of the care deck, with the live app as slide 7', () => {
    const { container } = render(<DeckPage deck={ops} />);
    expect(ops.flow).toHaveLength(12);
    expect(ops.flow[6]).toBe('app');
    expectOrder(container, ops.flow);
  });
  it('opens the phone frame already signed in as Megan', () => {
    const { container } = render(<DeckPage deck={ops} />);
    expect(container.querySelector('iframe')).toHaveAttribute('src', demoAppUrl('megan'));
    expect(screen.getByText('Meet Megan.')).toBeInTheDocument();
  });
  it('has no calculator', () => {
    const { container } = render(<DeckPage deck={ops} />);
    expect(container.querySelector('input')).toBeNull();
  });
});

describe('the Sales deck', () => {
  it('shows the 13 visible slides of the sales deck, with the live app as slide 7', () => {
    const { container } = render(<DeckPage deck={sales} />);
    expect(sales.flow).toHaveLength(13);
    expect(sales.flow[6]).toBe('app');
    expectOrder(container, sales.flow);
  });
  it('opens the phone frame already signed in as Claire', () => {
    const { container } = render(<DeckPage deck={sales} />);
    expect(container.querySelector('iframe')).toHaveAttribute('src', demoAppUrl('claire'));
    expect(screen.getByText('Meet Claire.')).toBeInTheDocument();
  });
  it('has no calculator', () => {
    const { container } = render(<DeckPage deck={sales} />);
    expect(container.querySelector('input')).toBeNull();
  });
});

describe('the Integrated deck', () => {
  it('shows 26 places, with the live app as slide 24', () => {
    const { container } = render(<DeckPage deck={integrated} />);
    expect(integrated.flow).toHaveLength(26);
    expect(integrated.flow[23]).toBe('app');
    expectOrder(container, integrated.flow);
  });
  it('opens the phone frame signed in as Claire, with its own words', () => {
    const { container } = render(<DeckPage deck={integrated} />);
    expect(container.querySelector('iframe')).toHaveAttribute('src', demoAppUrl('claire'));
    expect(screen.getByText('Coming in 2027')).toBeInTheDocument();
  });
  it('has an address but is not listed on the home page', () => {
    expect(integrated.listed).toBe(false);
    expect(routeOf(integrated.href).kind).toBe('deck');
  });
});

describe('nothing is saved and there is no CSV step', () => {
  it('does not write to browser storage', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem');
    const { container } = render(<DeckPage deck={ops} />);
    expect(set).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(container.textContent).not.toMatch(/csv|create new file|allow saving/i);
  });
});

describe('navigation: round buttons and arrow keys', () => {
  const up = () => screen.getByRole('button', { name: 'Previous slide' });
  const down = () => screen.getByRole('button', { name: 'Next slide' });
  /** The slide the page last scrolled to. */
  const lastShown = () => (scrollIntoView.mock.contexts.at(-1) as HTMLElement).getAttribute('aria-label') ?? (scrollIntoView.mock.contexts.at(-1) as HTMLElement).querySelector('img')?.alt;

  it('starts on slide 1 with the up button off', () => {
    render(<DeckPage deck={ops} />);
    expect(up()).toBeDisabled();
    expect(down()).toBeEnabled();
  });
  it('the down button shows the next slide and turns the up button on', async () => {
    render(<DeckPage deck={ops} />);
    await userEvent.setup().click(down());
    expect(lastShown()).toBe(ops.flow[1] === 'app' ? 'Live demo' : (ops.flow[1] as { alt: string }).alt);
    expect(up()).toBeEnabled();
  });
  it('arrow keys, Page Down and Space move one slide, and the browser does not handle them', () => {
    render(<DeckPage deck={ops} />);
    expect(fireEvent.keyDown(window, { key: 'ArrowDown' })).toBe(false);
    fireEvent.keyDown(window, { key: 'PageDown' });
    fireEvent.keyDown(window, { key: ' ' });
    expect(lastShown()).toBe((ops.flow[3] as { alt: string }).alt); // the 4th slide, a build step
    for (let i = 0; i < 3; i++) fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(lastShown()).toBe('Live demo'); // the 7th slide
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(lastShown()).toBe((ops.flow[5] as { alt: string }).alt);
  });
  it('Right arrow goes forward and Left arrow goes back', () => {
    render(<DeckPage deck={ops} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(lastShown()).toBe((ops.flow[1] as { alt: string }).alt);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(lastShown()).toBe((ops.flow[0] as { alt: string }).alt);
  });
  it('a click on a picture slide shows the next slide', async () => {
    render(<DeckPage deck={ops} />);
    await userEvent.setup().click(screen.getByAltText((ops.flow[0] as { alt: string }).alt));
    expect(lastShown()).toBe((ops.flow[1] as { alt: string }).alt);
  });
  it('a click on the round buttons moves one slide only, and a click on the live slide does nothing', async () => {
    render(<DeckPage deck={ops} />);
    const user = userEvent.setup();
    await user.click(down());
    expect(lastShown()).toBe((ops.flow[1] as { alt: string }).alt);
    for (let i = 0; i < 5; i++) fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(lastShown()).toBe('Live demo');
    scrollIntoView.mockClear();
    await user.click(screen.getByLabelText('Live demo'));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
  it('stops at the last slide and turns the down button off', () => {
    render(<DeckPage deck={ops} />);
    for (let i = 0; i < ops.flow.length + 3; i++) fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(down()).toBeDisabled();
    expect(up()).toBeEnabled();
  });
});
