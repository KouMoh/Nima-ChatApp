import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParseModule = require("pdf-parse");
import * as fs from "fs";

async function run() {
  fs.writeFileSync("dummy.pdf", "");
  // Wait I should make a real pdf to test
}
run();
