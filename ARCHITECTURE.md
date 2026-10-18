# Architecture

Scoping Review Workbench is a browser app whose data is a folder on the user's PC. It has two halves: the **engine** (`src/`), which knows the review rules and the review-folder format, and the **page** (`web/`), which shows the review and turns clicks into engine actions. Both are plain ES modules with no build step and no framework, so the same files run in Node (tests, CLI) and in the browser, and the published site is the repository as it is.

```
 web/  the page                                   src/  the engine
┌──────────────────────────────────────┐        ┌──────────────────────────────────────────┐
│ main.js · start/   boot, start screen│──────► │ ui/        Backend (window.backend),     │
│                                      │        │            view model                    │
│ studio/                              │        │   │                                      │
│   app.js     starts the page         │        │   ▼                                      │
│   pages/     one module per stage    │ window │ services/  ReviewSession = every action, │
│   shell/     navigation, render,     │.backend│            use cases                     │
│              help, menus, registry   │──────► │   │            │                         │
│   ui/        dialogs, components,    │        │   ▼            ▼                         │
│              charts                  │        │ ports/     domain/      adapters/        │
│   core/      dom, state, api,        │        │ Folder,    pure rules   node, memory,    │
│              autosave                │        │ Clock,     and formats  browser folder,  │
└──────────────────────────────────────┘        │ Http                    fetch, pdf.js    │
                                                └──────────────────────────────────────────┘
```

Each box imports only from the boxes below it (and its own layer). `npm run check` enforces this for every module.

## The engine (`src/`)

| Layer | Folder | Contains | May import |
|---|---|---|---|
| **domain** | `src/domain/` | Pure functions and value objects: front matter, CSV, names, matching, importers, records, screening checks, PRISMA counts, κ, sampling (seeded, reproducible), review state and stage rules, search strings, protocol, citations, generated notes as text. No I/O, no clock, no randomness, no platform APIs. | domain |
| **ports** | `src/ports/` | Interfaces the services need from outside: `Folder` (the review folder), `Clock`, `Http` (OpenAlex), `PdfText`. Types only. | domain, ports |
| **services** | `src/services/` | Use cases (`screening`, `stage-actions`, `review-commands`, `library`, `library-citations`, …). They load the review through a `Folder`, call the domain, and write the result back. Their ports are passed in (dependency injection). | domain, ports, services |
| **adapters** | `src/adapters/` | The ports for each platform: Node file system (tests, CLI), in memory (tests), `fetch` for Http, the browser's File System Access API, pdf.js, the browser's list of remembered reviews. | domain, ports, adapters |
| **ui** | `src/ui/` | The browser shell of the engine: `Backend` answers the page's requests with a `ReviewSession` and knows where each review keeps its settings (a folder, the draft, the example); `view-model.js` builds the snapshot the page draws. | the public API (`src/index.js`), adapters |

Domain, ports and services use no platform modules (`node:*`, packages), so they run in the browser as they are.

**`ReviewSession`** (`services/review-session.js`) is the façade of the engine: one open review, one method per user action. Each method reads the same way: check the protocol lock (a protected change without a reason throws `AmendmentRequired`; the page asks for the reason and repeats the call), run the use case, record it in the timeline, save. The records and the review state stay in memory and are saved after each action. Its dependencies (the `Folder`, a `Clock`, the library, the OpenAlex client, developer mode) are injected.

## The page (`web/`)

| Layer | Folder | Contains | May import |
|---|---|---|---|
| **boot** | `web/main.js`, `web/start/` | Checks the browser, creates the `Backend`, opens the draft review; the start screen when that fails. | start, `src/index.js`, `src/ui/` |
| **core** | `web/studio/core/` | `dom` (h(), $(), small preferences), `state` (the engine's snapshot, the page on screen, drafts, the screening position), `api` (calls to `window.backend`), `autosave`. | core |
| **ui** | `web/studio/ui/` | Dialogs, small components, SVG charts. | ui, core |
| **shell** | `web/studio/shell/` | Navigation, `render()` and everything around the page (top bar, tabs, journey map, metrics), help, review switching and settings, toolbar, keyboard, tour, and the **registry** of pages. | shell, ui, core |
| **pages** | `web/studio/pages/` | One module per stage page (idea, questions, …, screening, …, report). | pages, shell, ui, core |
| **app** | `web/studio/app.js` | Starts the page: connects core to the view, loads the help and the snapshot, draws the first page. | everything in studio |

The studio never imports `src/`: everything it knows about the review comes through `window.backend`, as if from a server. That is the boundary between the halves.

## How a click travels

1. A page module calls `api("decide", {…})` (`core/api.js`).
2. `window.backend.action()` (`src/ui/backend.js`) calls `ReviewSession.decide(…)`.
3. The session runs the use case (`services/screening.js`), checks and logs the decision, and saves the records and the state through the `Folder` port. In the browser that is the user's folder (`adapters/browser-folder.js`); in tests it is memory.
4. The backend returns a new snapshot (`ui/view-model.js`). `core/api.js` stores it (`state.setS`) and calls `render()`, which draws the shell and asks the registry for the page on screen.

## Decisions

- **The review folder is the contract.** File names and formats stay stable, so existing reviews keep opening, in this app and in Obsidian. Text rules (whitespace, line breaks, character counting, sorting) go through `domain/text-rules.js` so every note is written the same way.
- **Effects at the edges.** Dates, random seeds and file access are passed in (ports); domain functions return values instead of writing. This keeps them deterministic and testable.
- **No build step, no framework.** The site is the source tree, which is easy to audit and to run offline (`web/sw.js` stores it on first visit). The cost is a hand-written `h()` and an explicit `render()`.
- **Inversion where the layers would otherwise point up.** `core/api.js` redraws and asks for amendment reasons through a `view` port that `app.js` connects. The shell draws pages and dispatches page keys through the registry (`PAGES`, `PAGE_KEYS`) that the pages fill in. So no lower layer imports a higher one.
- **One module, one concern.** A module is named after what it is about (`matching`, `screening`, `journey-map`), exports a small API, and documents it with JSDoc at the top.
- **Public API.** Code outside `src/` (the boot code, tools, tests of the API) imports from `src/index.js` or the browser shell `src/ui/`.

## Tests

| Kind | Where | Run | Needs |
|---|---|---|---|
| Unit | `tests/unit/` | `npm test` | nothing |
| Architecture | `scripts/check-architecture.js` | `npm run check` | nothing |
| Smoke (browser) | `tests/smoke/pages.mjs` | `npm run smoke` | Playwright and Chromium |

Every engine module gets unit tests for its rules. The smoke test opens the finished example in headless Chromium, walks through every page, opens the panels and does a few actions (an idea note, a screening decision, Review settings). It fails on any console error, and writes the text of every page to a file (`npm run smoke -- out.json`), so a refactor can be checked against the text before it. `scripts/bench-open.js` times opening a real review (use a copy).
