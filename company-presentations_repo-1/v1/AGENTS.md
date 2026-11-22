# Agent guide: v1

Read the repository guide first: [`../AGENTS.md`](../AGENTS.md). It sets the layout, the pull request flow and the rules for every change. This file adds what is specific to `v1/`.

## What v1 is

Company presentations as a small web site. Each deck is a list of slides. Most slides are pictures exported from Google Slides. One slide in each deck is live: it shows the Budy phone app in a phone frame, running against a mock server on the same laptop. After setup, everything runs on one laptop with no internet.

All pages are served under `/v1/`. The address of a deck is its folder path under `src/decks/`.

| Address | What it shows |
| --- | --- |
| `/v1/home` (and `/v1/`) | The home page: every listed deck, grouped into Events and People. Built from the folders, nothing to edit by hand. |
| `/v1/events/slif-nov-2026/ops` | The care deck: 12 visible slides. Slide 7 is the live phone app with Megan. |
| `/v1/events/slif-nov-2026/sales` | The sales deck: 13 visible slides. Slide 7 is the live phone app with Claire. |
| `/v1/events/slif-nov-2026/integrated` | The Integrated Solutions deck: 26 slides. Slide 24 is the live phone app with Claire. Not listed on the home page: reps open the address directly. |
| `/v1/users/<name>/<deck>` | A person's own deck. Listed under People on the home page. |

Slides 3 to 6 of the Ops and Sales decks are four build steps of one Google slide. Only the visible slides of a Google deck count. Ignore hidden slides.

## Where to read next

| Task | Read |
| --- | --- |
| Change a deck: words on slides, or slides added, removed or moved | [`docs/UPDATE-DECK.md`](docs/UPDATE-DECK.md) |
| Set up, run, add a deck, change the code, fix a problem | [`docs/RUNBOOK.md`](docs/RUNBOOK.md) |
| A short description and the run commands | [`README.md`](README.md) |

## Commands (run inside `v1/`)

| Command | What it does |
| --- | --- |
| `npm run setup` | Installs the packages and builds the site. Needs internet once. Needs Node 24 or newer. |
| `npm start` | Runs the site, the phone app and the mock server. Open `http://localhost:4173/v1/home`. |
| `npm run check:slides` | Checks the slide pictures against the slide lists. |
| `npm test` | Formulas, routes, slide order, and no saving of input. |
| `npm run build` | Type check, then build into `dist/v1`. |

**Before every pull request, run `npm run check:slides`, `npm test` and `npm run build`. All three must pass.**

## Map of the code

| Path | What it holds |
| --- | --- |
| `src/decks/` | **All decks.** `<events or users>/<namespace>/<deck>/` holds a `deck.json` and the slide pictures. `registry.ts` finds them when the site is built. |
| `src/presentation/` | The home page, the deck page and the routes (`Routes.tsx`). `config.ts` holds the base path and the phone app address. |
| `src/decks/<group>/<namespace>/<deck>/01.png` ... | The slide pictures of a deck, named by place in the visible deck. The live slide has no picture, so its number is skipped. 2000 x 1125 pixels, 16:9. |
| `src/settings.ts`, `src/logic/` | The numbers, rates, wording and formulas. Approval needed to change. |
| `vendor/demo-app/` | A built copy of the Budy phone app and its mock server. Do not edit by hand. `SOURCE.md` says where it came from. |
| `scripts/` | The launcher, the slide check, the PDF converter and the phone app refresh script. |
| `public/_headers` | Security headers. The launcher sends the same headers locally. |
| `vite.config.ts` | The build. `base: '/v1/'` and `outDir: 'dist/v1'`. |

## Adding decks

A deck is a folder. You add one without changing any code. The site finds it when it is built, gives it an address, and lists it on `/v1/home`.

**Where.** Event decks go in `src/decks/events/<event>/<deck>/`. Your own decks and drafts go in `src/decks/users/<your-name>/<deck>/`. Use lower case letters, digits and hyphens in every folder name. Make your own folder under `users/` with your first name or GitHub username. Do not edit another person's folder without asking them.

