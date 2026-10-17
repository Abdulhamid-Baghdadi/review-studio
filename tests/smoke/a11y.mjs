// The accessibility floor of docs/ui-ux-rules.md (group A), measured in the page: the checks of the UI audit of
// 17 October 2026 (docs/ui-audit-2026-10-17.md). `audit` runs inside the browser (page.evaluate) and returns one
// line per failure; `narrow` checks reflow at 400 px.

export function audit() {
  const fails = [];
  const visible = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && !el.closest("[hidden],[inert],[aria-hidden='true']"); };
  const describe = el => { const id = el.id ? `#${el.id}` : "", cls = typeof el.className === "string" && el.className.trim() ? `.${el.className.trim().split(/\s+/).join(".")}` : ""; return `<${el.tagName.toLowerCase()}${id}${cls}> "${(el.textContent || el.getAttribute("aria-label") || el.placeholder || "").trim().replace(/\s+/g, " ").slice(0, 40)}"`; };
  const add = (rule, el, detail = "") => fails.push(`${rule}: ${describe(el)}${detail ? ` (${detail})` : ""}`);

  // 1. contrast: the text colour against the background, blending every translucent layer up to the page
  // any CSS colour (rgb(), color(srgb …) from color-mix(), …) as [r, g, b, alpha] through a 1-pixel canvas
  const ctx = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d", { willReadFrequently: true });
  const parse = c => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = "#000"; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data; return [r, g, b, a / 255]; };
  const over = (top, under) => { const a = top[3]; return [0, 1, 2].map(i => top[i] * a + under[i] * (1 - a)).concat(1); };
  const background = el => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c[3] > 0) layers.push(c); if (c[3] >= 1) break; }
    let bg = layers.at(-1)?.[3] >= 1 ? layers.pop() : [255, 255, 255, 1];
    for (const l of layers.reverse()) bg = over(l, bg);
    return bg;
  };
  const lum = c => { const [r, g, b] = c.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    const el = n.parentElement;
    if (!n.textContent.trim() || !el || seen.has(el) || !visible(el) || ["SCRIPT", "STYLE", "OPTION"].includes(el.tagName)) continue;
    seen.add(el);
    const s = getComputedStyle(el);
    if (parseFloat(s.opacity) === 0 || el.closest("svg") || el.closest(":disabled")) continue;   // disabled controls are exempt (WCAG 1.4.3)
    const fg = parse(s.color), bg = background(el), r = ratio(over(fg, bg), bg);
    const size = parseFloat(s.fontSize), large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    if (r < (large ? 3 : 4.5) - 0.01) add("contrast", el, `${r.toFixed(2)}:1, ${size}px`);
  }

  // 2. targets at least 24 × 24, or with no other target within the 24 px square centred on them (WCAG 2.5.8)
  const targets = [...document.querySelectorAll("button, a[href], summary, input:not([type=hidden]), select, [role=button], [role=tab]")]
    .filter(el => visible(el) && !(el.tagName === "A" && getComputedStyle(el).display === "inline" && el.closest("p, li, td, .hint, .muted")));
  const boxes = targets.map(el => el.getBoundingClientRect());
  targets.forEach((el, i) => {
    const b = boxes[i];
    if (b.width >= 24 && b.height >= 24) return;
    if (["checkbox", "radio"].includes(el.type) && el.closest("label")) return;   // the label is the target
    const cx = b.left + b.width / 2, cy = b.top + b.height / 2, sq = { l: cx - 12, r: cx + 12, t: cy - 12, b: cy + 12 };
    const crowded = boxes.some((o, j) => j !== i && !targets[j].contains(el) && !el.contains(targets[j]) && o.left < sq.r && o.right > sq.l && o.top < sq.b && o.bottom > sq.t);
    if (crowded) add("target size", el, `${Math.round(b.width)}×${Math.round(b.height)}px`);
  });

  // 3. buttons, links and summaries have a name with a letter or digit
  const nameOf = el => {
    const by = el.getAttribute("aria-labelledby");
    if (by) return by.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? "").join(" ");
    return el.getAttribute("aria-label") || el.textContent || el.title || el.querySelector("img")?.alt || "";
  };
  for (const el of document.querySelectorAll("button, a[href], summary")) if (visible(el) && !/[\p{L}\p{N}]/u.test(nameOf(el))) add("no name", el);

  // 4. fields have a name that is not their placeholder
  for (const el of document.querySelectorAll("input:not([type=hidden]), select, textarea")) {
    if (!visible(el)) continue;
    const label = el.getAttribute("aria-labelledby") ? nameOf(el) : el.closest("label")?.textContent || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent) || el.getAttribute("aria-label") || "";
    if (!/[\p{L}\p{N}]/u.test(label)) add("field without a name", el);
    else if (/^\s*e\.g\./i.test(label)) add("field named by its placeholder", el);
  }

  // 5. segmented controls and tabs say which is on
  for (const el of document.querySelectorAll(".seg button, .tabs button")) if (visible(el) && !el.hasAttribute("aria-pressed")) add("toggle without aria-pressed", el);

  // 6. headings h1 → h2 → h3 with no skipped level
  let level = 0;
  for (const h of document.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    if (!visible(h)) continue;
    const l = Number(h.tagName[1]);
    if (l > level + 1) add("heading skips a level", h, `h${level || "-"} → h${l}`);
    level = l;
  }
  return fails;
}

// 7. reflow: at 400 px #main never scrolls sideways; a wide data table scrolls in its own box (.tbl-scroll)
export function narrow() {
  const main = document.querySelector("#main");
  if (!main || main.scrollWidth <= main.clientWidth + 1) return [];
  const edge = main.getBoundingClientRect().right + 1;
  const clipped = el => { for (let e = el.parentElement; e && e !== main; e = e.parentElement) if (getComputedStyle(e).overflowX !== "visible") return true; return false; };
  const wide = [...main.querySelectorAll("*")].filter(el => el.getBoundingClientRect().right > edge && !clipped(el));
  const cause = wide.slice(0, 3).map(e => `<${e.tagName.toLowerCase()}${e.className ? "." + String(e.className).split(" ")[0] : ""}>`).join(", ");
  return [`#main scrolls sideways at 400 px: ${main.scrollWidth} > ${main.clientWidth} (${cause || "cause not found"})`];
}
