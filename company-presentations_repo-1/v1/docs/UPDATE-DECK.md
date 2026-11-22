# Update a deck: instructions for an AI agent

You are an AI agent (Claude, ChatGPT, Codex or another). A person asked you to update a deck in this project.
Read this whole file first. Then follow the steps in order.

**About the person.** Assume the person does not write code. They use a Mac. Do all commands yourself.
Explain each step in plain words and short sentences. Ask the person only when this file says to ask.
The commands in this file are for the macOS Terminal.

## A. The sentence the person pastes to start

> Read v1/docs/UPDATE-DECK.md and follow it. I changed the [Ops / Sales / Integrated / more than one] deck in Google Slides. Use the Google Slides connector. Open a pull request when it works.

(If the person says "do not publish", do everything up to step 5, send the report, and stop. Make no commit and no push.)

## B. What this project is

Presentations for Budy reps. They run on the rep's Mac. All commands in this file run inside the `v1/` folder.

| Page | Deck (Google Slides) | Slides | Deck folder (pictures and `deck.json`) |
| --- | --- | --- | --- |
| `/v1/events/slif-nov-2026/ops` | "SLIF - care" | 12 visible | `src/decks/events/slif-nov-2026/ops/` |
| `/v1/events/slif-nov-2026/sales` | "SLIF - Sales" | 13 visible | `src/decks/events/slif-nov-2026/sales/` |
| `/v1/events/slif-nov-2026/integrated` | Integrated Solutions deck (id `1_VCgWi7fT2uomQgKLsGWxMVqjfiYSXvpCGK6qYAUjPA`) | 26 places: 25 pictures, **live phone is slide 24** (hidden in Google, no `24.png`) | `src/decks/events/slif-nov-2026/integrated/` |

- Deck links: Ops `https://docs.google.com/presentation/d/17b0iYhv8iKz-yvN8qPwPkdCfTkstrv601yPVunEaoRc`, Sales `https://docs.google.com/presentation/d/1FGwerJpEMihwh_7OEjuurC6ffrnka4a8rJPa-XBpXNc`.
- **Only visible slides count. Ignore hidden slides.** Hidden slides are old versions. They show a crossed-out eye in Google Slides. They must never appear on the page.
- Every slide is a **picture** (a PNG file of 2000 x 1125 pixels), except one.
- **One slide is live: slide 7 in both decks.** It shows the Budy phone app ("Meet Megan." or "Meet Claire."). In the deck it is a placeholder that says `[ iframe embed ]`. It has no picture. The code draws it. **Do not rebuild it and do not change it.** It stays where the deck puts it.
- A picture file is named by the place of its slide in the visible deck: `01.png` to `06.png`, then `08.png`. There is no `07.png`, because slide 7 is live. Slides 3 to 6 are four build steps of one Google slide (box 1; boxes 1-2; boxes 1-3; all four). They are the same picture with the later boxes covered by the background colour.
- Words on slides are inside the pictures. You cannot fix a typo in the code. A changed word means a new picture.

## C. Rules

1. Do not change a number, a rate or a formula without approval from the business owner of the numbers. This job does not need it.
2. Do not rewrite or restyle the slide pictures. Use the deck as the person gives it.
3. Do not touch `vendor/`, `src/logic/` or `src/settings.ts`.
4. Do not delete files except old slide pictures that are no longer used. Ask the person before you delete them.
5. Keep the repository private. `main` is protected. Push a branch of `Budybot/company-presentations_repo-1` and open a pull request. Never push to `main`.
6. Do not stop a program you did not start.
7. If a deck number does not add up, or a slide looks wrong, tell the person. Do not fix it yourself.

## D. Step 1: Get the project ready on this Mac

1. If the project folder is not on this Mac, follow section 3 of `RUNBOOK.md` (Node 24, git, GitHub access, `npm run setup`). Then come back here.
2. Go into the `v1/` folder of the project.
3. Run `git status`. If it lists changes you did not make, tell the person and stop.
4. Run `git switch main` and `git pull`. Then make a branch: `git switch -c <deck>-deck-update`.
5. Run `npm run setup` if the folder `node_modules` does not exist (a new copy of the project), or if `package.json` or `package-lock.json` changed.
6. Tick the first line of the preflight checklist (section E1) in your reply.

