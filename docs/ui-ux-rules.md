# UI and UX rules for Systematic Review Workbench

What makes an interface good or bad here, as rules that can be checked. Every rule names its source and how strong
the evidence behind it is, so a design argument can be settled by the evidence rather than by taste. The short
version is in `CLAUDE.md` ("UI and UX rules"); this file has the reasons, the sources and how to check each rule in
this app.

## How to use this file

- **Designing or changing a page:** read the groups that touch it, and check the change against every rule of the
  accessibility floor (group A).
- **Reviewing the app** (a UI audit): go through the pages one by one, note each rule broken, give it a severity and
  a fix. Audits go in `docs/ui-audit-<date>.md`.
- **When rules pull in different directions**, the order is: A (accessibility floor) → evidence level 1 → 2 → 3 → 4.
  A rule never justifies breaking the review-folder format or a reporting guideline.

### Evidence levels

| Level | Meaning | Examples |
|---|---|---|
| **1 · Law** | A quantitative effect replicated in controlled experiments | Fitts's law, Hick–Hyman law, working-memory limits, response-time limits, default effects |
| **2 · Standard** | An international standard built on research and consensus | WCAG 2.2, ISO 9241-110 / -11 / -112, ISO 24495-1 |
| **3 · Validated heuristic** | Expert principles that were tested against real usability problems or design practice | Nielsen's heuristics, Shneiderman's rules, Norman's principles, Amershi et al.'s human–AI guidelines |
| **4 · Convention** | Common practice with weak or mixed evidence; follow it unless there is a reason not to | Line length 45–90 characters, labels above fields, F-shaped scanning |

### Severity of a problem (Nielsen 1995)

| | Meaning | Rule of thumb here |
|---|---|---|
| **4** | Catastrophe: data loss, a wrong review result, or a task that cannot be done | Fix before the next push |
| **3** | Major: frequent, hard to get around, or breaks WCAG 2.2 AA | Fix soon |
| **2** | Minor: slows people down or confuses some | Fix when the page is next touched |
| **1** | Cosmetic | Fix when convenient |

Severity weighs how often it happens, how much it hurts when it does, and whether people can work around it.

## A · Accessibility floor (WCAG 2.2 AA): never broken

WCAG 2.2 (W3C Recommendation, 2023) is the legal and technical baseline (EN 301 549 in the EU). Level 2, and a hard
floor: no other rule outweighs it.