**What goes in the folder.**
1. The slide pictures: `01.png`, `02.png`, ... named by place in the deck, 2000 x 1125 pixels (16:9). The live phone slide has no picture, so its number is skipped.
2. A `deck.json`:

```json
{
  "title": "Pitch",
  "description": "One line that shows on the home page.",
  "order": 10,
  "listed": true,
  "app": { "teammate": "claire", "name": "Claire", "text": "The words under Meet Claire." },
  "slides": [
    { "alt": "Cover" },
    { "alt": "The problem" },
    { "live": true },
    { "alt": "Next steps" }
  ]
}
```

- `slides` is in order. A picture slide has an `alt` text (a short title). Add `"group": "build"` to slides that are build steps of one slide. Exactly one slide is `{ "live": true }`: the live phone app. `app` says which teammate (`megan` or `claire`) is signed in, and the words on that slide.
- `order` (optional) puts the deck earlier or later on the home page. `listed: false` keeps the deck off the home page but keeps its address.

**Optional names.** `src/decks/events/<event>/event.json` (`{ "title": "...", "description": "..." }`) and `src/decks/users/<name>/user.json` (`{ "name": "..." }`) set the display names on the home page. Without them the folder name is used.

**Check it.** Run `npm run check:slides`, `npm test` and `npm run build`. Then run `npm start` and open the address of your deck. Open a pull request (see [`../AGENTS.md`](../AGENTS.md)).

To make a deck from a Google Slides PDF, use `scripts/pdf-to-slides.py` (see [`docs/UPDATE-DECK.md`](docs/UPDATE-DECK.md)). It makes the pictures and prints the `slides` list for `deck.json`.

## Rules specific to v1

1. **Approval needed.** Do not change a constant, a rate, a formula or a displayed number without approval from the business owner of the numbers. The person you work for must confirm that approval. If the person cannot, stop and ask them to get it. Constants live in `src/settings.ts`. Formulas live in `src/logic/`.
2. **Do not rewrite or restyle slide pictures.** Replace them only with a fresh export of the approved deck, under the same names.
3. **Slide 7 (the live phone slide) of Ops and Sales is not rebuilt or changed** by a deck update.
4. **Do not edit `vendor/demo-app/` by hand.** Rebuild it with `npm run demo:refresh` (developers only; see the runbook).
5. **Keep the base path in sync.** `BASE_PATH` in `src/presentation/config.ts` and `base` and `outDir` in `vite.config.ts` must agree. A test checks it.
6. **If you change a port**, change `src/presentation/config.ts`, `public/_headers` and `scripts/start.mjs` together.
7. **Move-ins show as whole numbers.** Dollar amounts use the exact decimals.
8. **Tell the person when a number in a deck does not add up.** Do not fix it yourself. The runbook lists the known points.

## Approved formulas (for reference; do not change)

- **Ops:** care bumps = residents x 31 / 655. Dollars a month = care bumps x $1,000. A year = a month x 12. Start value 900 residents gives $42.6K a month and about $511K a year.
- **Sales, simple rule:** back in conversation = leads x 20%. Deposits and move-ins = leads x 41 / 1,482, whole number. Revenue a month = move-ins x rent. A year = a month x 12. Constants: `SALES_SIMPLE` in `src/settings.ts`. Start values: 2,000 leads and $5,000 rent. No page shows this today.
- **Sales, older formula:** `calculateSales` in `src/logic/sales.ts`. Example: 1,482 cold leads, $6,207 rent, 24-month stay gives about 58.6 move-ins, $3.82M revenue and $1.45M NOI. The marketing lift from email clicks is not counted in move-ins. `reference/sales_marketing_logic.js` is the original file, which still has the lift. A test compares the two with a click rate that gives no lift. No page uses this formula.
- **Known mismatch, kept on purpose:** Ops slide 10 says "An average of $600 dollars per resident". The formula gives about $568. Do not change either without approval.
- The pages have no calculators. The formulas and their tests stay in the code.

## Brand

Blue `#0077CC` and `#0097FF`, yellow `#F5BF30`, dark `#231F20`, navy `#0B2038`. Fonts: Space Grotesk and IBM Plex Mono.
