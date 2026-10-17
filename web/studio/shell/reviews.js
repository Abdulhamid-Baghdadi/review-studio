/**
 * Switching reviews: the draft, the finished example, saving a copy to a folder, the review type.
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

/** Switches the review to type `v` (asks first; after locking it is an amendment with a reason). */
async function switchReviewType(v) {
  if (v === S.review_type.key) return;
  const other = S.review_types.find(t => t.key === v);
  const msg = `Switch to a ${other.label.toLowerCase()} reported to ${other.guideline}? The stages, the question framework and the checklist change; nothing you entered is deleted.`;
  if (S.state.protocol.locked && !S.dev_mode) {
    const why = await promptText("Change the review type", msg + " The protocol is locked, so this is an amendment: give the reason.", "reason for the amendment");
    if (why) api("review_type", { type: v, amendment: why }).then(() => delete D.questions);
  } else if (await confirmBox("Change the review type", msg, "Switch")) api("review_type", { type: v }).then(() => delete D.questions);
}

/** Settings → Review type (and the top-bar button of a scoping review): shows the type and offers the other one. */
export async function openReviewType() {
  const rt = S.review_type;
  const v = await modal({ title: "Review type",
    body: h("p", { class: "muted" }, `This review is a ${rt.label.toLowerCase()}, reported to ${rt.guideline} (${rt.guidelineCitation}).`),
    buttons: [{ label: "Close", value: null }, ...S.review_types.filter(t => t.key !== rt.key)
      .map(t => ({ label: `Switch to ${t.label.toLowerCase()} · ${t.guideline}`, primary: true, value: t.key }))] });
  if (v) switchReviewType(v);
}

// The draft (a review in the browser's own storage, where the app starts): save it to a folder, or open one.
export function renderDraftBar() {
  const bar = $("#draftBar");
  bar.hidden = false;
  bar.classList.toggle("example", Boolean(backend.entry?.example));
  bar.replaceChildren(...[                                           // (replaceChildren would print an empty item as "null")
    backend.entry?.example ? h("span", { class: "example-badge", title: `Sit-stand desks and sitting at work: a real OpenAlex search (${S.flow.unique} records) screened down to ${S.flow.included} randomised trials, read in full, with risk of bias (RoB 2) and a meta-analysis. The open-access full texts come with it. Try anything: it is reset each time the example is opened.` }, "📘 Example · not kept") : null,
    backend.entry?.example ? btn("💾 Save a copy…", e => busy(e.currentTarget, saveExampleCopy), "sm ghost", "Copy the whole example review (notes and PDFs) into a folder on your PC, e.g. to open it in Obsidian") : null,
    backend.entry?.example ? btn("← My review", () => switchReview(S.reviews[0]), "sm primary", "Back to your own review") : null,
    h("span", { id: "saveState", class: "save-state " + SAVE_STATE[0], title: "Everything you type is saved by itself" }, SAVE_STATE[1])].filter(Boolean));
}

// Leaving the page: whatever is still waiting is saved first.
window.addEventListener("beforeunload", () => flushSaves());

export async function saveDraft() {
  const name = (await promptText("Save the draft", "Name of the review. A folder \"<name> records\" is made in the place you choose next.", "e.g. Repairability review"))?.trim();
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
    for (const k of Object.keys(D)) delete D[k];
    SC.id = null; SC.cache = {};
    if (CUR !== HOME && !S.stages.find(s => s.key === CUR)) setCur(HOME);
    render();
  } catch (e) { toast(e.message, "err"); }
}
