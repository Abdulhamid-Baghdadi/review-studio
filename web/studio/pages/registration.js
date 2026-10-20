/**
 * Page: Registration.
 * @module web/studio/pages/registration
 */
import { api, busy } from "../core/api.js";
import { h } from "../core/dom.js";
import { S } from "../core/state.js";
import { lockReadiness } from "./protocol.js";
import { PAGES } from "../shell/registry.js";
import { btn, card, field, openNote, pill } from "../ui/components.js";
import { confirmBox } from "../ui/dialogs.js";

PAGES.registration = () => {
  const p = S.state.protocol;
  const reg = h("input", { type: "text", placeholder: "OSF DOI or URL (optional)" });
  return h("div", {},
    p.locked ? h("div", { class: "card", style: "border-left:4px solid var(--ok)" },
      h("h2", {}, "🔒 Protocol locked on " + p.locked),
      h("p", { class: "sub" }, `Frozen copy: ${p.file}`),
      h("div", { class: "row" }, pill(p.registration ? "Registration: " + p.registration : "No public registration", p.registration ? "ok" : ""),
        p.commit ? pill("Git commit " + p.commit.slice(0, 10), "ok") : null,   // reviews locked by an older version
        btn("Open frozen protocol", () => openNote(p.file), "sm")))
      : lockReadiness(),
    p.locked ? null : card("Lock the protocol", "Do this before the final database searches. Afterwards, every change to the questions, keyword blocks, search strings, inclusion and exclusion rules, method sections or charting fields asks for an amendment reason.",
        field("Registration", reg, "Public registration is optional for scoping reviews. PROSPERO does not accept them; OSF Registries does."),
        h("p", { class: "small muted", style: "margin:10px 0 0" }, "Locking saves a frozen copy of the protocol with its date and a fingerprint (SHA-256), so any later edit to it shows. If the review folder is in git (e.g. Obsidian Git), a commit after locking also proves the date to others."),
        h("div", { class: "row end", style: "margin-top:12px" }, btn("🔒 Lock protocol…", async e => {
          const open = S.lock_checks.filter(c => c.required && !c.ok);
          if (open.length && !(await confirmBox("Not ready yet", `${open.length} required check(s) are still open: ${open.map(c => c.label).join("; ")}. Lock anyway? This is reported in the timeline.`, "Lock anyway", true))) return;
          if (await confirmBox("Lock the protocol?", "This freezes the protocol. It cannot be undone — only amended with a reason.", "Lock protocol"))
            busy(e.target, () => api("lock_protocol", { registration: reg.value }));
        }, "primary"))),
    card("Amendments", "Changes made after locking, with their reasons. They are reported in the manuscript.",
      S.state.amendments.length ? h("div", { class: "tl" }, S.state.amendments.map(a => h("div", { class: "ev" }, h("div", { class: "when" }, `${a.when} · ${a.what}`), a.reason)))
        : h("div", { class: "empty" }, "No amendments.")));
};
