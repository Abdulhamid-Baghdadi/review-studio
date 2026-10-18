---
name: review-appraise-sources
description: Suggest critical-appraisal ratings for the included papers of a scoping review in Scoping Review Workbench (step Quality check), using the tool the reviewer chose. Use when the user asks to appraise or suggest quality ratings for included papers. The reviewer confirms every rating; this skill never decides.
---

# Suggest critical-appraisal ratings

You read each included paper with the appraisal tool the reviewer chose (for example MMAT, CASP or a JBI checklist) and suggest one overall rating with reasons and page locators. Each rating you write stays "suggested by AI" (`appraisal_by: AI`) until the reviewer confirms or changes it in Scoping Review Workbench. You never overwrite a rating already there, and `ai-assist.js` enforces that.

This is the optional critical appraisal of a scoping review (PRISMA-ScR items 12 and 16). The context output names the tool and the allowed ratings; use its words.

`--review` takes the review's name (e.g. `Project 2 review`) or the full path of its `<name> records` folder. When a name fits more than one folder (a review and its test copy), the command lists them. Ask the reviewer which one; never pick yourself.

## Steps

Run the commands from the Scoping Review Workbench folder (the project open in Claude Code).

1. **Get the next papers:**
   ```
   node bin/ai-assist.js --review "<review name or full path of its records folder>" context appraisal --limit 5
   ```
   - If AI assistance is **off**, stop and tell the user where to switch it on (Scoping Review Workbench, step Quality check, AI assistance card).
   - If no tool is chosen yet, stop and ask the reviewer to name it in the step Quality check (Approach). Don't choose one yourself.
   - The output has the review questions, the `tool`, the allowed `ratings`, and per paper its `pdf` path and `study_type` when it was charted.

2. **Read each PDF in full** and apply the tool as published:
   - Work through the tool's criteria (for MMAT: the two screening questions, then the five criteria for the paper's study design) and judge each one.
   - The overall rating follows the tool's own guidance; where the tool gives none, explain how you reached it. Use exactly one of the allowed `ratings`.
   - If the tool doesn't fit the paper's design, say so in the note and rate `unclear`. The reviewer may need a second tool.
   - No PDF → don't rate the paper; leave it for the reviewer.

3. **Write the ratings** to a JSON file in your scratch or temp folder. The `note` gives the reasons per criterion with page, section or table locators:
   ```json
   [{"id": "R0123", "rating": "moderate", "note": "Clear question and data (p. 2); sampling of the packs not explained (p. 4); measurements described in full (Table 2)"}]
   ```
   Then run:
   ```
   node bin/ai-assist.js --review "<review name or full path of its records folder>" appraise FILE.json --model "<your exact model id>"
   ```

4. **Report** how many papers you rated and which ones were hard to judge, and why. Remind the reviewer that every AI rating must be confirmed or changed in the step Quality check. The methods must say that an AI suggested ratings, with model and date.