| ID | Rule | Source | How to check here |
|---|---|---|---|
| A1 | Text contrast ≥ 4.5:1 (≥ 3:1 for text ≥ 24 px, or ≥ 18.7 px bold), in light **and** dark | WCAG 1.4.3 | Compute it from the CSS tokens for every text-on-background pair, including pills, toasts and the colours used on hover |
| A2 | Contrast ≥ 3:1 for the parts of controls you need to see (borders of inputs, focus rings, chart lines, status dots) | WCAG 1.4.11 | Token pairs: `--border` on `--surface`, decision dots, focus ring |
| A3 | Colour is never the only carrier of meaning: add a word, an icon or a shape | WCAG 1.4.1 | Decision dots, include/exclude colours, chart series, "done" states |
| A4 | Everything works with the keyboard alone, without a keyboard trap | WCAG 2.1.1, 2.1.2 | Tab through every page; every clickable thing gets focus; Escape leaves dialogs |
| A5 | Keyboard focus is always visible and not hidden behind sticky bars or popups | WCAG 2.4.7, 2.4.11 | Tab under the sticky top bar; focus inside menus and the drawer |
| A6 | Focus moves in a meaningful order; a dialog takes focus when it opens, keeps it inside, and gives it back when it closes | WCAG 2.4.3; ARIA APG dialog pattern | `modal()`, the drawer, the pop-up menus, the tour |
| A7 | Every control has a name, a role and a state that assistive technology can read (buttons that toggle say so, tabs are tabs, dialogs are dialogs) | WCAG 4.1.2 | `aria-pressed` on segmented buttons, `role="tab"`/`aria-selected` on tabs, `role="dialog"`, `aria-modal` and a label on dialogs, names on icon-only buttons |
| A8 | Status messages (saved, errors, toasts, progress) are announced without moving focus | WCAG 4.1.3 | `#toasts` is a live region; the "✓ Saved" state is too |
| A9 | Click targets ≥ 24 × 24 CSS px, or enough space around them | WCAG 2.5.8 | Measure every clickable element on every page |
| A10 | Every form field has a visible label linked to it; a placeholder is not a label | WCAG 1.3.1, 2.4.6, 3.3.2 | Inputs without a `<label>`, `aria-label` or `aria-labelledby` |
| A11 | Errors say what is wrong and how to fix it, in text, next to the cause | WCAG 3.3.1, 3.3.3 | Validation messages, failed imports |
| A12 | Nothing important disappears on a timer; messages that need reading stay until dismissed | WCAG 2.2.1 | Error toasts, success messages with an undo |
| A13 | Single-letter shortcuts can be turned off, or only work while their area has focus | WCAG 2.1.4 | The global G, T, X, ? keys and the screening keys I/U/E |
| A14 | The page reflows at 320 CSS px wide and at 200 % zoom without losing content or needing sideways scrolling (tables excepted) | WCAG 1.4.4, 1.4.10 | Narrow window and Ctrl + `+` on every page |
| A15 | Motion can be avoided: `prefers-reduced-motion` stops non-essential animation; nothing flashes | WCAG 2.3.1, 2.3.3 | Glow animations, the homepage demo, the tour |
| A16 | Headings form an outline (one h1 per page, no skipped levels); landmarks name the regions | WCAG 1.3.1, 2.4.6 | Heading levels per page; `main`, `nav`, `header` |
| A17 | Help and navigation are in the same place on every page; the same function has the same name everywhere | WCAG 3.2.3, 3.2.4, 3.2.6 | Toolbar, map, help drawer |
| A18 | Never ask for the same information twice in one process | WCAG 3.3.7 | Review settings, export dialogs |

## B · Perception and layout

| ID | Rule | Why | Level | How to check here |
|---|---|---|---|---|
| B1 | Group by space and boundaries: related things close together, inside one region; unrelated things apart | Gestalt proximity and common region (Wertheimer 1923; Palmer 1992) | 1 | A button belongs visually to what it acts on; one card, one task |
| B2 | Things that look alike behave alike, and things that behave alike look alike | Gestalt similarity; Nielsen H4 | 1 / 3 | Every primary button looks the same; a link is never styled as a button that does something else |
| B3 | One visual entry point per area: one primary action per card or dialog; secondary actions are quieter | Visual hierarchy; Shneiderman et al. 2016; Nielsen H8 | 3 | Count `.btn.primary` per card |
| B4 | Show quantities by position and length first, angle and area later, colour last | Graphical perception ranking (Cleveland & McGill 1984) | 1 | PRISMA flow, forest and funnel plots, progress rings |
| B5 | Every mark in a chart carries data; remove decoration that doesn't | Data-ink ratio (Tufte 1983) | 3 | Charts in `ui/charts.js`, journey map |
| B6 | Body text is easy to read: 14–16 px, line height ≈ 1.5, lines of about 45–90 characters | Dyson 2004 (screen line length, mixed results); WCAG 1.4.12 | 4 | Abstract on the screening page, help drawer, report text |
| B7 | Put what matters first: people scan headings and the start of lines before they read | Eye-tracking of web reading (Nielsen 2006; Pernice 2017) | 4 | Card titles and the first words of each description say what the card is for |
| B8 | Don't make important content look like an advert or a banner: people learn to ignore those | Banner blindness (Benway & Lane 1998) | 3 | Callouts, coloured bars, the draft bar: used rarely, so they still get noticed |

## C · Memory and thinking

