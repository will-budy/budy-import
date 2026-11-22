# Company presentations: v1

Slide decks for Budy sales and ops reps, shown on a laptop. Each deck is a set of pictures exported from Google Slides. One slide in each deck is a live demo of the Budy phone app. After setup everything runs on that laptop and needs no internet.

**Agents and new team members:** read [`../AGENTS.md`](../AGENTS.md) and [`AGENTS.md`](AGENTS.md) first. To change a deck, follow [`docs/UPDATE-DECK.md`](docs/UPDATE-DECK.md). For setup and everything else, follow [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

| Address | What it shows |
| --- | --- |
| `/v1/home` (and `/v1/`) | The home page. It lists every deck, grouped into Events and People. Built from the deck folders. |
| `/v1/events/slif-nov-2026/ops` | The 12 visible slides of the care deck. Slide 7 is the live phone app with Megan. |
| `/v1/events/slif-nov-2026/sales` | The 13 visible slides of the sales deck. Slide 7 is the live phone app with Claire. |
| `/v1/events/slif-nov-2026/integrated` | The Integrated Solutions deck: 26 slides. Slide 24 ("Meet Claire.") is the live phone app with Claire. Not listed on the home page: reps open the address directly. |
| `/v1/users/<name>/<deck>` | A person's own deck, for drafts and scratch work. Listed under People. |

Every deck is a folder under `src/decks/`. To add one, see "Adding decks" in [`AGENTS.md`](AGENTS.md).

The visitor cannot scroll the page with the wheel, the trackpad or a swipe. Slides change with the two round buttons on the right, with a click on a picture slide (not on the live phone slide), or with the arrow keys (Down and Right go forward, Up and Left go back), Page Up, Page Down and Space. The chat inside the phone still scrolls with the wheel. If the rep clicks inside the phone, the arrow keys go to the app: use the buttons, or click outside the phone first. The phone opens already signed in: Megan in the Ops deck, Claire in the Sales and Integrated decks. The rep can switch persona in the app's menu.
Nothing the rep types is saved anywhere.

## Run it

You need Node 24 or newer. Setup needs internet once. Run these inside the `v1/` folder:

```bash
npm run setup    # installs the packages and builds the presentation
npm start        # starts everything
```

Open `http://localhost:4173/v1/home`. Press Ctrl+C in the terminal to stop.

`npm start` runs three small servers on this laptop. Their ports must be free.

| Port | What |
| --- | --- |
| 4173 | The presentation |
| 8081 | The Budy phone app (shown in the phone frame) |
| 4010 | The app's mock API: made-up data only. Nothing leaves the laptop. |

- To start the demo again, open the app's side menu and tap "Reset demo". It only affects this laptop.
- The microphone ("Hold to brief Megan") works inside the frame. The browser asks for permission once.
- If a laptop has no internet even for setup, copy the whole `v1/` folder, including `node_modules`, from a laptop that is ready.

## What is in `v1/`

| Path | What it holds |
| --- | --- |
| `src/decks/` | All decks: `<events or users>/<namespace>/<deck>/` with a `deck.json` and the slide pictures (`01.png`, `02.png`, ...; 2000 x 1125 pixels, 16:9; the live slide has no picture). |
| `src/presentation/` | The home page, the deck page and the routes. `config.ts` holds the base path and the phone app address. |
| `src/settings.ts` | **All numbers, rates and wording.** |
| `src/logic/` | The Sales and Ops formulas and their tests. |
| `reference/` | The original sales formula file. A test checks that `src/logic/sales.ts` matches it. |
| `vendor/demo-app/` | A ready-built copy of the Budy phone app and its mock API, so reps need no private package. `SOURCE.md` says where it came from. |
| `scripts/` | `start.mjs` (the `npm start` launcher), `check-slides.mjs`, `pdf-to-slides.py`, `refresh-demo.mjs`. |
| `docs/` | `UPDATE-DECK.md` and `RUNBOOK.md`: instructions for agents and new team members. |
| `public/_headers` | Security headers. The launcher sends the same headers locally. |

## Tests

```bash
npm run check:slides   # slide pictures against the slide lists
npm test               # formulas, routes, slide order, no saving of input
npm run build          # type check and build into dist/v1
```

## Changing things

- A deck changed in Google Slides: follow [`docs/UPDATE-DECK.md`](docs/UPDATE-DECK.md).
- Anything else, or a problem: follow [`docs/RUNBOOK.md`](docs/RUNBOOK.md).
- All changes go through a pull request. See [`../AGENTS.md`](../AGENTS.md).
