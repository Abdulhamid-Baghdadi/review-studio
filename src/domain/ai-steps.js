/**
 * Steps an AI assistant may help with. Each review chooses a mode per step (default "off"); the skill
 * does the work and the review reports the choice in its protocol.
 * @module domain/ai-steps
 */
import { event, guardedChange } from "./stages.js";

/** @typedef {{key: string, label: string, description: string}} AiMode */

export const AI_STEPS = Object.freeze({
  screening: {
    skill: "review-screen-abstracts",
    modes: [
      ["off", "Off", "You screen every record yourself."],
      ["suggest", "AI suggests", "The AI suggests a title/abstract decision per record. In the Suggested queue you read each record, then its suggestion under the abstract: Enter accepts it, I, U or E decides otherwise. Decisions are recorded as yours, noting whether you kept the suggestion."],
    ],
    checks: ["Read each record before its suggestion.",
      "Decide yourself (I, U or E) wherever you disagree; Z undoes your last decision.",
      "Report the AI assistance in the methods (PRISMA-ScR item 9, selection of sources of evidence)."],
  },
  // full-text screening: chosen on the Full texts page, once the PDFs are there (its timeline entries go to screening)
  fulltext: {
    skill: "review-screen-fulltexts", stage: "screening",
    modes: [
      ["off", "Off", "You read every full text and decide yourself."],
      ["suggest", "AI suggests", "The AI reads each attached full text and suggests a full-text decision with page numbers. In the Suggested queue you check each one: Enter accepts it, I or E decides otherwise."],
    ],
    checks: ["Open the PDF of every suggested exclusion you are unsure about, at the page given.",
      "Decide yourself (I or E) wherever you disagree; Z undoes your last decision.",
      "Report the AI assistance in the methods (PRISMA-ScR item 9, selection of sources of evidence)."],
  },
  retrieval: {
    skill: "review-fetch-fulltexts",
    modes: [
      ["off", "Off", "You find and attach every full text yourself."],
      ["assist", "AI fetches", "The AI looks for each full text (open access first, then your library access) and attaches the PDFs it finds; it never marks a paper as excluded."],
    ],
    checks: ["Open a few attached PDFs: right paper, complete, not a preprint you did not want.",
      "Records the AI could not get stay in the queue; try your library or mark them not retrieved."],
  },
  charting: {
    skill: "review-chart-data",
    modes: [
      ["off", "Off", "You fill the charting form yourself."],
      ["prefill", "AI prefills", "The AI fills empty charting fields from the full text, with page locators; each paper stays 'checked by AI' until you press Checked — next."],
    ],
    checks: ["Check every value against the page locator in the PDF.",
      "Press 'Checked — next' only after checking the whole paper."],
  },
});

/** The modes a review chose, with reviews from before the full-text split read as they were saved:
 * screening "suggest-ft" (titles and abstracts plus full texts) is screening "suggest" and fulltext "suggest". */
const chosen = st => {
  const ai = { ...(st.ai ?? {}) };
  if (ai.screening === "suggest-ft") { ai.screening = "suggest"; ai.fulltext ??= "suggest"; }
  return ai;
};
/** The AI mode a review chose for a step ("off" by default). */
export const aiMode = (st, step) => chosen(st)[step] ?? "off";

/** The line to paste into Claude Code (or another agent that reads the skills). */
export function aiPrompt(reviewName, st, step) {
  return `Use the skill ${AI_STEPS[step].skill} for the review "${reviewName}" (mode: ${aiMode(st, step)}).`;
}

/** Chooses how the AI helps with a step: a method choice, so an amendment once the protocol is locked. */
export function setAiMode(st, step, mode, { reason = "", devMode = false, now }) {
  if (!AI_STEPS[step].modes.some(([m]) => m === mode)) throw new Error(`Unknown AI mode '${mode}' for ${step}.`);
  if (aiMode(st, step) === mode) return false;
  guardedChange(st, "ai", { ...chosen(st), [step]: mode }, { reason, devMode, now });
  event(st, AI_STEPS[step].stage ?? step, `${step === "fulltext" ? "Full-text " : ""}AI assistance set to '${mode}'`, now);
  return true;
}
