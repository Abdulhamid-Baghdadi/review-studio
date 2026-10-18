/**
 * Steps an AI assistant may help with. Each review chooses a mode per step (default "off"); the skill
 * does the work and the review reports the choice in its protocol.
 * @module domain/ai-steps
 */
import { event, guardedChange } from "./stages.js";

/** @typedef {{key: string, label: string, description: string}} AiMode */

export const AI_STEPS = Object.freeze({
  screening: {
    skill: "review-screen-abstracts", skills: { "suggest-ft": "review-screen-fulltexts" },
    modes: [
      ["off", "Off", "You screen every record yourself."],
      ["suggest", "AI suggests", "The AI suggests a title/abstract decision per record. In the Suggested queue you read each record, then its suggestion under the abstract: Enter accepts it, I, U or E decides otherwise. Decisions are recorded as yours, noting whether you kept the suggestion."],
      ["suggest-ft", "AI suggests (+ full text)", "As 'AI suggests', and the AI also reads each retrieved full text and suggests a full-text decision with page locators; you review each one the same way in the Suggested queue of the Full text tab."],
    ],
    checks: ["Read each record before its suggestion; at full text, open the PDF of every suggested exclusion you are unsure about.",
      "Decide yourself (I, U or E) wherever you disagree; Z undoes your last decision.",
      "Report the AI assistance in the methods (PRISMA-ScR item 9, selection of sources of evidence)."],
  },
  reviewer: {
    skill: "review-second-reviewer",
    modes: [
      ["off", "Human", "A colleague fills the blind sheet."],
      ["ai", "AI as second reviewer", "The AI fills the blind sheet independently; κ is computed against your decisions. Report it as an AI second reviewer, not as a second person."],
    ],
    checks: ["Draw the sample and screen it yourself first; the AI sees only the blind sheet.",
      "Read every disagreement and settle it yourself.",
      "State in the report that the second reviewer was an AI, with model and date."],
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
  appraisal: {
    skill: "review-appraise-sources",
    modes: [
      ["off", "Off", "You rate every included source yourself."],
      ["suggest", "AI suggests", "The AI reads each full text with the tool you chose and suggests a rating with reasons and page locators; each stays 'suggested by AI' until you confirm or change it."],
    ],
    checks: ["Read the reasons and locators of every suggested rating in the PDF.",
      "Confirm or change each rating; an AI rating is never the final judgement.",
      "Report that an AI suggested ratings, with model and date, and that the reviewer judged each one."],
  },
});

/** The AI mode a review chose for a step ("off" by default). */
export const aiMode = (st, step) => (st.ai ?? {})[step] ?? "off";

/** The line to paste into Claude Code (or another agent that reads the skills). */
export function aiPrompt(reviewName, st, step) {
  const def = AI_STEPS[step], mode = aiMode(st, step);
  const names = [def.skill, ...Object.entries(def.skills ?? {}).filter(([m]) => m === mode).map(([, n]) => n)];
  return `Use the skill${names.length > 1 ? "s" : ""} ${names.join(" and ")} for the review "${reviewName}" (mode: ${mode}).`;
}

/** Chooses how the AI helps with a step: a method choice, so an amendment once the protocol is locked. */
export function setAiMode(st, step, mode, { reason = "", devMode = false, now }) {
  if (!AI_STEPS[step].modes.some(([m]) => m === mode)) throw new Error(`Unknown AI mode '${mode}' for ${step}.`);
  if (aiMode(st, step) === mode) return false;
  guardedChange(st, "ai", { ...(st.ai ?? {}), [step]: mode }, { reason, devMode, now });
  event(st, step, `AI assistance set to '${mode}'`, now);
  return true;
}
