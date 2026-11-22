# Runbook: set up, run and update v1

This runbook is for AI coding agents and for new team members. Read [`../../AGENTS.md`](../../AGENTS.md) and [`../AGENTS.md`](../AGENTS.md) first, then read this file fully before you act.
All commands run inside the `v1/` folder unless a step says otherwise.
You work for a person at the keyboard. This person may not be a developer. Explain every step in plain words.
Define a technical term in one line the first time you use it. Work in small steps. After each step say what changed and how to see it.

## 1. What this project is

Presentations for Budy reps. They run on the rep's laptop. After setup they need no internet.

| Address | What it shows |
| --- | --- |
| `/v1/home` (and `/v1/`) | The home page: every listed deck, grouped into Events and People. Built from the deck folders. |
| `/v1/events/slif-nov-2026/ops` | The 12 visible slides of the care deck as pictures (slides 3 to 6 build up the four boxes one by one). Slide 7 is the live Budy phone app with Megan. |
| `/v1/events/slif-nov-2026/sales` | The 13 visible slides of the sales deck as pictures (slides 3 to 6 build up the four boxes one by one). Slide 7 is the live Budy phone app with Claire. |
| `/v1/events/slif-nov-2026/integrated` | The Integrated Solutions demo deck: 26 slides as pictures. Slide 24 ("Meet Claire.") is the live Budy phone app with Claire. Not listed on the home page: reps open the address directly. |
| `/v1/users/<name>/<deck>` | A person's own deck. See "Adding decks" in `../AGENTS.md`. |

The page cannot be scrolled by the visitor (no wheel, trackpad or swipe). Slides change with the round up and down buttons on the right, a click on a picture slide, the arrow keys (Down and Right go forward, Up and Left go back), Page Up, Page Down and Space (`SlidePage` in `src/presentation/Slide.tsx`, styles in `presentation.css`). Nothing the visitor types is saved or sent. There are no calculators on the pages (removed 2026-11-01). **Only visible slides of the Google decks count. Ignore hidden slides.**
The phone app is a built copy that lives in this repository (`vendor/demo-app/`). It talks to a made-up (mock) server on the same laptop.

Repository: `https://github.com/Budybot/company-presentations_repo-1`. It is private. Keep it private. The numbers and the decks have a business owner (the GTM lead). Ask the person who that is when you need an approval.

## 2. The rules

1. You may change anything in `v1/` through a pull request (see section 3, step 11). After each change, tell the person what you changed.
2. **Approval needed:** Do not change a constant, a rate, a formula or a displayed number without approval from the business owner of the numbers.
   The person you work with must confirm that the business owner approved it. If they cannot, stop and ask them to get approval.
   All constants live in `src/settings.ts`. The formulas live in `src/logic/`.
3. Do not rewrite or restyle the deck slide pictures. They are exports of the approved deck.
4. Nothing a visitor types may be stored or sent. No local storage, no cookies, no analytics, no CSV. A test checks this.
5. Never point the phone frame at a production app. The `?teammate=` sign-in link works only with the mock server.
6. Keep the repository private. Never push to a public place.
7. Do not delete files without asking the person first.
8. Do not stop programs you did not start. Check the process first (see section 9).
9. Move-ins show as whole numbers. Dollar amounts use the exact decimals.

Approved formulas (for reference, do not change):
- Ops: care bumps = residents x 31 / 655. Dollars a month = bumps x $1,000. A year = a month x 12. Start value 900 residents gives $42.6K a month and about $511K a year.
- Sales (approved 2026-10-31): back in conversation = leads x 20%. Deposits and move-ins = leads x 41 / 1,482, whole number. Revenue a month = that number x rent. A year = a month x 12. Constants: `SALES_SIMPLE` in `src/settings.ts`. Start values: 2,000 leads, $5,000 rent. The older `calculateSales` (`src/logic/sales.ts`, example 1,482 leads, $6,207 rent gives about 58.6 move-ins) is kept with its tests, but the page does not use it.
- Known mismatch, kept on purpose: Ops slide 10 says "An average of $600 dollars per resident". The formula gives about $568. The business owner chose to keep both. Do not change either without approval.

## 3. First-time setup

Do these steps on the laptop. Run each command and check the result before the next step.