## E. Step 2: Connect Google Slides, then get the new deck

**The Google Slides connector is strongly recommended. Always try it first.** Budy has enabled it for the organization. The person only has to connect it once, and it takes about one minute. With the connector you read the deck directly. The pictures are exact, you see which slides are hidden, and you find the live slide yourself. The manual PDF way is more tedious and more risky. You must tell the person this (see E3 and E4).

### E1. Preflight checklist

Copy this checklist into your first reply. Fill it in as you go. The person must see it.

```
PREFLIGHT
[ ] The project folder is on this Mac and `git status` is clean
[ ] Google Slides connector: CONNECTED / NOT CONNECTED
[ ] I can read the deck I need ("SLIF - care" or "SLIF - Sales"): YES / NO
[ ] Visible slides found (hidden slides ignored): N
[ ] Live slide ("[ iframe embed ]") found at slide: 7 (Ops, Sales) or 24 (Integrated)
[ ] Way used to get the deck: CONNECTOR / MANUAL PDF
```

### E2. Test the connector

1. Try to read the deck with your Google Slides tool. Use the deck ID from section B (the part of the link after `/d/`).
2. If you can read it, the connector is CONNECTED. Go to E5.
3. If you have no such tool, or it fails, the connector is NOT CONNECTED. Go to E3.

### E3. If it is not connected: ask the person to connect it. Say this:

> Before I change the deck, please connect Google Slides to this app. I recommend it. Budy has already enabled it for the organization, so it takes about one minute.
> How: open the settings of this app. Find **Connectors** (it may be called **Apps**, **Integrations** or **Tools**; the name is different in each app). Find **Google Slides** (or **Google Drive**). Click **Connect**. Sign in with your Budy Google account.
> Please tell me when it is done.
> Why: with the connector I read the deck directly. I see which slides are hidden. I find the live phone slide. The pictures are exact.

Wait for the person. When the person says it is done, run E2 again. If the person cannot find the setting, tell the person to ask the GitHub or Google organization admin. Do not skip ahead.

### E4. If the person cannot or will not connect: show this warning

Show this text exactly. Then wait for a clear answer:

> **WARNING: manual update.** Without the Google Slides connector, this update is manual. It is more tedious and more risky.
> - You must download a PDF yourself for each deck, every time.
> - An old or wrong PDF is easy to use by mistake.
> - The PDF may contain hidden slides. I must trust the number of visible slides that you give me.
> - I cannot check my work against the real deck.
> - A mistake can put an old or wrong slide in front of a customer.
>
> Connecting takes one minute and removes these risks. Do you want to connect now, or continue with the PDF? Type **continue with the PDF** to go on.

Use Way 2 only after the person types "continue with the PDF" (or says the same in other words). Write "Way used: MANUAL PDF" in the checklist. At the end of the job, remind the person once: "Next time, connect Google Slides. It is faster and safer."

### E5. Way 1: the connector (recommended)

1. Read the deck (its ID is in section B). If your tool lets you choose fields, ask only for `slides.objectId` and `slides.slideProperties.isSkipped`. Without a field choice the answer is very long: save it to a file and read it with a script. A hidden slide has `isSkipped: true`. A visible slide has no `isSkipped` field (or it is false). Ignore hidden slides.
2. Count the visible slides. Tell the person the count. Put it in the checklist.
3. **Show the person the title of every visible slide, in order** (the first words of each slide). Ask: "Are these the slides you expect, in this order?" Wait for a yes. This catches a hidden slide that was moved into the visible range.
4. Find the live slide. It has the text "LIVE DEMO" and `[ iframe embed ]`. It has no picture. Put its place in the checklist.
5. For every other visible slide, call the thumbnail tool (`read_slide_page_thumbnail`) with `pageId` = the slide's `objectId`, `thumbnailSize` = `WIDTH2000_PX` and `mimeType` = `PNG`. The answer has a `contentUrl`. **Download it at once** (the link expires): `curl -sSf -o <name>.png '<contentUrl>'`. Put the whole URL in single quotes, because it is very long. Name each file by the place of the slide among the visible slides: `01.png`, `02.png`, `03.png`, `05.png`, and so on. Save them into the pictures folder of section B.
6. Check each file with `file src/decks/events/slif-nov-2026/ops/*.png` (or the folder of the deck you update). Each must say PNG image data, 2000 x 1125. Step 5 (section H) checks this again.
7. At the end of the job, read the deck once more. If it changed while you worked, start again from step 1. Pictures made from an old version are the main risk.