| ID | Rule | Why | Level | How to check here |
|---|---|---|---|---|
| C1 | Show options instead of asking people to remember them (codes, IDs, earlier answers) | Working memory holds about 4 chunks (Cowan 2001; Miller 1956); Nielsen H6 | 1 | Exclusion reasons shown with their text, not only E1/E2; the record you're on shows its decision history |
| C2 | Fewer, clearer choices per decision; a long list sorted or grouped so people can find their option | Choice time grows with the log of the number of options (Hick 1952; Hyman 1953) | 1 | Menus, settings, reason buttons (1–9) |
| C3 | Progressive disclosure: the basic task first, the rare options one click away | Cognitive load theory (Sweller 1988); Nielsen H8 | 1 / 3 | Advanced settings folded; details in the help drawer, not on the page |
| C4 | People act first and read later: put help where the action is, short and task-shaped | Paradox of the active user (Carroll & Rosson 1987); minimalist instruction (Carroll 1990) | 1 | Inline hints and worked examples beside fields; no long text above a form |
| C5 | Users always know where they are, what they can do here and what comes next | Information scent (Pirolli & Card 1999); Nielsen H1 | 1 / 3 | Map "You are here", page title, the next step named on each page |
| C6 | Keep the user's model and the app's model the same: the app says what it will do to the folder | Norman 2013 (conceptual models); ISO 9241-110 self-descriptiveness | 3 / 2 | "Saved in …" chips; buttons that write files say which |

## D · Movement and effort

| ID | Rule | Why | Level | How to check here |
|---|---|---|---|---|
| D1 | Frequent and important targets are big and near the pointer's path; small or far targets only for rare actions | Fitts's law (Fitts 1954; MacKenzie 1992) | 1 | Decision buttons large and next to the record; destructive buttons small and apart |
| D2 | Repeated work can be done from the keyboard, and the keys are shown on screen | Keystroke-level model (Card, Moran & Newell 1980); Shneiderman rule 2 | 1 / 3 | Screening I/U/E/1–9/←/→ shown as `kbd`; count keystrokes for screening one record |
| D3 | No mode errors: when the same key means different things, the mode is clearly visible | Sellen, Kurtenbach & Buxton 1992; Raskin 2000 | 1 | Title/abstract vs full text screening; developer mode; protocol locked |
| D4 | Dragging always has a click alternative | WCAG 2.5.7 | 2 | Drop zones (they open a file picker on click) |

## E · Time and feedback

| ID | Rule | Why | Level | How to check here |
|---|---|---|---|---|
| E1 | Respond within 0.1 s to every click (a pressed state, a change on screen) | Response-time limits (Miller 1968; Card, Robertson & Mackinlay 1991; Nielsen 1993) | 1 | Buttons change at once; screening moves on at once |
| E2 | Over 1 s: show that work is going on (busy button, spinner) | Same | 1 | Every `api()` call that can be slow |
| E3 | Over 10 s: show progress (how far, how much is left) and let people cancel | Same | 1 | OpenAlex searches, citation checks, PDF matching, export |
| E4 | Every action has visible feedback of its result, with the numbers ("8 added, 1 already in library") | Nielsen H1; Shneiderman rule 3 | 3 | Toasts after imports, exports, AI imports |
| E5 | Saving is visible and trustworthy: people can see that and when their work was saved | ISO 9241-110 controllability; Nielsen H1 | 2 / 3 | "✓ Saved" in the top bar; what happens when saving fails |

## F · Errors, control and undo

