# Scoping Review Workbench — notes for Claude

A browser app for scoping reviews (reported to PRISMA-ScR), from the first idea to the charted evidence and the report; the analysis of the charted data is left to the tools of the reviewer's field. The systematic-review mode (PRISMA 2020, meta-analysis, GRADE, RoB 2) was removed on 2026-10-18: the user works in engineering and wants one mode for now, maybe a second in a later year. The review type stays a profile (`src/domain/review-types.js`, `review_type` in `review_state.json`) so a type can be added back; reviews saved as "systematic" open as scoping reviews and keep their saved data. PRISMA guidelines are reporting guidelines: say "reported to", never "a PRISMA method". A review is a folder on the user's PC (`<name> records/`: `08 - Records/*.md`, `07 - Searches.csv`, `review_state.json`, `10 - Full texts/`, …). The app reads and writes that folder through the File System Access API; nothing is uploaded. Review folders are also plain Obsidian notes.

## Working with the user

- Ask questions and offer next steps as clickable choices (AskUserQuestion, 2–4 options, recommended first).
- After a change: test it, commit and push when the user wants, and offer follow-ups.

## Architecture (see ARCHITECTURE.md; `npm run check` enforces it)

- `src/domain` pure rules (no I/O, dates or randomness) · `src/ports` interfaces (Folder, Clock, Http, PdfText) · `src/services` use cases (`ReviewSession` = every user action) · `src/adapters` platform code (node, memory, browser folder, fetch, pdf.js) · `src/ui` browser backend + view model · `web/` the page: `main.js` + `start/` boot and start screen, `studio/` the Scoping Review Workbench page in layers core ← ui ← shell ← pages ← app (one module per page in `studio/pages/`; it never imports `src/`, only `window.backend`).
- The page calls `window.backend` (src/ui/backend.js) instead of a server.

## Run and test

- `Start Scoping Review Workbench.cmd` (double-click) or `npm run serve` → http://localhost:8770/web/ — **Chrome or Edge in a normal window**; browser panes inside other apps cannot open folders.
- `npm test` unit tests · `npm run check` architecture (src/ and web/) · `npm run smoke` browser smoke test (Playwright; walks every page of the example, fails on console errors) · `npm run build` → `dist/` static site.
- Browser automation cannot use the native folder picker: test with the browser's private storage instead (`navigator.storage.getDirectory()` gives a directory handle; `backend.open({handle, name, settings})`).

## Experiments folder

- Every example, demo or test review made in Scoping Review Workbench goes in `C:\Users\A-Bag\Desktop\scoping-review-workbench experiments folder` (one subfolder per experiment, e.g. `2026-10-17 demo records`). In Chrome, choose that folder in the folder picker when creating or opening a review. Never put experiments in this repo folder, the test copy, or the vault.
- The folder picker is a Windows dialog that Chrome browser automation cannot click. Either use computer use for the dialog (type the path in the address bar), or ask the user to pick the folder.

## Open items (2026-10-08)

- Test copy of the user's review: `Desktop\PRISMA Studio test\Project 2 review records` (5,683 records; never test on the original in the vault). It was gone from the Desktop on 2026-10-18: ask the user for a fresh copy from the vault. Check the folder exists before using it: opening a missing path creates an empty review there.
- Offline: `web/sw.js` stores the app on first visit (list from `scripts/precache-list.js`, served as `/web/precache.json`); it then opens at http://localhost:8770/web/ without the server. Chrome can install it as an app.
- Speed on the full review (5,683 notes): `node scripts/bench-open.js "<copy>"` reads it in ~0.6 s; in the browser's private storage it opens in ~2.0 s and a screening click takes ~40 ms. Still to confirm from a real disk folder in the user's Chrome (the app shows the time when opening; `window.openTiming`).
- Outside changes: saving a record merges edits made on disk since it was read (Obsidian); the app re-reads the review when `review_state.json` changed (Claude via `bin/ai-assist.js`), on focus, every 15 s and before each action.
- `bin/ai-assist.js --review` takes a name or a path; a name that fits the test copy and the vault original is refused with both paths.
- Hosting: GitHub Pages from the public repo Abdulhamid-Baghdadi/scoping-review-workbench (https://abdulhamid-baghdadi.github.io/scoping-review-workbench/), deployed by `.github/workflows/pages.yml` on every push to main. Pushing to main publishes the site.

## Writing code here

- Write JavaScript with the Write/Edit tools: shell heredocs mangle `\r`, `\n` and ` ` escapes.
- Keep the review-folder format stable (existing reviews must keep opening); text rules go through `src/domain/text-rules.js`.

## UI and UX rules (full rules, sources and checks: `docs/ui-ux-rules.md`)

Every page change is checked against these before it is reported done; a UI audit rates each broken rule by severity (4 data loss or wrong result … 1 cosmetic) in `docs/ui-audit-<date>.md`. When rules conflict: accessibility first, then the stronger evidence.

- **Accessibility floor (WCAG 2.2 AA, never broken):** text contrast ≥ 4.5:1 and control parts ≥ 3:1 in light and dark; colour never the only signal; everything by keyboard with visible, unobscured focus; dialogs take, keep and return focus; every control has a name, role and state (`aria-pressed`, tabs, `role="dialog"`); status messages in a live region; targets ≥ 24 × 24 px; visible labels (not placeholders); errors stay until dismissed; single-key shortcuts can be turned off; reflow at 320 px and 200 % zoom; `prefers-reduced-motion` respected.
- **Feedback in time** (Miller 1968; Nielsen 1993): a visible response within 0.1 s, a busy state after 1 s, progress and Cancel after 10 s; every result with its numbers.
- **Memory and choice** (Cowan 2001; Hick–Hyman): show options instead of asking people to recall codes or IDs; few choices per decision; rare options folded away (progressive disclosure); help next to the action, short.
- **Effort** (Fitts 1954; keystroke-level model): frequent targets big and close, destructive ones small and apart; repeated work from the keyboard, with the keys shown; modes always visible.
- **Errors and control:** prevent errors (constraints, defaults, disabled buttons that say why); prefer Undo to confirmation; confirm only the irreversible, naming the action and the count ("Exclude 12 records"), never "OK"; errors in plain words with what to do next; safe defaults (AI off); Escape and Cancel always leave.
- **Layout:** one primary action per card; related things grouped (proximity, common region); charts by position and length before colour or area; nothing important styled like a banner.
- **Words:** the reviewer's terms (PRISMA, Cochrane, JBI), never code names; the same word for the same thing everywhere; plain language, action first; icons and emoji support a word, never replace it.
- **AI** (Amershi et al. 2019; automation bias): say what the AI does and why it suggested something; accepting or overriding is one key; independent judgements (the blind second reviewer) never see the AI's or the first reviewer's answer first; who decided and how is logged.
- **Verify** every UI change in the browser pane, in light and dark and with the keyboard, before reporting it done.
