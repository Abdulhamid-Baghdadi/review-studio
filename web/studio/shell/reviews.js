/**
 * Switching reviews: the draft, the finished example, saving a copy to a folder.
 * @module web/studio/shell/reviews
 */
import { api, backend, busy, getJSON } from "../core/api.js";
import { flushSaves, SAVE_STATE } from "../core/autosave.js";
import { $, h, store } from "../core/dom.js";
import { CUR, D, HOME, S, SC, setCur, setReview, setS } from "../core/state.js";
import { render } from "./chrome.js";
import { go } from "./navigation.js";
import { btn } from "../ui/components.js";
import { confirmBox, modal, promptText, toast } from "../ui/dialogs.js";

export async function openFinishedExample() {
  const name = (S.reviews || []).find(r => r.startsWith("📘"));
  if (!name) return toast("The example is not available in this version.", "err");
  setCur("report");
  SC.filter = "all"; SC.stage = "ta";                      // a finished review: show every decision, not the empty to-do list
  await switchReview(name);
  go("report");
}

// The draft (a review in the browser's own storage, where the app starts): save it to a folder, or open one.
const lastFolder = () => { const n = store.get("last_folder_review", ""); return n && S.reviews?.includes(n) ? n : ""; };

export function renderDraftBar() {
  const bar = $("#draftBar");
  bar.hidden = false;
  bar.classList.toggle("example", Boolean(backend.entry?.example));
  bar.replaceChildren(...[                                           // (replaceChildren would print an empty item as "null")
    backend.entry?.example ? h("span", { class: "example-badge", title: `Design for disassembly of battery packs: a real OpenAlex search (${S.flow.unique} records) screened down to ${S.flow.included} papers, read in full and charted. The openly licensed full texts come with it. Try anything: it is reset each time the example is opened.` }, "📘 Example · not kept") : null,
    backend.entry?.example ? btn("💾 Save a copy…", e => busy(e.currentTarget, saveExampleCopy), "sm ghost", "Copy the whole example review (notes and PDFs) into a folder on your PC, e.g. to open it in Obsidian") : null,
    backend.entry?.example ? btn("← My review", () => switchReview(S.reviews[0]), "sm primary", "Back to your own review") : null,
    // after a reload the app starts in the draft: one click back to the review in a folder (the click also lets the
    // browser grant access to the folder again)
    backend.entry?.draft && lastFolder() ? btn(`↩ Back to ${lastFolder().replace(/ records$/, "")}`, () => switchReview(lastFolder()), "sm primary", "Open your review again: after a reload the app starts in the draft") : null,
    // a draft with work in it: say where it lives, and how to keep it (a browser can clear its own storage)
    backend.entry?.draft && (S.events.length || S.records.length) ? h("span", { class: "small muted" }, "This draft is only in this browser.") : null,
    backend.entry?.draft && (S.events.length || S.records.length) ? btn("💾 Save to a folder…", saveDraft, "sm", "Save the review as a folder of notes on your PC (it can then open in Obsidian too); a browser can clear its own storage") : null,
    h("span", { id: "saveState", class: "save-state " + SAVE_STATE[0], title: "Everything you type is saved by itself" }, SAVE_STATE[1])].filter(Boolean));
}

// Leaving the page: whatever is still waiting is saved first.
window.addEventListener("beforeunload", () => flushSaves());

export async function saveDraft() {
  const name = (await promptText("Save the draft", "Name of the review. A folder \"<name> records\" is made in the place you choose next.", "e.g. Repairability review", false, "", "Choose where to save…"))?.trim();
  if (!name) return;
  try {
    const entry = await backend.saveDraft(name);
    await switchReview(entry.name);
    toast(`Saved: ${entry.name}. From now on every change is written there.`, "ok");
  } catch (e) { if (e.name !== "AbortError") toast(e.message, "err"); }
}

// The finished example, copied to a folder of the user's choice: plain notes and PDFs, ready for Obsidian.
async function saveExampleCopy() {
  try {
    const entry = await backend.saveExampleCopy();
    await switchReview(entry.name);
    toast(`Copied: "${entry.name}" in the folder you chose. Open that folder in Obsidian (Open folder as vault) to browse the notes. Changes you make here are now kept.`, "ok");
  } catch (e) { if (e.name !== "AbortError") toast(e.message, "err"); }
}

export async function openReviewFolder() {
  try {
    const entry = await backend.pickFolder();
    await backend.open(entry);
    switchReview(entry.name);
  } catch (err) { if (err.name !== "AbortError") toast(err.message, "err"); }
}

export async function switchReview(name) {
  flushSaves();
  try {
    setS(await getJSON(`/api/state?review=${encodeURIComponent(name)}`));
    setReview(name); store.set("review", name);
    // the last review in a folder: after a reload the app starts in the draft, and the draft bar offers the way back
    if (backend.entry?.draft) store.set("last_folder_review", "");
    else if (!backend.entry?.example) store.set("last_folder_review", name);
    for (const k of Object.keys(D)) delete D[k];
    SC.id = null; SC.cache = {};
    if (CUR !== HOME && !S.stages.find(s => s.key === CUR)) setCur(HOME);
    render();
  } catch (e) { toast(e.message, "err"); }
}
