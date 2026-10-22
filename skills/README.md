# AI skills for Scoping Review Workbench

Each skill helps with one step of a scoping review. The AI only suggests: the reviewer confirms or changes every suggestion in Scoping Review Workbench, and each AI action is logged with the model and date.

| Skill | Step | What it does |
|---|---|---|
| [review-screen-abstracts](review-screen-abstracts/SKILL.md) | Screen papers → Titles & abstracts | Suggests title/abstract decisions with a reason |
| [review-screen-fulltexts](review-screen-fulltexts/SKILL.md) | Screen papers → Full texts | Reads each retrieved PDF against the eligibility criteria and suggests a decision |
| [review-fetch-fulltexts](review-fetch-fulltexts/SKILL.md) | Screen papers → Get full texts | Finds the PDFs (open access first) and attaches them |
| [review-chart-data](review-chart-data/SKILL.md) | Chart the data | Prefills the charting form from the full texts, with page locators |

## Using them

- **Claude Code:** open the app's folder as the project. The folder is a Claude Code plugin, `scoping-review-workbench` (`.claude-plugin/`): trust the folder and install the plugin when Claude Code asks. Then press **📋 Copy prompt** on a step's AI card and paste it.
- **Without the app's folder:** `claude plugin marketplace add Abdulhamid-Baghdadi/scoping-review-workbench`, then `claude plugin install scoping-review-workbench@scoping-review-workbench`.
- **Other assistants:** the skills are plain Markdown. Any assistant that can read files and run Node.js commands can follow them.

Every skill reads and writes through `node bin/ai-assist.js`, which refuses whenever the review has the AI switched off for that step and never sets a final decision.
