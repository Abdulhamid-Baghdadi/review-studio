/**
 * "Your review is a folder" on the Homepage: the pictures of web/art/folder-pictures.js (shared with the start screen).
 * @module web/studio/ui/folder-strip
 */
import { h } from "../core/dom.js";
import { folderStripHtml } from "../../art/folder-pictures.js";

/** The strip: a folder on your PC → every paper a note → the folder in Obsidian. */
export const folderStrip = () => h("div", { html: folderStripHtml() }).firstElementChild;