1. Check the tools. Run `node --version`. It must show 24 or newer. If not, tell the person to install Node 24 or newer from https://nodejs.org.
2. Check git. Run `git --version`.
3. Get access. The person must have access to the repository (the GTM team and engineering have it). If `git clone` fails with "not found", the person has no access or the GitHub invitation is not accepted. Ask them to ask the GitHub organization admin.
4. Sign in to GitHub on this laptop. If `gh auth status` fails, run `gh auth login`. If `gh` is not installed, use HTTPS with a personal access token, or install GitHub Desktop.
5. Clone: `git clone https://github.com/Budybot/company-presentations_repo-1.git`
6. Go into the version folder: `cd company-presentations_repo-1/v1`
7. Install and build (needs internet once): `npm run setup`
8. Start: `npm start`
9. Open `http://localhost:4173/v1/home` in Chrome. Click Ops under Events. Go to the last slide with the round down button. Megan must appear signed in inside the phone.
10. Stop with Ctrl+C in the terminal.
11. To change anything, make a branch and open a pull request (see [`../../AGENTS.md`](../../AGENTS.md)). `main` is protected: nobody can push to it.

`npm start` runs three servers on this laptop. Their ports must be free.

| Port | What |
| --- | --- |
| 4173 | The presentation |
| 8081 | The phone app |
| 4010 | The mock server (made-up data only) |

If a port is busy, `npm start` says which one and stops. Find the owner with `lsof -iTCP:<port> -sTCP:LISTEN`. Show it to the person. Stop it only if the person agrees.

Get the newest version later: `git switch main`, `git pull`, then `npm run setup`, then `npm start` (inside `v1/`).

Checks that must pass before the demo:
- The page loads. The phone shows Megan (Ops) or Claire (Sales) without a sign-in screen.
- The microphone button asks for permission once in Chrome. Allow it.
- In the app menu, "Reset demo" returns the demo to its start. It affects only this laptop.
- Offline: after setup, the demo works without internet. If a laptop never has internet, copy the whole `v1/` folder (with `node_modules`) from a ready laptop.

## 4. How the project is built (so you can edit it)

| Path | What it holds |
| --- | --- |
| `src/decks/` | **All decks.** `<events or users>/<namespace>/<deck>/` with a `deck.json` (the slide list) and the pictures. `registry.ts` finds them at build time. No list to edit. |
| `src/presentation/Routes.tsx` | The home page (`/v1/home`), the deck page and the routes. |
| `src/presentation/Slide.tsx` | `ImageSlide` (a picture), `LiveSlide` (a 1280 x 720 page scaled to fit), `SlidePage` (the locked page, the round up and down buttons and the keys). |
| `src/presentation/AppSlide.tsx` | The phone frame and the live app (slide 7 of Ops and Sales, slide 24 of Integrated). |
| `src/presentation/presentation.css` | All slide styles. |
| `src/presentation/presentation.test.tsx` | Tests for pages and slide order. |
| `src/settings.ts` | All numbers, rates and wording. Approval needed to change. |
| `src/logic/` | Formulas and their tests. Approval needed to change. |
| `src/decks/events/slif-nov-2026/ops/` | The Ops deck: `deck.json` and the pictures, named by their place among the visible slides. No `07.png`: the live slide takes that place. |
| `src/decks/events/slif-nov-2026/sales/` | The Sales deck, same rule. |
| `src/decks/events/slif-nov-2026/integrated/` | The Integrated deck. No `24.png`: the live slide takes that place. |
| `vendor/demo-app/` | The built phone app and its mock server. `SOURCE.md` says where it came from. |
| `scripts/start.mjs` | The `npm start` launcher. |
| `scripts/refresh-demo.mjs` | Rebuilds `vendor/demo-app/`. Not needed for deck changes. |
| `public/_headers` | Security headers. The launcher sends the same headers. |

Slide pictures are 2000 x 1125 pixels (16:9). Live pages are drawn at 1280 x 720 and scaled.
Each slide is at most as tall as the window. The page is locked with `overflow: hidden`. The code scrolls to a slide when a button or key is used. There is a gutter of 84 pixels left and right so the buttons do not cover a slide.
Nothing may reach past the 1280 x 720 box. Check this in the browser after any layout change.

Order today: each deck's `slides` list in its `deck.json` is the order. Ops has 12 entries, Sales has 13, Integrated has 26. The entry `{ "live": true }` is the live phone app: slide 7 in Ops and Sales, slide 24 in Integrated. All other entries are pictures.

## 5. Update a deck (Ops, Sales or Integrated)

The full steps are in **[UPDATE-DECK.md](UPDATE-DECK.md)**. Follow that file. It covers the two ways to get the deck (the Google Slides connector, or a PDF that the person downloads), hidden slides, the live slide, the words-only case, the checks and the pull request.

| Deck | Google Slides deck | Folder | Live slide |
| --- | --- | --- | --- |
| Ops | "SLIF - care": `https://docs.google.com/presentation/d/17b0iYhv8iKz-yvN8qPwPkdCfTkstrv601yPVunEaoRc` | `src/decks/events/slif-nov-2026/ops/` | Slide 7: Megan |
| Sales | "SLIF - Sales": `https://docs.google.com/presentation/d/1FGwerJpEMihwh_7OEjuurC6ffrnka4a8rJPa-XBpXNc` | `src/decks/events/slif-nov-2026/sales/` | Slide 7: Claire |

