// Builds data/ja-readings.gz, the compact Japanese reading dictionary used to
// romanize lyrics. It keeps only what romanization needs from JMdict (common
// words) and KANJIDIC2: no meanings, no part-of-speech data beyond verb and
// adjective stems.
//
// Usage (JSON files from https://github.com/scriptin/jmdict-simplified/releases):
//   node scripts/build-ja-dict.mjs <jmdict-eng-common.json> <kanjidic2-en.json>
//
// The output is derived from JMdict and KANJIDIC2 by the Electronic Dictionary
// Research and Development Group, and is licensed CC BY-SA 4.0 (see data/README.md).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";

const [jmdictPath, kanjidicPath] = process.argv.slice(2);
if (!jmdictPath || !kanjidicPath) {
  console.error("usage: node scripts/build-ja-dict.mjs <jmdict-eng-common.json> <kanjidic2-en.json>");
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, "..");
const KANJI = /[㐀-䶿一-鿿豈-﫿々〆]/;
const toHiragana = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

// Verb/adjective stem types. The romanizer only uses a stem when the next
// character is one of the endings allowed for its type (see popup/romanize.js).
const GODAN_END = { u: "う", k: "く", s: "す", t: "つ", n: "ぬ", b: "ぶ", m: "む", r: "る", g: "ぐ" };

function stemType(pos) {
  if (pos.startsWith("v1")) return "1";
  if (pos === "adj-i") return "a";
  const m = pos.match(/^v5([uksntbmrg])/);
  if (m) return m[1];
  if (pos === "v5aru") return "r";
  return null;
}

// Kun readings per kanji (KANJIDIC2), to prefer the native reading for
// single-kanji words: 心 is usually こころ, 風 かぜ, 街 まち.
const kd = JSON.parse(fs.readFileSync(kanjidicPath, "utf8"));
const kunOf = new Map();
for (const c of kd.characters) {
  const readings = (c.readingMeaning?.groups || []).flatMap((g) => g.readings);
  kunOf.set(c.literal, new Set(readings.filter((r) => r.type === "ja_kun").map((r) => r.value.replace(/[-.]/g, ""))));
}

// Frequent in lyrics but missing from the common-word list.
const EXTRA_WORDS = { 実は: "じつわ", 嗚呼: "ああ", 貴方: "あなた", 貴女: "あなた", 何処: "どこ", 此処: "ここ", 其処: "そこ", 煌めき: "きらめき", 刹那: "せつな", 永久: "とわ", 運命: "うんめい" };

const jm = JSON.parse(fs.readFileSync(jmdictPath, "utf8"));
const words = new Map(); // key -> { reading, score }
const stems = new Map(); // `${key}\t${type}` -> { reading, score }

function offer(map, key, reading, score) {
  const cur = map.get(key);
  if (!cur || score > cur.score) map.set(key, { reading, score });
}

for (const w of jm.words) {
  const posList = [...new Set(w.sense.flatMap((s) => s.partOfSpeech))];
  for (const k of w.kanji) {
    if (!KANJI.test(k.text) || k.tags.includes("sK")) continue;
    if (/[はをへ]$/.test(k.text)) continue; // expressions like 今日は: the particle reading breaks normal text
    if (/^.の$/.test(k.text)) continue; // archaic 彼の (あの): normal text means kare no
    const r = w.kana.find(
      (r) =>
        !r.tags.includes("sk") &&
        !r.tags.includes("ok") &&
        (r.appliesToKanji.includes("*") || r.appliesToKanji.includes(k.text))
    );
    if (!r) continue;
    // Common forms win; between equally common entries (空: そら/から, 前: まえ/ぜん)
    // the one with more senses is usually the everyday reading.
    const senses = Math.min(w.sense.length, 50) / 100;
    // Single-kanji words: the kun reading wins (心 こころ, 街 まち); the on
    // readings are mostly suffixes, which the romanizer handles by context.
    const score =
      k.text.length === 1
        ? (r.common ? 1 : 0) + (kunOf.get(k.text)?.has(r.text) ? 1 : 0) + (k.common ? 0.5 : 0) + senses
        : (k.common ? 2 : 0) + (r.common ? 1 : 0) + senses;
    offer(words, k.text, r.text, score);

    for (const pos of posList) {
      const type = stemType(pos);
      if (!type) continue;
      const end = type === "1" ? "る" : type === "a" ? "い" : GODAN_END[type];
      if (!k.text.endsWith(end) || !r.text.endsWith(end)) continue;
      const key = k.text.slice(0, -1);
      if (!KANJI.test(key)) continue;
      offer(stems, `${key}\t${type}`, r.text.slice(0, -1), score);
    }
  }
}

for (const [key, reading] of Object.entries(EXTRA_WORDS)) if (!words.has(key)) words.set(key, { reading, score: 0 });

// Single-kanji fallback: the first on'yomi, and the kun'yomi with their
// okurigana ("まと.う") so the one matching the following kana can be chosen.
const kanji = [];
for (const c of kd.characters) {
  const m = c.misc || {};
  if (!m.grade && !m.frequency && !m.jlptLevel) continue; // keep the kanji in common use
  const readings = (c.readingMeaning?.groups || []).flatMap((g) => g.readings);
  const on = readings.find((r) => r.type === "ja_on")?.value;
  const kun = [...new Set(readings.filter((r) => r.type === "ja_kun" && !r.value.startsWith("-")).map((r) => r.value.replace(/-$/, "")))];
  if (!on && !kun.length) continue;
  kanji.push(`${c.literal}\t${on ? toHiragana(on) : ""}\t${kun.slice(0, 4).join(",")}`);
}

function serialize(wordEntries) {
  const lines = [
    "#PocketBeat ja-readings 1. Derived from JMdict and KANJIDIC2 (EDRDG), CC BY-SA 4.0.",
    "W",
    ...wordEntries.sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, reading]) => `${k}\t${reading}`),
    "S",
    ...[...stems].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}\t${v.reading}`),
    "K",
    ...kanji.sort(),
  ];
  return lines.join("\n") + "\n";
}

// Pruning: drop words that the romanizer already reads right without them
// (学生 = がく + せい from the per-kanji readings, 生まれる = the stem 生まれ + る).
// Shorter words are checked first, so each check sees the final state of every
// word it can use.
const ctx = { Intl, chrome: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "popup", "romanize.js"), "utf8") + "\n;globalThis.R = Romanize;", ctx);
const full = [...words].map(([k, v]) => [k, v.reading]);
ctx.R._setDictionary(serialize(full.slice()));
const live = ctx.R._dictionary().words;
let pruned = 0;
for (const [key, reading] of full.slice().sort(([a], [b]) => a.length - b.length)) {
  if (key.length < 2) continue;
  live.delete(key);
  // Checked alone and next to kana, since some rules look at the neighbours.
  const same = ["", "に", "を"].every((p) => ctx.R._kana(`の${key}${p}`) === `の${reading}${p}`) && ctx.R._kana(key) === reading;
  if (same) pruned++;
  else live.set(key, reading);
}

const text = serialize([...live]);
const gz = zlib.gzipSync(Buffer.from(text, "utf8"), { level: 9 });
const out = path.join(root, "data", "ja-readings.gz");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, gz);
console.log(
  `wrote data/ja-readings.gz: ${live.size} words (${pruned} more read right without an entry), ` +
    `${stems.size} stems, ${kanji.length} kanji; ` +
    `${(Buffer.byteLength(text) / 1024).toFixed(0)} KB text -> ${(gz.length / 1024).toFixed(0)} KB gzip`
);
