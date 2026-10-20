/**
 * The charting form: the data items every included paper is charted on (PRISMA-ScR 11). It is part of the plan, so
 * it is edited in Methods (after locking, a change is an amendment); Chart the data shows it read-only.
 * @module web/studio/pages/charting-form
 */
import { api } from "../core/api.js";
import { autoSave } from "../core/autosave.js";
import { h } from "../core/dom.js";
import { D, S } from "../core/state.js";
import { btn, card, iconBtn } from "../ui/components.js";

/** A charting field's name as words: "source_type" → "Source type" (the name itself stays the column and property). */
export const fieldLabel = name => { const t = String(name).replace(/_/g, " ").trim(); return t.charAt(0).toUpperCase() + t.slice(1); };

/** The editable form, one row per data item: its short name and what to record. */
export function chartingFormCard() {
  const fields = D.fields ??= S.state.charting.fields.map(f => ({ ...f }));
  const saver = autoSave("fields", () => api("save_fields", { fields }, { render: false, silent: true }), "charting");
  const list = h("div", { class: "stack" });
  const draw = () => list.replaceChildren(
    fields.length ? h("div", { class: "row small muted", style: "flex-wrap:nowrap;font-weight:600" },
      h("span", { style: "width:200px" }, "Field name"), h("span", {}, "What to record")) : null,
    ...fields.map((f, i) => h("div", { class: "row", style: "flex-wrap:nowrap" },
      h("input", { type: "text", value: f.name, placeholder: "field_name", "aria-label": `Field name ${i + 1}`, style: "max-width:200px;font-family:var(--mono)", oninput: e => f.name = e.target.value }),
      h("input", { type: "text", value: f.description, placeholder: "e.g. study design", "aria-label": `What to record, field ${i + 1}`, oninput: e => f.description = e.target.value }),
      iconBtn("✕", `Remove field ${i + 1}`, () => { fields.splice(i, 1); draw(); saver.schedule(); }))),
    btn("+ Add field", () => { fields.push({ name: "", description: "" }); draw(); list.querySelectorAll("input")[fields.length * 2 - 2]?.focus(); }, "sm"));
  draw();
  return saver.watch(card(`Data items (${S.review_type.refs.dataItems})`,
    "The form you fill in for every included paper in Chart the data: one field per thing to record. Plan it before you lock the protocol; after locking, a change is an amendment.",
    list, h("div", { class: "row end small muted", style: "margin-top:10px" }, "Saved as you type.")));
}
