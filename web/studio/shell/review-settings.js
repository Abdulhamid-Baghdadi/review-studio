/**
 * Review settings (⚙ Settings → Review settings…): initials, Obsidian vault and path, the library folder, the
 * publication template, the folder for exported PDFs and the status of exported papers. Saving goes through the
 * backend, which knows where each review keeps its settings.
 * @module web/studio/shell/review-settings
 */
import { backend, getJSON } from "../core/api.js";
import { h } from "../core/dom.js";
import { REVIEW, setS } from "../core/state.js";
import { btn } from "../ui/components.js";
import { render } from "./chrome.js";

export function openReviewSettings() {
  const entry = backend.entry;
  const s = { ...(entry.settings ?? {}) };
  const text = (value, placeholder, more = {}) => h("input", { type: "text", value, placeholder, ...more });
  const initials = text(s.reviewer ?? "", "e.g. AB", { maxLength: 12 });
  const vault = text(s.vault ?? "", "e.g. My research vault");
  const path = text((s.recordsPath ?? `${entry.name}/08 - Records`).replace(/\/08 - Records$/, ""), entry.name);
  const exportStatus = text(s.exportStatus ?? "", "the template's own value (e.g. quick review)");
  const lib = h("span", { class: "muted" }, s.library ? s.library.name : "none");
  const tpl = h("span", { class: "muted" }, s.publicationTemplate ? s.publicationTemplate.name : "the app's own");
  const pdfs = h("span", { class: "muted" }, s.libraryPdfs ? s.libraryPdfs.name : "a PDFs folder inside the library folder");
  const field = (label, input) => h("label", { class: "field" }, h("span", {}, label), input);
  const choice = (label, shown, choose, reset) => h("div", { class: "row" }, h("span", {}, label), shown, btn("Choose…", choose, "sm"), reset);

  const save = async () => {
    Object.assign(s, { exportStatus: exportStatus.value.trim(), reviewer: initials.value.trim(), vault: vault.value.trim(),
      recordsPath: `${path.value.trim() || entry.name}/08 - Records` });
    const { reload } = await backend.saveSettings(s);
    dialog.close();
    if (reload) location.reload();
    else { setS(await getJSON(`/api/state?review=${encodeURIComponent(REVIEW)}`)); render(); }   // the draft or the example
  };
  const dialog = h("dialog", { class: "modal" },
    h("div", { class: "mh" }, "Review settings"),
    h("div", { class: "mb stack" },
      field("Your initials (written with each of your decisions in the decision log)", initials),
      field("Obsidian vault name (to open notes in Obsidian)", vault),
      field("Path of this review folder inside the vault", path),
      choice("Library folder (publication notes): ", lib,
        async () => { s.library = await window.showDirectoryPicker({ id: "library", mode: "readwrite" }); lib.textContent = s.library.name; },
        btn("None", () => { delete s.library; lib.textContent = "none"; }, "sm ghost")),
      choice("Publication template (for notes exported to the library): ", tpl,
        async () => { [s.publicationTemplate] = await window.showOpenFilePicker({ id: "template", types: [{ description: "Markdown note", accept: { "text/markdown": [".md"] } }] }); tpl.textContent = s.publicationTemplate.name; },
        btn("Default", () => { delete s.publicationTemplate; tpl.textContent = "the app's own"; }, "sm ghost")),
      choice("Folder for the exported PDFs: ", pdfs,
        async () => { s.libraryPdfs = await window.showDirectoryPicker({ id: "library-pdfs", mode: "readwrite" }); pdfs.textContent = s.libraryPdfs.name; },
        btn("Default", () => { delete s.libraryPdfs; pdfs.textContent = "a PDFs folder inside the library folder"; }, "sm ghost")),
      field("Status of exported papers (the 'status' property of new library notes)", exportStatus)),
    h("div", { class: "mf" }, btn("Cancel", () => dialog.close(), ""), btn("Save", save, "primary")));
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}
