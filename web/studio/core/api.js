/**
 * Calls to the review engine: `window.backend` (src/ui/backend.js) answers the page instead of a server.
 * @module web/studio/core/api
 */
import { S, setS } from "./state.js";

export const backend = window.backend;

/**
 * What the calls need from the page, connected by app.js at start (core sits below the shell and the dialogs, so it
 * does not import them): redraw after the snapshot changed, show a message, ask for an amendment reason.
 */
export const view = {
  render() {}, renderChrome() {},
  toast(text, kind) {},
  promptText: async (title, message, placeholder, multiline, initial, ok) => null,
};

export async function getJSON(url) {
  return backend.get(url);
}

export async function api(action, args = {}, opts = {}) {
  const r = await backend.action(action, args);
  const j = r.body;
  if (r.status === 409 && j.amendment) {
    const reason = await view.promptText("Protocol is locked",
      `The protocol was registered on ${S.state.protocol.locked}. Changing the ${j.amendment} is a protocol amendment and will be listed in the timeline. Why is this change needed?`,
      "e.g. pilot showed that 'EEE' is a common synonym", true, "", "Record the amendment");
    if (!reason) throw new Error("cancelled");
    return api(action, { ...args, amendment: reason }, opts);
  }
  if (!r.ok) {
    if (!opts.quietError) view.toast(j.error || "That did not work, and no reason was given. Check that the review folder is still there and that the browser may still edit it (reopen it from the review menu), then try again.", "err");
    throw new Error(j.error || "error");
  }
  if (j.state) { setS(j.state); opts.render === false ? view.renderChrome() : view.render(); }
  if (j.message && !opts.silent) view.toast(j.message, "ok");
  return j;
}

export async function upload(file) {
  return backend.upload(file);
}
export const download = p => backend.download(p).catch(e => view.toast(e.message, "err"));

export async function busy(btn, fn) {
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spin"></span> ${old}`;
  try { return await fn(); } catch (e) { /* toast already shown */ } finally { btn.disabled = false; btn.innerHTML = old; }
}
