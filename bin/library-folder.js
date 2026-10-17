/**
 * Where the command-line tools find the publication library, below the folder they run in (the Obsidian vault):
 * the notes are in "00 - Library/Publication Summary"; older vaults kept them in "00 - Library" itself, or in
 * "98 - Publications".
 * @module bin/library-folder
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

export const LIBRARY_FOLDERS = Object.freeze(["00 - Library/Publication Summary", "00 - Library", "98 - Publications"]);

/** The first of LIBRARY_FOLDERS that exists below `root`, as a full path; "" when there is none. */
export const findLibraryFolder = root => LIBRARY_FOLDERS.map(d => join(root, ...d.split("/"))).find(d => existsSync(d)) ?? "";
