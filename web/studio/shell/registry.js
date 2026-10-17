/**
 * The pages. Each module in pages/ adds itself here under its stage key, so the shell can draw a page without
 * knowing the pages (they depend on the shell, never the other way round):
 *
 *   PAGES.screening = () => element          the page's content, drawn by render()
 *   PAGE_KEYS.screening = (event, typing) => true when the page handled the key (shell/keyboard.js asks it first)
 *
 * @module web/studio/shell/registry
 */
export const PAGES = {};
export const PAGE_KEYS = {};