| ID | Rule | Why | Level | How to check here |
|---|---|---|---|---|
| F1 | Prevent errors before they happen: constraints, sensible defaults, disabled buttons that say why | Norman 1983 (slips and mistakes); Reason 1990; Nielsen H5 | 3 | Locked protocol asks for an amendment reason; a reason is needed for exclude |
| F2 | Prefer undo to confirmation. Confirm only what can't be undone, and then name the consequence and the count | Habituation to warnings (Bravo-Lillo et al. 2013; Anderson et al. 2016); Raskin 2000; Shneiderman rule 6 | 1 / 3 | `confirmBox` only for irreversible or bulk actions, with "N records" in the text; Undo after a decision |
| F3 | Confirmation buttons name the action ("Export 8 papers"), never "OK" or "Yes" | Nielsen H9; platform guidelines | 3 | `confirmBox` labels, `promptText` "OK" |
| F4 | Error messages in plain words: what happened, why, and what to do next; no codes or stack traces | Shneiderman 1982; Nielsen H9; WCAG 3.3.3 | 3 | Error toasts from `api()` |
| F5 | Defaults are the safe and common choice, because most people keep them | Default effect (Johnson & Goldstein 2003) | 1 | AI off by default; new review type; export status |
| F6 | Users can leave every state: Cancel, Escape, Back; nothing locks them in | Nielsen H3; ISO 9241-110 controllability | 3 / 2 | Modals, the tour, the drawer, wizards |

## G · Consistency and language

| ID | Rule | Why | Level | How to check here |
|---|---|---|---|---|
| G1 | Same word for the same thing everywhere; the same thing in the same place | Nielsen H4; ISO 9241-110 conformity with user expectations | 3 / 2 | Step names in the map, page titles, help and README agree |
| G2 | Use the reviewer's words: PRISMA, Cochrane and JBI terms (title/abstract, full text, amendment, κ), never code names (`ta_decision`, `r2_`) | Nielsen H2 (match the real world); ISO 9241-110 suitability for the task | 3 / 2 | Labels, toasts, help text |
| G3 | Plain language: short sentences, active voice, the action first | ISO 24495-1:2023 | 2 | Descriptions and help text |
| G4 | Follow platform conventions: links go somewhere, buttons do something, ✕ closes, Escape cancels | Norman 2013 (signifiers); Jakob's law (Nielsen 2000) | 3 | `<a>` vs `<button>`; icons used for one meaning only |
| G5 | Emoji and icons support a label, they don't replace it | WCAG 1.1.1; recognition over recall | 2 / 3 | Toolbar and menu items keep their words |

## H · AI assistance (human–AI interaction)

These matter here because AI suggestions feed screening decisions that end up in a published review.

| ID | Rule | Why | Level | How to check here |
|---|---|---|---|---|
| H1 | Make clear what the AI can do, and how well | Amershi et al. 2019, guidelines 1 and 2 | 3 | AI cards say what the step's AI does, and that it only suggests |
| H2 | Show why the AI suggested something (its reason, the passage, the page) | Amershi et al. 2019, guideline 11 | 3 | `ai_*_explanation` visible beside the suggestion |
| H3 | Accepting, correcting or ignoring a suggestion is quick | Amershi et al. 2019, guidelines 8 and 9 | 3 | One key accepts; a different decision is just the usual key |
| H4 | Guard against automation bias: where judgement must be independent, show the human's own view first, or hide the suggestion until they decide | Parasuraman & Manzey 2010; Goddard, Roudsari & Wyatt 2012 | 1 | The blind second reviewer never sees the first decision or the AI's; screening shows the record before the suggestion |
| H5 | Record who decided and how (by hand, a reviewed AI suggestion), and let people turn the AI off globally | Amershi et al. 2019, guidelines 16 and 17 | 3 | Decision log `how`; AI off by default per step |

## I · Honesty

| ID | Rule | Why | Level | How to check here |
|---|---|---|---|---|
| I1 | No dark patterns: no pre-ticked consent, no guilt-trip wording, no hiding the way out | Gray et al. 2018; Mathur et al. 2019 | 3 | Install offer, tour offer, AI switches |
| I2 | Looks don't make up for function: a beautiful page is judged easier than it is, so test the task, not the look | Aesthetic–usability effect (Kurosu & Kashimura 1995; Tractinsky, Katz & Ikar 2000) | 1 | Audits time real tasks |

## How to measure

