// Sanity checks run in CI: the manifest is valid, versions agree, and every
// file the manifest and HTML pages reference actually exists.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const errors = [];
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));

const manifest = JSON.parse(read("manifest.json"));
const pkg = JSON.parse(read("package.json"));

if (manifest.manifest_version !== 3) errors.push("manifest_version must be 3");
if (manifest.version !== pkg.version) {
  errors.push(`manifest.json version (${manifest.version}) != package.json version (${pkg.version})`);
}

const referenced = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
  "offscreen/offscreen.html",
].filter(Boolean);

// Scripts and stylesheets referenced from the extension's HTML pages.
for (const page of ["popup/popup.html", "offscreen/offscreen.html"]) {
  const html = read(page);
  for (const [, ref] of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) {
    referenced.push(path.posix.join(path.posix.dirname(page), ref));
  }
}

for (const file of new Set(referenced)) {
  if (!exists(file)) errors.push(`missing file: ${file}`);
}

if (errors.length) {
  console.error("check failed:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log(`check ok: PocketBeat v${manifest.version}, ${new Set(referenced).size} referenced files present`);
