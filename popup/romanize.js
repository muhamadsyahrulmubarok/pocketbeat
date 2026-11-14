// PocketBeat - lyrics romanization (Korean and Japanese), fully offline.
//
// Korean: Hangul is phonetic, so it is converted with rules only: Revised
// Romanization plus the common sound changes (liaison, nasalization,
// aspiration, palatalization), e.g. 같이 -> gachi, 합니다 -> hamnida.
//
// Japanese: kana map directly, kanji need a dictionary. data/ja-readings.gz is
// a compact reading list built from JMdict and KANJIDIC2 (scripts/build-ja-dict.mjs):
// words, verb/adjective stems (so conjugated forms like 会いたくて work), and
// one fallback reading per kanji. Word boundaries come from the browser's
// built-in Intl.Segmenter. It is not perfect: kanji with several readings and
// names can come out wrong.

/* exported Romanize */
const Romanize = (() => {
  const HANGUL = /[가-힣]/;
  const KANA = /[ぁ-ゖァ-ヺ]/;
  const KANJI = /[㐀-䶿一-鿿豈-﫿々〆]/;
  const isKanji = (c) => !!c && KANJI.test(c);
  const isHiragana = (c) => !!c && c >= "ぁ" && c <= "ゖ";

  // Which romanizer a song needs: "ja" if it has any kana (Chinese has none),
  // else "ko" if it has Hangul, else null.
  function detect(text) {
    if (KANA.test(text)) return "ja";
    if (HANGUL.test(text)) return "ko";
    return null;
  }

  // ---------- KOREAN ----------
  // Jamo indexes follow Unicode: 19 initials (L), 21 vowels (V), 27 finals (T, 1-based).
  const L = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
  const V = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
  // Sound of each final before a consonant or at the end of a word.
  const T_SOUND = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t"];
  // Liaison before ㅇ: [final that stays (T index, 0 = none), consonant that moves (L index)].
  // A moved 11 (ㅇ) means the final is silent (ㅎ).
  const T_LIAISON = [null, [0, 0], [0, 1], [1, 9], [0, 2], [4, 12], [0, 2], [0, 3], [0, 5], [8, 0], [8, 6],
    [8, 7], [8, 9], [8, 16], [8, 17], [0, 5], [0, 6], [0, 7], [17, 9], [0, 9], [0, 10], null, [0, 12],
    [0, 14], [0, 15], [0, 16], [0, 17], [0, 11]];
  const NASAL = { k: "ng", t: "n", p: "m" };
  // ㄴ insertion in common compounds: 꽃잎 -> kkonnip, 한여름 -> hannyeoreum.
  const N_INSERT = new Set(["꽃잎", "뭇잎", "깻잎", "한여", "늦여", "첫여", "맨입", "담요", "솜이"]);

  function decompose(ch) {
    const code = ch.charCodeAt(0) - 0xac00;
    return { l: Math.floor(code / 588), v: Math.floor((code % 588) / 28), t: code % 28 };
  }

  function korean(text) {
    const chars = [...text];
    const syl = chars.map((c) => (HANGUL.test(c) ? decompose(c) : null));
    const liquid = new Set(); // syllables whose initial ㄹ reads "l" (after an l sound)
    for (let i = 0; i + 1 < chars.length; i++) {
      if (syl[i] && syl[i + 1]?.l === 11 && N_INSERT.has(chars[i] + chars[i + 1])) syl[i + 1].l = 2;
    }
    let out = "";
    for (let i = 0; i < chars.length; i++) {
      const s = syl[i];
      if (!s) {
        out += chars[i];
        continue;
      }
      out += (s.l === 5 && liquid.has(i) ? "l" : L[s.l]) + V[s.v];
      if (!s.t) continue;
      const n = syl[i + 1];
      let final = T_SOUND[s.t];
      if (n && n.l === 11 && s.t !== 21) {
        // Liaison: the final moves to the next syllable (한국어 -> hangugeo).
        const [kept, moved] = T_LIAISON[s.t];
        final = kept ? T_SOUND[kept] : "";
        n.l = moved;
        if (n.v === 20 && (s.t === 7 || s.t === 25 || s.t === 13)) n.l = s.t === 7 ? 12 : 14; // 같이 -> gachi
      } else if (n && s.t === 9 && n.l === 0) {
        final = "l"; // ㄺ before ㄱ reads l: 밝게 -> balge, 읽기 -> ilgi
      } else if (n && (s.t === 27 || s.t === 6 || s.t === 15)) {
        // Final ㅎ: aspirates ㄱ/ㄷ/ㅈ (좋다 -> jota), ㅅ -> ss, ㄴ -> nn.
        const rest = s.t === 6 ? "n" : s.t === 15 ? "l" : "";
        if (n.l === 0 || n.l === 3 || n.l === 12) n.l = { 0: 15, 3: 16, 12: 14 }[n.l];
        else if (n.l === 9) n.l = 10;
        final = n.l === 2 && !rest ? "n" : rest;
      } else if (n && n.l === 18 && "ktp".includes(final) && final) {
        // ㄱ/ㄷ/ㅂ/ㅈ + ㅎ -> k/t/p/ch (축하 -> chuka)
        n.l = s.t === 22 || s.t === 23 ? 14 : { k: 15, t: 16, p: 17 }[final];
        final = s.t === 9 || s.t === 11 ? "l" : "";
      } else if (n && (n.l === 2 || n.l === 6)) {
        // Nasalization: 합니다 -> hamnida, 국물 -> gungmul; ㄹ + ㄴ -> ll
        final = NASAL[final] || final;
        if (final === "l" && n.l === 2) {
          n.l = 5;
          liquid.add(i + 1);
        }
      } else if (n && n.l === 5) {
        if (final === "n" || final === "l") {
          final = "l"; // 신라 -> silla, 빨리 -> ppalli
          liquid.add(i + 1);
        } else {
          final = NASAL[final] || final; // 독립 -> dongnip, 종로 -> jongno
          n.l = 2;
        }
      }
      out += final;
    }
    return out;
  }

  // ---------- JAPANESE: kana -> romaji (Hepburn, no macrons) ----------
  const KANA_TABLE = {
    あ: "a", い: "i", う: "u", え: "e", お: "o", か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
    さ: "sa", し: "shi", す: "su", せ: "se", そ: "so", た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
    な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no", は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
    ま: "ma", み: "mi", む: "mu", め: "me", も: "mo", や: "ya", ゆ: "yu", よ: "yo",
    ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro", わ: "wa", ゐ: "i", ゑ: "e", を: "o", ん: "n",
    が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go", ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
    だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do", ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
    ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po", ゔ: "vu",
    ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o", ゃ: "ya", ゅ: "yu", ょ: "yo", ゎ: "wa", ゕ: "ka", ゖ: "ke",
  };
  const DIGRAPH = {
    きゃ: "kya", きゅ: "kyu", きょ: "kyo", しゃ: "sha", しゅ: "shu", しょ: "sho", ちゃ: "cha", ちゅ: "chu", ちょ: "cho",
    にゃ: "nya", にゅ: "nyu", にょ: "nyo", ひゃ: "hya", ひゅ: "hyu", ひょ: "hyo", みゃ: "mya", みゅ: "myu", みょ: "myo",
    りゃ: "rya", りゅ: "ryu", りょ: "ryo", ぎゃ: "gya", ぎゅ: "gyu", ぎょ: "gyo", じゃ: "ja", じゅ: "ju", じょ: "jo",
    ぢゃ: "ja", ぢゅ: "ju", ぢょ: "jo", びゃ: "bya", びゅ: "byu", びょ: "byo", ぴゃ: "pya", ぴゅ: "pyu", ぴょ: "pyo",
    // Loanword sounds (written in katakana)
    しぇ: "she", ちぇ: "che", じぇ: "je", てぃ: "ti", でぃ: "di", とぅ: "tu", どぅ: "du", ふぁ: "fa", ふぃ: "fi",
    ふぇ: "fe", ふぉ: "fo", うぃ: "wi", うぇ: "we", うぉ: "wo", ゔぁ: "va", ゔぃ: "vi", ゔぇ: "ve", ゔぉ: "vo",
    いぇ: "ye", つぁ: "tsa", つぇ: "tse", つぉ: "tso", てゅ: "tyu", でゅ: "dyu", ふゅ: "fyu",
  };
  const PUNCT = { "、": ",", "。": ".", "！": "!", "？": "?", "「": '"', "」": '"', "『": '"', "』": '"', "（": "(", "）": ")", "・": " ", "〜": "~", "～": "~", "…": "...", "　": " ", "：": ":", "；": ";" };

  const toHiragana = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

  function kanaToRomaji(kana) {
    const s = toHiragana(kana);
    let out = "";
    let geminate = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === "っ") {
        geminate = true;
        continue;
      }
      let r = DIGRAPH[c + (s[i + 1] || "")];
      if (r) i++;
      else if (c === "ー") r = out.slice(-1).match(/[aeiou]/) ? out.slice(-1) : "";
      else r = KANA_TABLE[c] ?? PUNCT[c] ?? fullWidth(c);
      if (geminate) {
        if (/^[a-z]/.test(r)) out += r.startsWith("ch") ? "t" : r[0];
        geminate = false;
      }
      out += r;
    }
    return out;
  }

  const fullWidth = (c) => (c >= "！" && c <= "～" ? String.fromCharCode(c.charCodeAt(0) - 0xfee0) : c);

  // ---------- JAPANESE: kanji -> kana with the compact dictionary ----------
  // Characters a verb/adjective stem may be followed by, per stem type.
  const STEM_NEXT = {
    1: "るれろよなまてたらずさられぬん",
    u: "わいうえおっ", k: "かきくけこいっ", s: "さしすせそ", t: "たちつてとっ", n: "なにぬねのん",
    b: "ばびぶべぼん", m: "まみむめもん", r: "らりるれろっ", g: "がぎぐげごい", a: "いくかけさすそき",
  };

  let dict = null; // { words: Map, stems: Map, kanji: Map, maxLen }

  function parseDictionary(text) {
    const words = new Map();
    const stems = new Map();
    const kanji = new Map();
    let section = "";
    let maxLen = 1;
    for (const line of text.split("\n")) {
      if (!line || line[0] === "#") continue;
      if (line.length === 1) {
        section = line;
        continue;
      }
      const f = line.split("\t");
      if (section === "W") {
        words.set(f[0], f[1]);
        maxLen = Math.max(maxLen, f[0].length);
      } else if (section === "S") {
        if (!stems.has(f[0])) stems.set(f[0], []);
        const list = stems.get(f[0]);
        if (f[1] === "1") list.push([f[1], f[2]]);
        else list.unshift([f[1], f[2]]); // godan/adjective stems first: 出せない -> dase, 出て -> de
        maxLen = Math.max(maxLen, f[0].length);
      } else if (section === "K") {
        // kun: ["まと.う", "まつ.わる", "まと"] -> [stem, okurigana]
        kanji.set(f[0], [f[1], f[2] ? f[2].split(",").map((k) => k.split(".")) : []]);
      }
    }
    return { words, stems, kanji, maxLen };
  }

  // Loads data/ja-readings.gz once (gzip, decompressed by the browser).
  let loading = null;
  function loadJapanese() {
    if (dict) return Promise.resolve();
    if (!loading) {
      loading = fetch(chrome.runtime.getURL("data/ja-readings.gz"))
        .then((res) => new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).text())
        .then((text) => {
          dict = parseDictionary(text);
        })
        .catch((err) => {
          loading = null;
          throw err;
        });
    }
    return loading;
  }

  // 来る changes its reading: 来る (ku), 来て/来た/来ます (ki), 来ない/来よう (ko).
  function kuruReading(next) {
    if (next === "る" || next === "れ") return "く";
    if ("ないよさ".includes(next || "")) return "こ";
    return "き";
  }

  // Kun reading whose okurigana fits the following text (纏う -> まと, not まつ).
  // The okurigana's last kana may change with conjugation, so it is not compared.
  function pickKun(kuns, after) {
    let best = null;
    for (const [stem, oku = ""] of kuns) {
      const fixed = oku.slice(0, -1);
      if (after.startsWith(fixed) && (!best || fixed.length > best.fixed.length)) best = { stem, fixed };
    }
    return best ? best.stem : kuns[0][0];
  }

  // A kanji the dictionary has no word for: on'yomi inside a compound,
  // kun'yomi when it stands alone before kana.
  function fallbackKanji(text, i, prevKana) {
    const c = text[i];
    if (c === "々") return prevKana;
    const entry = dict.kanji.get(c);
    if (!entry) return c;
    const [on, kuns] = entry;
    const inCompound = isKanji(text[i - 1]) || isKanji(text[i + 1]);
    if (!inCompound && isHiragana(text[i + 1]) && kuns.length) return pickKun(kuns, text.slice(i + 1, i + 6));
    return on || (kuns.length ? kuns[0][0] : c);
  }

  // Readings that depend on the neighbours of a lone kanji (one the dictionary
  // matched as a single-character word, or had no word for).
  // Suffixes read on'yomi after a kanji word: 代弁者 -> sha, 千年後 -> go.
  const SUFFIX = { 者: "しゃ", 後: "ご", 性: "せい", 的: "てき", 化: "か", 式: "しき", 員: "いん", 感: "かん", 界: "かい", 人: "じん", 年: "ねん", 製: "せい", 率: "りつ", 論: "ろん", 店: "てん", 際: "さい", 用: "よう", 中: "じゅう" };
  // Prefixes read on'yomi before a kanji word: 大迷惑 -> dai, 不安定 -> fu.
  const PREFIX = { 大: "だい", 小: "しょう", 全: "ぜん", 新: "しん", 再: "さい", 未: "み", 非: "ひ", 無: "む", 不: "ふ", 超: "ちょう", 最: "さい", 各: "かく", 総: "そう" };
  const I_ROW = "いきしちにひみりぎじびぴ";

  function contextReading(text, i, prevToken) {
    const c = text[i];
    const prev = text[i - 1];
    const next = text[i + 1];
    if (c === "達") return "たち";
    if (c === "何") return isKanji(next) || "だでのとてどんか".includes(next || "-") ? "なん" : "なに";
    if (c === "様" && "にのなだで".includes(next || "-")) return "よう"; // の様に -> no you ni
    if (c === "方") return prev && I_ROW.includes(prev) ? "かた" : "ほう"; // 生き方 -> kata, その方 -> hou
    if (SUFFIX[c] && prevToken && isKanji(prevToken.text[prevToken.text.length - 1])) return SUFFIX[c];
    if (PREFIX[c] && isKanji(next)) return PREFIX[c];
    return null;
  }

  // Splits a line into tokens { text, kana, start } using the longest dictionary
  // match. At equal length a verb/adjective stem followed by a valid ending wins
  // over a noun (会いたい is a-itai, not kai-itai).
  function kanjiToKana(text) {
    const tokens = [];
    let i = 0;
    while (i < text.length) {
      let match = null;
      // 来る as a verb (not inside a compound like 未来)
      if (text[i] === "来" && isHiragana(text[i + 1]) && !isKanji(text[i - 1])) match = { len: 1, kana: kuruReading(text[i + 1]) };
      for (let len = Math.min(dict.maxLen, text.length - i); len >= 1 && !match; len--) {
        const key = text.substr(i, len);
        if (!KANJI.test(key)) continue;
        const next = text[i + len];
        for (const [type, kana] of dict.stems.get(key) || []) {
          if (next && STEM_NEXT[type].includes(next)) {
            match = { len, kana };
            break;
          }
        }
        const word = !match && dict.words.get(key);
        if (word) match = { len, kana: word, word: true };
      }
      const prevToken = tokens[tokens.length - 1];
      if ((!match || (match.word && match.len === 1)) && isKanji(text[i])) {
        const kana = contextReading(text, i, prevToken);
        if (kana) match = { len: 1, kana };
      }
      if (match) {
        tokens.push({ text: text.substr(i, match.len), kana: match.kana, start: i });
        i += match.len;
      } else if (isKanji(text[i])) {
        tokens.push({ text: text[i], kana: fallbackKanji(text, i, prevToken ? prevToken.kana.slice(-2) : ""), start: i });
        i++;
      } else {
        tokens.push({ text: text[i], kana: text[i], start: i });
        i++;
      }
    }
    return tokens;
  }

  const PARTICLES = new Set(["は", "が", "を", "に", "で", "と", "も", "へ", "の", "や", "か", "ね", "よ", "な", "から", "まで", "より", "でも", "だけ", "しか", "けど", "のに", "ぞ", "ぜ", "わ", "さ"]);
  const PARTICLE_READING = { は: "wa", へ: "e", を: "o" };
  const segmenter = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter("ja", { granularity: "word" }) : null;
  const startsWord = (s) => /^[\u3400-\u9fff\u30a0-\u30ffA-Za-z0-9\uff10-\uff5a]/.test(s);
  const isPunct = (s) => /^[\s、。！？!?,.「」『』（）()・〜～…：；"']+$/.test(s);

  // Where to put spaces: before particles, before words that start with
  // kanji/katakana/latin, and before longer kana words (ありがとう, きっと).
  // Short kana pieces (okurigana, conjugations: て, いる, ない) stay attached.
  function wordStarts(text) {
    const starts = new Set();
    if (!segmenter) return starts;
    const segs = [...segmenter.segment(text)];
    segs.forEach((seg, k) => {
      if (k === 0 || isPunct(seg.segment)) return;
      const s = seg.segment;
      const prev = segs[k - 1].segment;
      const afterKanji = isKanji(prev[prev.length - 1]);
      if (isPunct(prev) || PARTICLES.has(s) || PARTICLES.has(prev) || startsWord(s) || (s.length >= 3 && !afterKanji)) {
        starts.add(seg.index);
      }
    });
    return starts;
  }

  function japanese(text) {
    if (!dict) return "";
    const tokens = kanjiToKana(text);
    const starts = wordStarts(text);
    const words = [];
    let cur = null;
    for (const t of tokens) {
      if (!cur || starts.has(t.start)) {
        cur = { text: "", kana: "" };
        words.push(cur);
      }
      cur.text += t.text;
      cur.kana += t.kana;
    }
    return words
      .map((w) => PARTICLE_READING[w.text] || kanaToRomaji(w.kana))
      .join(" ")
      .replace(/\s+([,.!?)])/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  function romanize(text, lang) {
    if (lang === "ko") return HANGUL.test(text) ? korean(text) : "";
    if (lang === "ja") return KANA.test(text) || KANJI.test(text) ? japanese(text) : "";
    return "";
  }

  return {
    detect,
    romanize,
    loadJapanese,
    korean,
    japanese,
    kanaToRomaji,
    // For tooling and tests (scripts/build-ja-dict.mjs).
    _setDictionary: (text) => (dict = parseDictionary(text)),
    _dictionary: () => dict,
    _kana: (text) => kanjiToKana(text).map((t) => t.kana).join(""),
  };
})();
