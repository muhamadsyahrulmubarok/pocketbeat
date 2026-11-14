// Builds the extension packages from the same source files:
//   dist/pocketbeat-<version>.zip          Chrome, Edge, and other Chromium browsers
//   dist/pocketbeat-<version>-firefox.zip  Firefox (only manifest.json differs)
// Dependency-free: a minimal ZIP writer on top of node:zlib.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = path.resolve(import.meta.dirname, "..");
const INCLUDE = ["LICENSE", "background", "offscreen", "popup", "icons", "data"];

// Firefox add-on id. Permanent once the add-on is signed by Mozilla: don't change it.
const GECKO_ID = "pocketbeat@muhamadsyahrulmubarok";

// Firefox runs background scripts in an event page instead of a service worker
// and has no offscreen API (the player lives in the background page there).
function firefoxManifest(manifest) {
  const rest = { ...manifest };
  delete rest.minimum_chrome_version;
  return {
    ...rest,
    permissions: manifest.permissions.filter((p) => p !== "offscreen"),
    background: { scripts: [manifest.background.service_worker] },
    browser_specific_settings: {
      gecko: {
        id: GECKO_ID,
        strict_min_version: "140.0",
        data_collection_permissions: { required: ["none"] },
      },
    },
  };
}

function listFiles(rel) {
  const abs = path.join(root, rel);
  if (fs.statSync(abs).isFile()) return [rel];
  return fs
    .readdirSync(abs)
    .sort()
    .flatMap((name) => listFiles(path.posix.join(rel, name)));
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

// entries: [{ name, data: Buffer }]
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const { time, day } = dosDateTime(new Date());

  for (const { name, data } of entries) {
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const crc = zlib.crc32(data);
    const nameBuf = Buffer.from(name, "utf8");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // flags: UTF-8 names
    local.writeUInt16LE(8, 8); // method: deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, deflated);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42); // local header offset
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + deflated.length;
  }

  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const files = INCLUDE.flatMap(listFiles).map((name) => ({ name, data: fs.readFileSync(path.join(root, name)) }));
const manifestEntry = (m) => ({ name: "manifest.json", data: Buffer.from(JSON.stringify(m, null, 2) + "\n") });

const builds = [
  [`pocketbeat-${manifest.version}.zip`, manifest],
  [`pocketbeat-${manifest.version}-firefox.zip`, firefoxManifest(manifest)],
];
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
for (const [name, m] of builds) {
  const entries = [manifestEntry(m), ...files];
  fs.writeFileSync(path.join(root, "dist", name), zip(entries));
  console.log(`wrote dist/${name} (${entries.length} files)`);
}
