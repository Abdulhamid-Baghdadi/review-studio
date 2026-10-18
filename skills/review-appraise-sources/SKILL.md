---
name: review-appraise-sources
description: Suggest risk-of-bias judgements (systematic review) or critical-appraisal ratings (scoping review) for the included papers of a review in Systematic Review Workbench (step Quality check / Risk of bias), using the tool the reviewer chose. Use when the user asks to appraise, assess risk of bias, or suggest quality ratings for included papers. The reviewer confirms every rating; this skill never decides.
---

# Suggest appraisal or risk-of-bias ratings

You read each included paper with the appraisal tool the reviewer chose (for example RoB 2, ROBINS-I, a JBI checklist or MMAT) and suggest one overall rating with reasons and page locators. Each rating you write stays "suggested by AI" (`appraisal_by: AI`) until the reviewer confirms or changes it in Systematic Review Workbench. You never overwrite a rating already there, and `ai-assist.js` enforces that.

In a **systematic review** this is the risk-of-bias assessment (PRISMA 2020 items 11 and 18). In a **scoping review** it is the optional critical appraisal (PRISMA-ScR items 12 and 16). The context output names the review type, the tool and the allowed ratings; use its words.

`--review` takes the review's name (e.g. `Project 2 review`) or the full path of its `<name> records` folder. When a name fits more than one folder (a review and its test copy), the command lists them. Ask the reviewer which one; never pick yourself.

## Steps

Run the commands from the Systematic Review Workbench folder (the project open in Claude Code).

1. **Get the next papers:**
   ```
   node bin/ai-assist.js --review "<review name or full path of its records folder>" context appraisal --limit 5
   ```
   - If AI assistance is **off**, stop and tell the user where to switch it on (Systematic Review Workbench, step Quality check / Risk of bias, AI assistance card).
   - If no tool is chosen yet, stop and ask the reviewer to name it in the step Quality check / Risk of bias (Approach). Don't choose one yourself.
   - The output has the review questions, the `tool`, the allowed `ratings`, and per paper its `pdf` path and `study_type` when it was charted.

2. **Read each PDF in full** and apply the tool as published:
   - Work through the tool's domains (for RoB 2: randomisation, deviations from intended interventions, missing outcome data, outcome measurement, selection of the reported result) and judge each one.
   - The overall rating follows the tool's own rule (for RoB 2, the worst domain). Use exactly one of the allowed `ratings`.
   - If the tool doesn't fit the paper's design, say so in the note and rate `unclear`. The reviewer may need a second tool.
   - No PDF → don't rate the paper; leave it for the reviewer.

3. **Write the ratings** to a JSON file in your scratch or temp folder. The `note` gives the reasons per domain with page, section or table locators:
   ```json
   [{"id": "R0123", "rating": "some concerns", "note": "D1 low (p. 3, block randomisation); D2 some concerns: deviations not reported (p. 5); D3–D5 low (Table 2)"}]
   ```
   Then run:
   ```
   node bin/ai-assist.js --review "<review name or full path of its records folder>" appraise FILE.json --model "<your exact model id>"
   ```

4. **Report** how many papers you rated and which ones were hard to judge, and why. Remind the reviewer that every AI rating must be confirmed or changed in the step Quality check / Risk of bias. The methods must say that an AI suggested ratings, with model and date.
