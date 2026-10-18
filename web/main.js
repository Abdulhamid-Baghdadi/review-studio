/**
 * Start of Scoping Review Workbench in the browser: checks that the browser can open folders, creates the backend (the review
 * engine, src/ui/backend.js) with the help texts, templates, the worked example and pdf.js, and opens the draft
 * review, so the workspace is there straight away. The start screen is shown only when that fails.
 * @module web/main
 */
import * as pdfjs from "pdfjs";
import { Backend } from "../src/ui/backend.js";
import { openReview } from "./start/open-review.js";
import { showStartScreen, startSteps, unsupportedBrowser } from "./start/start-screen.js";

pdfjs.GlobalWorkerOptions.workerSrc = import.meta.resolve("pdfjs/worker");
startSteps();

if (!("showDirectoryPicker" in window)) {
  unsupportedBrowser();
  throw new Error("File System Access API not available");
}

const text = path => fetch(new URL(path, import.meta.url)).then(r => r.text());
window.backend = new Backend({
  help: await fetch(new URL("help.json", import.meta.url)).then(r => r.json()),
  templates: { record: await text("templates/Review Record Template.md"), publication: await text("templates/Publication Template.md") },
  example: async () => ({                         // the review as JSON; its full texts are separate files next to it
    ...(await fetch(new URL("example/example-review.json", import.meta.url)).then(r => r.json())),
    fetchLinked: path => fetch(new URL(`example/${path}`, import.meta.url)).then(r => { if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.arrayBuffer(); }),
  }),
  pdfjs,
});

openReview(await window.backend.draftEntry()).catch(showStartScreen);
