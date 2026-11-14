# data/

## ja-readings.gz

A compact Japanese reading dictionary (about 130 KB, gzip) used by `popup/romanize.js` to romanize
Japanese lyrics when the **Romanized** option is on. It holds only what romanization needs:

- common words with their readings, minus the words the romanizer already reads right without an entry
- verb and adjective stems, so conjugated forms (会いたくて) are read right
- one on'yomi and a few kun'yomi per common kanji, as a fallback

It is generated, not edited by hand:

```bash
node scripts/build-ja-dict.mjs <jmdict-eng-common.json> <kanjidic2-en.json>
```

The JSON files come from the [jmdict-simplified releases](https://github.com/scriptin/jmdict-simplified/releases)
(`jmdict-eng-common-*.json` and `kanjidic2-en-*.json`).

### License

`ja-readings.gz` is derived from the [JMdict](https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project)
and [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) dictionary files. These files are the
property of the [Electronic Dictionary Research and Development Group](https://www.edrdg.org/), and are used in
conformance with the Group's [licence](https://www.edrdg.org/edrdg/licence.html).

Unlike the rest of PocketBeat (MIT), `ja-readings.gz` is licensed under
[Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