### E6. Way 2: a PDF (only after the warning in E4)

1. Ask the person to do this for each deck that changed, and to tell you the result:

   > Open the deck in Google Slides. Click **File**, then **Download**, then **PDF document**. Tell me when it is done. Also tell me how many slides are visible. Hidden slides show a crossed-out eye in the list on the left. Do not count those.

2. Find the file: `ls -lt ~/Downloads/*.pdf | head -5`. The newest file is at the top, and the date shows when it was made. Check that the name matches the deck ("SLIF - care" is Ops, "SLIF - Sales" is Sales) and that it was made just now. If you cannot read the Downloads folder (for example you run in a sandbox), ask the person to drag the PDF into the chat or into the project folder. If you are not sure which file it is, ask the person.
3. Install the PDF tool once. This does not change the project:

   ```bash
   python3 -m venv ~/.cache/budy-pdf && ~/.cache/budy-pdf/bin/pip install pymupdf
   ```

   If macOS asks to install the command line developer tools, tell the person to click Install, wait until it finishes, and then repeat the command. If it seems stuck, ask the person to run `xcode-select --install` in the Terminal and wait.
4. Convert the PDF. `<N>` is the number of visible slides the person gave you:

   ```bash
   ~/.cache/budy-pdf/bin/python scripts/pdf-to-slides.py ~/Downloads/<file>.pdf ops --visible <N>
   ```

   Use `sales` instead of `ops` for the Sales deck. The script does these things:
   - It finds the live slide by the text `[ iframe embed ]`. It makes no picture for it.
   - It writes every other page as a PNG of 2000 x 1125 pixels, named by its place (`01.png`, `02.png`, `03.png`, `05.png`).
   - It prints a table of all pages with their first words.
   - It prints the `slides` list for the deck's `deck.json`.
   - It lists old pictures that are no longer used. Ask the person, then run again with `--clean` to delete them.
5. **Hidden slides in the PDF.** Google may put hidden slides in the PDF. They are old versions at the end of the deck. `--visible <N>` keeps only the first N pages. A hidden slide in the middle of the deck would give a wrong picture, so always do this: show the table from the script to the person, with the first words of every page, and ask: "Are these the slides you expect, in this order?" Wait for a yes. If a page is not a slide the person expects, or the count does not match, stop and ask. Do not guess.

## F. Step 3: Decide what kind of change it is

Look at the table (Way 2) or at your list of slides (Way 1). Compare it with the `slides` list in the deck's `deck.json`. Also compare the slide titles with the `alt` texts of that list. If a slide was swapped for a different slide, the titles differ: then treat it as a change of slides (step 4) and update the `alt` text.

- **Nothing changed.** Run `git status`. If no picture shows as changed, the deck is the same as the published one. Tell the person "nothing changed" and stop. Make no commit.
- **Only words changed.** The number of slides is the same. The live slide is still in the same place. This is the usual case. The new pictures already replaced the old ones, under the same file names. **Nothing in the code changes.** Go to step 5.
- **Slides were added, removed or moved, or the live slide moved.** Go to step 4.
- **The live slide is gone from the deck.** Stop. Tell the person and ask what to do.

## G. Step 4: Slides added, removed or moved

1. Open the `deck.json` in the deck folder (section B).
2. Make the `slides` list match the deck: one `{ "alt": "..." }` entry for each picture slide, in order, and `{ "live": true }` at the place of the live slide. Use the lines the script printed. Write a short clear title for each `alt` text. Build steps of one slide share `"group": "build"`.
3. The picture of a slide is named by its place in the list: the first entry is `01.png`, the second is `02.png`, and so on. The live slide takes a place, so its number has no picture.
4. If the slide count or the place of the live slide changed, change the expected numbers in the tests that name this deck (`src/presentation/presentation.test.tsx` and `scripts/check-slides.test.mjs`).
5. If the live slide's own words changed (the sentence under "Meet Megan." or "Meet Claire."), change `app.text` in `deck.json`.
6. Ask the person before you delete old pictures. Remove pictures that the list no longer uses.