- **Usability** is effectiveness, efficiency and satisfaction for given users, tasks and context (ISO 9241-11:2018).
  For this app the core tasks are: frame a question, write and run a search, import, screen 50 records, attach full
  texts, chart, and make the report.
- **Heuristic evaluation** against this file finds most problems with 3–5 evaluators (Nielsen & Molich 1990;
  Nielsen & Landauer 1993). Claude's audit is one evaluator: count it as such.
- **Think-aloud tests** with about 5 users per round find most problems that occur often (Nielsen & Landauer 1993);
  rarer problems need more users (Faulkner 2003).
- **SUS** (System Usability Scale; Brooke 1996): 10 questions after a task; 68 is average, above 80 is good
  (Bangor, Kortum & Miller 2008).
- **Measured checks** (automatic): contrast of every token pair, target sizes, names on controls, heading outline,
  keystrokes per screening decision, and time to respond. `npm run smoke` walks every page and can carry them.

## Sources

- Amershi, S., Weld, D., Vorvoreanu, M., et al. (2019). Guidelines for human–AI interaction. *CHI '19*.
- Anderson, B. B., Jenkins, J. L., Vance, A., Kirwan, C. B., & Eargle, D. (2016). Your memory is working against you: How eye tracking and memory explain habituation to security warnings. *Decision Support Systems*, 92, 3–13.
- Bangor, A., Kortum, P. T., & Miller, J. T. (2008). An empirical evaluation of the System Usability Scale. *International Journal of Human–Computer Interaction*, 24(6), 574–594.
- Benway, J. P., & Lane, D. M. (1998). Banner blindness: Web searchers often miss "obvious" links. *Internetworking*, 1(3).
- Bravo-Lillo, C., Komanduri, S., Cranor, L. F., et al. (2013). Your attention please: Designing security-decision UIs to make genuine risks harder to ignore. *SOUPS '13*.
- Brooke, J. (1996). SUS: A "quick and dirty" usability scale. In *Usability Evaluation in Industry*. Taylor & Francis.
- Card, S. K., Moran, T. P., & Newell, A. (1980). The keystroke-level model for user performance time with interactive systems. *Communications of the ACM*, 23(7), 396–410.
- Card, S. K., Robertson, G. G., & Mackinlay, J. D. (1991). The information visualizer, an information workspace. *CHI '91*.
- Carroll, J. M. (1990). *The Nurnberg Funnel: Designing Minimalist Instruction for Practical Computer Skill*. MIT Press.
- Carroll, J. M., & Rosson, M. B. (1987). Paradox of the active user. In *Interfacing Thought*. MIT Press.
- Cleveland, W. S., & McGill, R. (1984). Graphical perception. *Journal of the American Statistical Association*, 79(387), 531–554.
- Cowan, N. (2001). The magical number 4 in short-term memory. *Behavioral and Brain Sciences*, 24(1), 87–114.
- Dyson, M. C. (2004). How physical text layout affects reading from screen. *Behaviour & Information Technology*, 23(6), 377–393.
- Faulkner, L. (2003). Beyond the five-user assumption. *Behavior Research Methods*, 35(3), 379–383.
- Fitts, P. M. (1954). The information capacity of the human motor system in controlling the amplitude of movement. *Journal of Experimental Psychology*, 47(6), 381–391.
- Goddard, K., Roudsari, A., & Wyatt, J. C. (2012). Automation bias: A systematic review of frequency, effect mediators, and mitigators. *JAMIA*, 19(1), 121–127.
- Gray, C. M., Kou, Y., Battles, B., Hoggatt, J., & Toombs, A. L. (2018). The dark (patterns) side of UX design. *CHI '18*.
- Hick, W. E. (1952). On the rate of gain of information. *Quarterly Journal of Experimental Psychology*, 4(1), 11–26.
- Hyman, R. (1953). Stimulus information as a determinant of reaction time. *Journal of Experimental Psychology*, 45(3), 188–196.
- ISO 9241-11:2018. Ergonomics of human-system interaction — Usability: Definitions and concepts.
- ISO 9241-110:2020. Ergonomics of human-system interaction — Interaction principles.
- ISO 9241-112:2017. Ergonomics of human-system interaction — Principles for the presentation of information.
- ISO 24495-1:2023. Plain language — Governing principles and guidelines.
- Johnson, E. J., & Goldstein, D. (2003). Do defaults save lives? *Science*, 302(5649), 1338–1339.
- Kurosu, M., & Kashimura, K. (1995). Apparent usability vs. inherent usability. *CHI '95 Conference Companion*.
- MacKenzie, I. S. (1992). Fitts' law as a research and design tool in human–computer interaction. *Human–Computer Interaction*, 7(1), 91–139.
- Mathur, A., Acar, G., Friedman, M. J., et al. (2019). Dark patterns at scale. *Proceedings of the ACM on Human-Computer Interaction*, 3(CSCW).
- Miller, G. A. (1956). The magical number seven, plus or minus two. *Psychological Review*, 63(2), 81–97.
- Miller, R. B. (1968). Response time in man-computer conversational transactions. *AFIPS Fall Joint Computer Conference*, 267–277.
- Nielsen, J. (1993). *Usability Engineering*. Academic Press.
- Nielsen, J. (1994). Enhancing the explanatory power of usability heuristics. *CHI '94*. (The 10 heuristics, H1–H10.)
- Nielsen, J. (1995). Severity ratings for usability problems. Nielsen Norman Group.
- Nielsen, J. (2000). End of web design (Jakob's law). Nielsen Norman Group.
- Nielsen, J. (2006). F-shaped pattern for reading web content. Nielsen Norman Group; Pernice, K. (2017), update.
- Nielsen, J., & Landauer, T. K. (1993). A mathematical model of the finding of usability problems. *INTERCHI '93*, 206–213.
- Nielsen, J., & Molich, R. (1990). Heuristic evaluation of user interfaces. *CHI '90*, 249–256.
- Norman, D. A. (1983). Design rules based on analyses of human error. *Communications of the ACM*, 26(4), 254–258.
- Norman, D. A. (2013). *The Design of Everyday Things* (revised ed.). Basic Books.
- Palmer, S. E. (1992). Common region: A new principle of perceptual grouping. *Cognitive Psychology*, 24(3), 436–447.
- Parasuraman, R., & Manzey, D. H. (2010). Complacency and bias in human use of automation. *Human Factors*, 52(3), 381–410.
- Pirolli, P., & Card, S. (1999). Information foraging. *Psychological Review*, 106(4), 643–675.
- Raskin, J. (2000). *The Humane Interface*. Addison-Wesley.
- Reason, J. (1990). *Human Error*. Cambridge University Press.
- Sellen, A. J., Kurtenbach, G. P., & Buxton, W. A. S. (1992). The prevention of mode errors through sensory feedback. *Human–Computer Interaction*, 7(2), 141–164.
- Shneiderman, B. (1982). System message design: Guidelines and experimental results. In *Directions in Human/Computer Interaction*. Ablex.
- Shneiderman, B., Plaisant, C., Cohen, M., Jacobs, S., Elmqvist, N., & Diakopoulos, N. (2016). *Designing the User Interface* (6th ed.). Pearson. (The eight golden rules.)
- Sweller, J. (1988). Cognitive load during problem solving. *Cognitive Science*, 12(2), 257–285.
- Tractinsky, N., Katz, A. S., & Ikar, D. (2000). What is beautiful is usable. *Interacting with Computers*, 13(2), 127–145.
- Tufte, E. R. (1983). *The Visual Display of Quantitative Information*. Graphics Press.
- W3C (2023). *Web Content Accessibility Guidelines (WCAG) 2.2*. W3C Recommendation; ARIA Authoring Practices Guide (dialog, tabs, menu button patterns).
- Wertheimer, M. (1923). Untersuchungen zur Lehre von der Gestalt II. *Psychologische Forschung*, 4, 301–350.
