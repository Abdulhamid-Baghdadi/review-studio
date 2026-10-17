/**
 * The buttons and menus of the top bar.
 * @module web/studio/shell/toolbar
 */
import { $, singleKeys, store } from "../core/dom.js";
import { HOME, S } from "../core/state.js";
import { openChecklist, openClaudeGuide, openGlossary, openKeys, openTimeline } from "./help.js";
import { go } from "./navigation.js";
import { openReviewSettings } from "./review-settings.js";
import { openFinishedExample, openReviewType } from "./reviews.js";

// The review menu: opens on click, closes on Escape, outside click or after a choice
{
  const rb = $("#btnReview"), menu = $("#reviewMenu");
  const show = on => { menu.hidden = !on; rb.setAttribute("aria-expanded", on); if (on) menu.querySelector("button")?.focus(); };
  rb.onclick = e => { e.stopPropagation(); show(menu.hidden); };
  menu.addEventListener("click", () => show(false));
  document.addEventListener("click", e => { if (!menu.hidden && !menu.contains(e.target)) show(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !menu.hidden) { show(false); rb.focus(); } });
}
$("#btnTheme").onclick = () => { const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = t; store.set("theme", t); };
$("#btnGlossary").onclick = openGlossary;
$("#btnTypeMenu").onclick = openReviewType;
$("#btnClaude").onclick = openClaudeGuide;
$("#btnTimeline").onclick = openTimeline;
$("#btnType").onclick = openReviewType;
$("#btnKeys").onclick = openKeys;
const showSingleKeys = () => { const b = $("#btnSingleKeys"); b.textContent = `⌨ Single-key shortcuts: ${singleKeys.on() ? "on" : "off"}`; b.setAttribute("aria-pressed", String(singleKeys.on())); };
$("#btnSingleKeys").onclick = () => { singleKeys.set(!singleKeys.on()); showSingleKeys(); };
showSingleKeys();
$("#btnScr").onclick = () => openChecklist();
$("#btnHome").onclick = () => go(HOME);
$("#btnReviewSettings").onclick = openReviewSettings;
window.addEventListener("hashchange", () => { if (location.hash === "#example" && S) openFinishedExample(); });   // …/web/#example while the app is open
$("#main").addEventListener("scroll", () => $("#topwrap").classList.toggle("scrolled", $("#main").scrollTop > 4));

// Settings menu (theme, developer mode): opens on click, closes on Escape, outside click or after a choice
{
  const sb = $("#btnSettings"), menu = $("#settingsMenu");
  const show = on => { menu.hidden = !on; sb.setAttribute("aria-expanded", on); if (on) menu.querySelector("button").focus(); };
  sb.onclick = e => { e.stopPropagation(); show(menu.hidden); };
  menu.addEventListener("click", () => show(false));
  document.addEventListener("click", e => { if (!menu.hidden && !menu.contains(e.target)) show(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !menu.hidden) { show(false); sb.focus(); } });
}
