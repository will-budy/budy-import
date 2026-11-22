# Agent guide: company presentations

Instructions for AI coding agents (Codex, Claude, ChatGPT and others) and for people.
This is the one entry file for the repository. Read it fully, then read the guide of the version you work in.

## What this repository is

A shared place for company presentations. Each version of the site lives in its own top-level folder.
Today there is one version: [`v1/`](v1/). Slide decks are pictures exported from Google Slides, shown by a small web app. Some slides show a live demo of the Budy phone app.

| Folder | Guide to read | Status |
| --- | --- | --- |
| `v1/` | [`v1/AGENTS.md`](v1/AGENTS.md) | Current. All pages are served under `/v1/`. The home page is `/v1/home`. |

A later `v2/` may replace `v1/`. Do not start it unless the person asks.

## Layout rules

1. **All project files live inside a version folder** (`v1/`). The repository root holds only this file, `README.md` and `.gitignore`.
2. **One version, one folder, one address prefix.** `v1/` is served under `/v1/`. The address of a deck is its folder path under `v1/src/decks/`: `/v1/events/slif-nov-2026/sales` for an event deck, `/v1/users/<name>/<deck>` for a personal deck. `/v1/home` lists every deck, found when the site is built. A new deck is a new folder under `v1/src/decks/`, never a new top-level folder and never a code change.
3. **Agent instructions live in `AGENTS.md` files only.** Do not add `CLAUDE.md`, `GEMINI.md`, `.cursorrules` or any other tool-specific instruction file. If a tool needs one, tell the person instead of adding it.
4. **Keep files that are not code out of the root.** Slide pictures and `deck.json` go in `v1/src/decks/<group>/<namespace>/<deck>/`. Notes go in `v1/docs/`.
5. **Do not put names or personal details of people in the repository**: no names, email addresses or personal accounts, in code, comments or docs. Refer to roles, for example "the business owner of the numbers".

## Namespaces: where your decks go

Every deck lives at `v1/src/decks/<group>/<namespace>/<deck>/`.

| Group | Namespace is | Use it for | Example address |
| --- | --- | --- | --- |
| `events` | An event, for example `slif-nov-2026` | Shared decks for one event. Everyone can use them. | `/v1/events/slif-nov-2026/sales` |
| `users` | A person, for example `alex` | Your own decks, drafts and scratch work. | `/v1/users/alex/pitch` |

Make your own folder under `users/` with your first name or GitHub username in lower case. Only you add to it by habit, so branches rarely conflict. Do not edit another person's folder without asking them. How to make a deck folder: see [`v1/AGENTS.md`](v1/AGENTS.md), section "Adding decks".

## How to change this repository

`main` is protected. Nobody can push to it, and an administrator cannot either. All changes go through a pull request with one approving review and resolved review threads.

1. Get the newest code: `git switch main && git pull`.
2. Make a branch: `git switch -c <short-name>` (for example `sales-deck-update`). Do not push to `main`.
3. Make the change. Run the checks of the version (see its guide). They must pass.
4. Commit with a short plain message. Stage files by name. Do not add `dist/`, `node_modules/`, PDFs or scratch files.
5. Push the branch: `git push -u origin <short-name>`. Forking is disabled, so push the branch to this repository.
6. Open a pull request into `main`. Say what changed, how to see it, and what you checked. Ask for review.
7. After the merge, tell reps to `git pull`, run `npm run setup` in `v1/`, and restart `npm start`.

Many people and agents work here at the same time. Keep changes small. Touch only the files your change needs. If your branch is behind `main`, merge `main` into it. Do not rewrite shared history.

## Rules for every change

- Do not change a number, a rate, a formula or a displayed figure without approval from the business owner of the numbers. See the version guide.
- Do not rewrite or restyle exported slide pictures. They are exports of approved decks.
- Nothing a visitor types may be stored or sent. No cookies, no local storage, no analytics.
- Never point the phone frame at a production app. It must use the mock server on the same laptop.
- Keep this repository private. Never push or copy it to a public place.
- Do not delete files without asking the person first.
- Do not stop programs you did not start. Check the process first.

## Working with the person

Most people who use this repository do not write code and use a Mac. When you work for such a person:
- Run the commands yourself. Explain each step in plain words and short sentences.
- Define a technical term in one line the first time you use it.
- Decide technical questions by best practice and say what you chose and why in one or two sentences. Ask only about business decisions.
- Work in small steps. After each step say what changed and exactly how to see it.
- At the end, report: what changed, how to see it, what you checked, what you did not check, and what the person must do next.