## H. Step 5: Check everything (you do this, not the person)

1. Run `npm run check:slides`. It must end with "Slide pictures are OK." If it lists problems, fix them and run it again.
2. Run `npm test`. All tests must pass.
3. Run `npm run build`. It must end without errors.
4. Run `npm start`. Wait for "Budy presentation is running". If a port is already in use, someone else may already run this project. Do not stop that server. Open the pages at the addresses below and check them there, and skip the start. For other port problems see section 9 of `RUNBOOK.md`.
5. Open the deck you changed in a browser. The addresses are `http://localhost:4173/v1/events/slif-nov-2026/ops`, `.../sales` and `.../integrated`, or `http://localhost:4173/v1/home` and click the deck. If you cannot open a browser, ask the person to open them and tell you what they see.
6. Go through every slide with the round down button on the right (or the down arrow key). The page does not scroll with the wheel. That is on purpose.
7. Check each page:
   - The slides are in the order of the deck. No picture is empty, stretched or cut.
   - The words match the changed deck.
   - Slide 7 is the phone. It shows the teammate signed in. If it shows a sign-in screen, reload the page once.
   - The last slide is the last slide of the deck.
8. Press Ctrl+C in the terminal to stop the server you started.

## I. Step 6: Show the person, then open a pull request

1. Tell the person what changed. Use the report format in section K.
2. Ask: "Shall I open a pull request?" Skip the question if the person already said to.
3. First run `git status --short` and read the list. Only picture files and `deck.json` files in `src/decks/`, and the test files named in step 4 of section G if you changed them, may be in the list. If you see other files (for example a PDF, `dist/` or a scratch file), do not add them. Then run these commands from the `v1/` folder:

   ```bash
   git add src
   git commit -m "<Ops or Sales or Integrated> deck: <what changed>"
   git push -u origin <your branch name>
   ```

4. Open a pull request into `main` (`gh pr create`, or the link that `git push` prints). Write what changed, how to see it, and what you checked. `main` is protected: the pull request needs one approving review before it can be merged.
5. Tell the person: "A reviewer must approve the pull request. After it is merged, the reps must run `git pull`, then `npm run setup`, then restart `npm start`."

## J. If something goes wrong

| Problem | What to do |
| --- | --- |
| `git push` is rejected | You pushed to `main`, or someone else pushed to your branch. Never push to `main`. For your own branch: run `git pull`, run step 5 again, push again. |
| The script says it found 0 or 2 live slides | The deck has no `[ iframe embed ]` slide, or two. Tell the person. Do not guess. |
| A picture is not 2000 x 1125 | The slide is not 16:9. Tell the person. The deck page size must be the standard 16:9. |
| `npm run check:slides` reports a missing picture | The `slides` list in `deck.json` and the files do not match. Fix the list or the file names (step 4). |
| The phone slide is blank | The phone app did not start. Read the terminal. Stop and start `npm start` again. |
| The phone shows a sign-in screen | Reload the page once. This happens after a restart. |
| The arrow keys do nothing | The person clicked inside the phone. Use the round buttons, or click outside the phone. |
| Port 4173, 8081 or 4010 is busy | See section 9 of `RUNBOOK.md`. |
| You do not have GitHub access | The person must accept the GitHub invitation and be in a team that can push (the GTM team can). Ask the GitHub organization admin. |

## K. Report format

After the job, tell the person in short sentences:
1. Which way you got the deck: connector or manual PDF. If it was the manual PDF, say once more that connecting Google Slides is faster and safer.
2. What changed (which slides, or "only words on slides 5 and 6").
3. How to see it (the two addresses and the slide numbers).
4. What you checked (the picture check, the tests, the build, the pages).
5. What you did not check.
6. What happens next (for example: the reps must run `git pull`).

More detail for developers is in `RUNBOOK.md`.
