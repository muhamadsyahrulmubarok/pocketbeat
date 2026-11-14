// Unit tests for popup/romanize.js (run by `npm test`). The Japanese cases are
// sentences written for these tests, not song lyrics.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";

const root = path.resolve(import.meta.dirname, "..");
const ctx = { Intl, chrome: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "popup", "romanize.js"), "utf8") + "\n;globalThis.R = Romanize;", ctx);
ctx.R._setDictionary(zlib.gunzipSync(fs.readFileSync(path.join(root, "data", "ja-readings.gz"))).toString("utf8"));
const R = ctx.R;

const korean = {
  사랑해: "saranghae", 같이: "gachi", 합니다: "hamnida", 없어: "eopseo", 있어: "isseo", 좋아: "joa",
  좋다: "jota", 한국어: "hangugeo", 신라: "silla", 빨리: "ppalli", 국물: "gungmul", 독립: "dongnip",
  읽어: "ilgeo", 싫어: "sireo", 괜찮아: "gwaenchana", 몰라: "molla", 맛있어: "masisseo", 백년: "baengnyeon",
  축하해: "chukahae", 좋습니다: "josseumnida", 종로: "jongno", 설날: "seollal", "보고 싶어": "bogo sipeo",
  감사합니다: "gamsahamnida", "넌 내 거야": "neon nae geoya",
  밝게: "balge", 읽기: "ilgi", 꽃잎은: "kkonnipeun", 한여름: "hannyeoreum", 나뭇잎: "namunnip", 끝이: "kkeuchi",
  솔직히: "soljiki", 빛나고: "binnago", 젖는다: "jeonneunda", 몰랐던: "mollatdeon", 않고: "anko", 닿을: "daeul",
};

const japanese = {
  今日も君に会いたくて走り出した: "kyou mo kimi ni aitakute hashiridashita",
  東京の空はきれいだ: "toukyou no sora wa kireida",
  心の中で叫んでいる: "kokoro no naka de sakendeiru",
  明日へ向かって歩いていこう: "ashita e mukatte aruiteikou",
  夜空に輝く星を見ていた: "yozora ni kagayaku hoshi o miteita",
  コーヒーを飲みながら待ってる: "koohii o nomi nagara matteru",
  俺達の街に風が吹く: "ore tachi no machi ni kaze ga fuku",
  何枚も描いた: "nan mai mo egaita",
  纏う光: "matou hikari",
  "ありがとう、また会おうね": "arigatou, mata aou ne",
};

const failures = [];
for (const [input, want] of Object.entries(korean)) {
  const got = R.korean(input);
  if (got !== want) failures.push(`ko ${input}: got "${got}", want "${want}"`);
}
for (const [input, want] of Object.entries(japanese)) {
  const got = R.japanese(input);
  if (got !== want) failures.push(`ja ${input}: got "${got}", want "${want}"`);
}
const detect = [R.detect("こんにちは"), R.detect("안녕"), R.detect("Hello"), R.detect("你好世界")];
if (detect.join(",") !== "ja,ko,,") failures.push(`detect: got ${JSON.stringify(detect)}`);

if (failures.length) {
  console.error("romanize tests failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`romanize ok: ${Object.keys(korean).length} Korean, ${Object.keys(japanese).length} Japanese cases`);
