# Plan: scoping and systematic reviews in one app

Status (2026-10-12): steps 1–3 built (profiles, systematic type, type choice and rename to Review Studio), plus a first version of step 4 (help for the systematic stages) and 5 (a record-only synthesis stage). Meta-analysis is recorded, not computed.

## Idea

Each review gets a **review type**, stored in `review_state.json` as `"review_type": "scoping" | "systematic"`.
The type picks a *profile*: the guideline the review is reported to, the stage titles, the checklist, the
protocol sections and the words used on screen. All other code (searches, deduplication, screening, second
reviewer, full texts, Obsidian notes) stays shared.

- A review without `review_type` is a **scoping** review, so every existing folder opens unchanged.
- The type is chosen when a review is created. It can be changed until the protocol is locked; after that,
  changing it is an amendment and is written to the timeline.
- The app name becomes **Review Studio**. Each review shows its type and guideline, e.g.
  "Scoping review · reported to PRISMA-ScR" or "Systematic review · reported to PRISMA 2020".

## Where the two types differ

| | Scoping (current) | Systematic (new) |
|---|---|---|
| Reporting guideline | PRISMA-ScR (Tricco 2018), 20 + 2 optional items | PRISMA 2020 (Page 2021), 27 items, 42 with sub-items |
| Conduct guidance | JBI Manual (Peters et al.), Arksey & O'Malley, Levac | Cochrane Handbook, JBI Manual (systematic reviews) |
| Question framework | PCC (Population, Concept, Context) | PICO (Population, Intervention, Comparator, Outcome) or a variant (PECO, SPIDER) |
| Registration | Optional (OSF) | Strongly recommended (PROSPERO for health, OSF otherwise) |
| Screening by two people | Sample (≥ 20 %) with Cohen's κ | Both reviewers on **all** records is the standard; a sample is allowed but must be justified |
| Stage 12 | Data charting | Data extraction (same form and fields) |
| Stage 13 | Critical appraisal, optional | Risk of bias, **required** (e.g. RoB 2, ROBINS-I, JBI tools) |
| New stage | — | Synthesis and certainty: narrative synthesis or meta-analysis, heterogeneity, GRADE (PRISMA 2020 items 13, 15, 20–22) |
| Flow diagram words | records → sources of evidence | records → reports → studies (PRISMA 2020 template) |
| Report stage | PRISMA-ScR checklist | PRISMA 2020 checklist (+ PRISMA 2020 for Abstracts) |

## Keeping the folder format stable

- Stage **keys** stay the same in both types (`charting`, `appraisal`, …); only titles and help texts change.
  The new stage gets a new key (`synthesis`), which older versions of the app simply ignore.
- File names stay the same, except the checklist note: `14 - PRISMA-ScR checklist.md` (scoping) and
  `14 - PRISMA 2020 checklist.md` (systematic). `14 - PRISMA flow.md` is correct for both.
- Checklist ticks are stored per type (`checklist` keys such as `"13a"` for PRISMA 2020), so switching
  type before the lock does not mix them.

## Code changes

1. `src/domain/review-types.js` (new, pure data): one profile per type with `label`, `guideline`,
   `stages` (titles, descriptions, optional flags), `checklist`, `protocolSections`, `questionFramework`,
   `flowLabels`, `checklistFile`.
2. `src/domain/stages.js`: `STAGES`, `CHECKLIST` and `PROTOCOL_SECTIONS` become functions of the profile
   (`stagesFor(st)` etc.); `newState` takes the type; loading an old state sets `"scoping"`.
3. Callers (`progress.js`, `protocol.js`, `stage-notes.js`, `notes.js` flow note, `review-studio.js`) read
   the profile instead of the constants. Hard-coded "PRISMA-ScR n" texts move into the profile.
4. `web/help.json`: help texts per stage get a `systematic` variant where they differ; glossary gets
   PICO, Risk of bias, Meta-analysis, GRADE, PROSPERO, Data extraction.
5. UI: type choice in "New review"; type shown in the header; Settings lets you change it before the lock.
6. Claude skills: `review-chart-data` says "extract" for systematic reviews; a new skill for risk-of-bias
   suggestions can come later.
7. Tests: one old scoping folder still opens and writes the same files; a systematic review gets the
   PRISMA 2020 checklist, required appraisal and the synthesis stage.

## Order of work

1. Profiles + stages/checklist as functions, scoping profile only (no visible change; tests prove it).
2. Systematic profile: stages, PRISMA 2020 checklist, PICO, flow labels.
3. UI: type choice, header, rename to Review Studio.
4. Help texts and glossary.
5. Synthesis and certainty stage (the biggest new piece; it can ship after the rest).

## Open questions

- Should the systematic type also offer "rapid review" or "umbrella review" later, or stay with two types?
- Meta-analysis: only record what was done (method, software, results file), or compute effect sizes in the
  app? Recording only is much smaller and keeps the app a workbench, not a statistics package.
