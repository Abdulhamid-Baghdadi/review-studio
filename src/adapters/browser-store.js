/**
 * The reviews this browser opened before: folder handles and their settings, kept in IndexedDB so that the
 * start screen can offer them again (the browser still asks once per visit for access).
 * @module adapters/browser-store
 */

const DB = "prisma-studio", STORE = "reviews";    // the old app name, kept: browsers keep the remembered reviews under it

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * @typedef {object} SavedReview
 * @property {string} id
 * @property {FileSystemDirectoryHandle} handle the review folder
 * @property {string} name
 * @property {number} opened when it was last opened (ms)
 * @property {object} settings recordsPath, Obsidian vault name, library handle…
 */

/** Recent reviews, most recently opened first. @returns {Promise<SavedReview[]>} */
export const recentReviews = async () => ((await run("readonly", s => s.getAll())) ?? []).filter(r => r.handle).sort((a, b) => b.opened - a.opened);

/** Adds or updates a review (matched by its folder handle). @returns {Promise<SavedReview>} */
export async function rememberReview(handle, settings = {}) {
  let entry = null;
  for (const r of await recentReviews()) if (await r.handle.isSameEntry(handle)) entry = r;
  entry = { id: entry?.id ?? crypto.randomUUID(), handle, name: handle.name, opened: Date.now(), settings: { ...(entry?.settings ?? {}), ...settings } };
  await run("readwrite", s => s.put(entry));
  return entry;
}

/**
 * Settings of the reviews that have no folder of their own (the draft, the finished example), kept under
 * "settings:<id>" so that they survive reopening. @returns {Promise<object>}
 */
export const fixedSettings = async id => (await run("readonly", s => s.get(`settings:${id}`)))?.settings ?? {};
export const rememberFixedSettings = (id, settings) => run("readwrite", s => s.put({ id: `settings:${id}`, settings }));

export const getReview = id => run("readonly", s => s.get(id));
export const forgetReview = id => run("readwrite", s => s.delete(id));
