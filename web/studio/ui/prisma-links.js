/**
 * Every mention of a PRISMA reporting guideline (PRISMA-ScR, PRISMA-S, PRISMA 2020, and plain PRISMA) in the page links to the
 * guideline's own page, so its checklist is one click away. Text is linked as it appears, wherever it appears
 * (pages, Help, dialogs), except inside links, buttons, form fields, code and pictures.
 * @module web/studio/ui/prisma-links
 */

const PAGES = {
  "PRISMA-ScR": "https://www.prisma-statement.org/scoping",
  "PRISMA-S": "https://www.prisma-statement.org/prisma-search",
  "PRISMA 2020": "https://www.prisma-statement.org/prisma-2020",
  "PRISMA": "https://www.prisma-statement.org/scoping",     // plain "PRISMA" here (e.g. "PRISMA flow diagram") means PRISMA-ScR
};
const MENTION = /\bPRISMA(?:-ScR|-S\b| 2020)?(?![-\w])/g;
const SKIP = "a, button, input, textarea, select, option, code, pre, svg, script, style, [contenteditable], .code";

function linkText(node) {
  const text = node.nodeValue;
  if (!text.match(MENTION) || !node.parentElement || node.parentElement.closest(SKIP)) return;   // match(), not test(): no lastIndex left behind
  // a reference that already links to its source (a DOI) keeps that one link: no links inside a cited title
  if ([...node.parentElement.querySelectorAll(":scope > a")].some(a => !a.classList.contains("prisma-link"))) return;
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of text.matchAll(MENTION)) {
    frag.append(text.slice(last, m.index));
    const a = document.createElement("a");
    a.href = PAGES[m[0]]; a.target = "_blank"; a.rel = "noopener"; a.className = "prisma-link";
    a.title = `${m[0]}: the reporting guideline and its checklist (opens in a new tab)`;
    a.textContent = m[0];
    frag.append(a);
    last = m.index + m[0].length;
  }
  frag.append(text.slice(last));
  node.replaceWith(frag);
}

function linkIn(root) {
  if (root.nodeType === Node.TEXT_NODE) return linkText(root);
  if (root.nodeType !== Node.ELEMENT_NODE || root.closest(SKIP)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const found = [];
  while (walker.nextNode()) found.push(walker.currentNode);
  found.forEach(linkText);
}

/** Links the mentions already on the page and every one added later. */
export function linkPrismaMentions(root = document.body) {
  linkIn(root);
  new MutationObserver(changes => {
    for (const c of changes) {
      if (c.type === "characterData") linkText(c.target);
      else c.addedNodes.forEach(linkIn);
    }
  }).observe(root, { childList: true, subtree: true, characterData: true });
}