Tools in `scripts/` for this job:
- `npm run check:slides` checks that every picture in the lists exists, is 2000 x 1125 pixels, and is used. It also runs inside `npm test`.
- `scripts/pdf-to-slides.py` turns a Google Slides PDF into the right picture files (see UPDATE-DECK.md).

## 6. Known open points about deck numbers

Agents must tell the person when a deck number does not add up. Points found on 2026-11-01:
- Sales slide 3 (the sales deck): the Manor Lake follow-up says 13 + 18 = 31 families. Manor Lake had 24 stalled tours. 31 is the count for all 3 communities.
- Sales "What it's worth": "20% reactivated" against 340 / 1,482 = 22.9%. "$720K a year" is the annual rent of one month's 12 move-ins.
- Sales "Revenue management": the score, the posture and the $32-43K cannot be checked from the deck.
- The slide "Book a Demo" has only a title.

## 7. Change the phone app (developers only)

Most changes do not need this. The phone app is a built copy. Do not edit files in `vendor/demo-app/web` by hand.
To rebuild the copy, you need the private app repository `app-demo-mockup-v1` and its private package access. Read its `DEMO-SETUP.md`. Then run:

```bash
npm run demo:refresh -- <path to the app-demo-mockup-v1 folder>
```

Edits made by hand in `vendor/demo-app/demo/` (for example removing the line "Pattern, not proof." from `demo/stories/claire/stalled-tours/story.json` on 2026-11-01) must also be made in the app repository, or a refresh brings them back. The script builds the app as a web site, copies the mock server and demo stories, and writes a local font file and a rule that hides scroll bars.
The app needs the sign-in link change (`?teammate=megan` or `claire`). That change is on branch `demo-auto-sign-in` in that repository. Make sure it is pushed there before you rebuild. Ask the owner of that repository if it is not.
Check `vendor/demo-app/SOURCE.md` afterwards. It must list the new commit.

## 8. How the phone and the app connect

- The phone frame is an `iframe` (a page inside a page) in `AppSlide.tsx`. Its address comes from `demoAppUrl()` in `src/presentation/config.ts`: `http://localhost:8081/?frame=off&teammate=megan`.
- The frame is a real iPhone Pro Max shape. The app is drawn 430 x 932 and scaled to fit the screen (293 x 636 on the 1280 x 720 stage).
- `public/_headers` allows the frame from `http://localhost:8081` and the microphone. If you change a port, change `config.ts`, `public/_headers` and `scripts/start.mjs` together.
- "Reset demo" in the app menu resets the mock data on that laptop.

## 9. Troubleshooting

| Problem | Likely cause and fix |
| --- | --- |
| `npm start` says a port is in use | Another program uses 4173, 8081 or 4010. Find it with `lsof -iTCP:<port> -sTCP:LISTEN`. Check the program with the person. Stop only a program you started or the person approves. |
| The phone shows the sign-in screen once after `npm start` was restarted | The browser tab holds an old session from the earlier run. Reload the page once more. The second load signs in. A new tab also works. Tell the person before the demo starts. |
| The arrow keys do nothing | The rep clicked inside the phone. The keys then go to the app. Use the round buttons, or click outside the phone first. |
| The phone is blank | The app server (port 8081) did not start. Read the terminal output. Reload the page. |
| The phone shows a sign-in screen | The link has no `?teammate=`, or the app copy lacks the sign-in change. Check `vendor/demo-app/SOURCE.md`. |
| The microphone does not work | Allow the microphone in Chrome for `localhost:8081`. Check `Permissions-Policy` in `public/_headers`. |
| A picture looks stretched | The file is not 16:9. Export again at 2000 x 1125. |
| Tests fail after a deck change | The slide count or order changed. Update `deck.json` and the tests that name that deck (`src/presentation/presentation.test.tsx`, `scripts/check-slides.test.mjs`). |
| `git push` is rejected | `main` is protected: push a branch, not `main`. If your own branch is rejected, someone else pushed to it. Run `git pull`, run the checks, then push again. |
| Screenshots in the browser show an old scroll position | The page scrolls smoothly. Wait a second and look again. |

Before you stop a program: run `lsof -iTCP:<port> -sTCP:LISTEN` and check its folder with `lsof -p <PID> | grep cwd`. Never use `pkill` by name.

## 10. Report format

After each task, tell the person in short sentences:
1. What changed.
2. How to see it (address and scroll position).
3. What you checked (tests, build, browser).
4. What you did not check.
5. What the person must do next (for example: tell reps to `git pull`).
