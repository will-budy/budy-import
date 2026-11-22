/** The deck check: it passes on the real repository and catches the usual mistakes. */
import { describe, it, expect } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSlides } from './check-slides.mjs';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** A copy of the decks, to break on purpose. */
function copyOfDecks() {
  const dir = mkdtempSync(join(tmpdir(), 'check-slides-'));
  cpSync(join(repo, 'src/decks'), join(dir, 'src/decks'), { recursive: true });
  return dir;
}
const event = 'src/decks/events/slif-nov-2026';

describe('check-slides', () => {
  it('finds no problem in the real decks', () => {
    const { problems, summary } = checkSlides(repo);
    expect(problems).toEqual([]);
    expect(summary).toContain('events/slif-nov-2026/ops: 12 slides, the live phone slide is slide 7, 11 pictures.');
    expect(summary).toContain('events/slif-nov-2026/sales: 13 slides, the live phone slide is slide 7, 12 pictures.');
    expect(summary).toContain('events/slif-nov-2026/integrated: 26 slides, the live phone slide is slide 24, 25 pictures.');
  });

  it('catches a missing picture, a wrong size, and a leftover file', () => {
    const dir = copyOfDecks();
    try {
      rmSync(join(dir, event, 'ops/05.png'));
      writeFileSync(join(dir, event, 'sales/03.png'), Buffer.from('not a png'));
      writeFileSync(join(dir, event, 'sales/99.png'), Buffer.from('extra'));
      const text = checkSlides(dir).problems.join('\n');
      expect(text).toMatch(/ops: the picture 05\.png is missing/);
      expect(text).toMatch(/sales: 03\.png is not a PNG/);
      expect(text).toMatch(/sales: the file src\/decks\/events\/slif-nov-2026\/sales\/99\.png is not used/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('catches a bad folder name, a missing deck.json, bad JSON and a deck with no live slide', () => {
    const dir = copyOfDecks();
    try {
      mkdirSync(join(dir, 'src/decks/users/Alex Smith/pitch'), { recursive: true });
      mkdirSync(join(dir, 'src/decks/users/alex/empty'), { recursive: true });
      mkdirSync(join(dir, 'src/decks/users/alex/broken'), { recursive: true });
      writeFileSync(join(dir, 'src/decks/users/alex/broken/deck.json'), '{ nope');
      mkdirSync(join(dir, 'src/decks/users/alex/nolive'), { recursive: true });
      writeFileSync(join(dir, 'src/decks/users/alex/nolive/deck.json'), JSON.stringify({ title: 'X', slides: [{ alt: 'One' }] }));
      mkdirSync(join(dir, 'src/decks/misc/team/deck'), { recursive: true });
      const text = checkSlides(dir).problems.join('\n');
      expect(text).toMatch(/users\/Alex Smith: use lower case/);
      expect(text).toMatch(/users\/alex\/empty: there is no deck\.json/);
      expect(text).toMatch(/users\/alex\/broken: deck\.json is not valid JSON/);
      expect(text).toMatch(/users\/alex\/nolive: the list must have exactly one live slide/);
      expect(text).toMatch(/src\/decks\/misc: decks must be in "events" or "users"/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a person can add a deck folder without touching any code', () => {
    const dir = copyOfDecks();
    try {
      const target = join(dir, 'src/decks/users/alex/pitch');
      mkdirSync(target, { recursive: true });
      cpSync(join(repo, event, 'sales/01.png'), join(target, '01.png'));
      writeFileSync(join(target, 'deck.json'), JSON.stringify({ title: 'Pitch', slides: [{ alt: 'Cover' }, { live: true }] }));
      const { problems, summary } = checkSlides(dir);
      expect(problems).toEqual([]);
      expect(summary).toContain('users/alex/pitch: 2 slides, the live phone slide is slide 2, 1 pictures.');
      renameSync(target, join(dir, 'src/decks/users/alex/pitch2'));
      expect(checkSlides(dir).problems).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
