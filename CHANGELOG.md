# Changelog

All notable changes to PocketBeat are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [1.3.0] - 2026-11-16

### Added

- Album and artist search: the Results tab switch is now Songs / Albums / Artists / Playlists. Albums, EPs,
  and singles show their type, artist, and year; an artist plays (or saves) their top songs. Both can be
  played right away (replaces the queue) or saved to Playlists.
- Keyboard shortcuts that work without opening the popup: play/pause (Alt+Shift+Space), next
  (Alt+Shift+.), and previous (Alt+Shift+,). They can be changed in the browser's extension shortcuts page.
- Shuffle (every song once before any repeats; Previous goes back through the songs actually played) and
  repeat (whole queue, or the current song).
- Sleep timer: pause after 15, 30, or 60 minutes, or at the end of the current song. Uses the new `alarms`
  permission so it fires even if the browser suspends the extension.
- The toolbar icon's tooltip shows the current song.
- Lyrics timing: shift synced lyrics earlier or later in 0.5 s steps, remembered per song.
- Recently played: the last 50 songs, in the Playlists tab.
- Play next: song rows have a "Play next" button next to "Add to queue".
- Reorder the queue by dragging songs, or with Alt+↑/↓ on a focused song.
- Export saved playlists to a JSON file and import them again (songs are checked on import).

### Fixed

- Songs from an artist's top songs showed the play count where the album name belongs.

## [1.2.0] - 2026-11-14

### Added

- Firefox support (Firefox 140+), as a separate `pocketbeat-<version>-firefox.zip` built from the same code.
  Firefox has no offscreen API, so the player runs inside the background page there.
- When Firefox blocks autoplay, the popup shows an **Allow autoplay** button that opens a short guide. Once
  autoplay is allowed, the song starts and the guide closes itself.
- Thin scrollbars and styled sliders in Firefox.
- Playlists tab: save the queue as a named playlist, play a saved playlist (replaces the queue), or delete
  it (two clicks). Stored in the browser, up to 50 playlists of 200 songs.
- Playlist search: the Results tab has a Songs / Playlists switch. A YouTube Music playlist can be played
  right away or saved to Playlists (first 100 songs).
- Romanized lyrics for Korean and Japanese songs, behind a **Romanized** toggle in the Lyrics tab (off by
  default, remembered). Fully offline: Korean uses Revised Romanization with the common sound changes;
  Japanese uses the browser's word segmenter and a 130 KB reading dictionary built from JMdict and
  KANJIDIC2 (CC BY-SA 4.0), loaded only when needed.

### Fixed

- Synced lyrics could be out of time for songs that have several versions on LRCLIB (album, live, TV
  size). The lyrics are now matched to the song's length (within 3 seconds); when no synced version
  matches, plain lyrics are shown without highlighting.
- The highlighted lyric line no longer lags up to half a second behind the song.

## [1.1.0] - 2026-11-13

### Added

- Search suggestions while typing: up to 4 suggestions from YouTube Music, with keyboard support
  (↓/↑ to highlight, → to fill the search box, Enter to search, Esc to close) and mouse support.

## [1.0.0] - 2026-11-13

First public release.

### Added

- Song search from YouTube Music, with album art, artist, and album. No API key needed.
- Background playback through an offscreen document: music keeps playing after the popup closes.
- Queue: play now, add, remove, clear.
- Up next suggestions from the YouTube Music radio, with automatic playback when the queue ends.
- Synced lyrics from LRCLIB.
- Seek bar, volume, and mute.
- Optional YouTube Data API v3 key as a search fallback.

[1.3.0]: https://github.com/muhamadsyahrulmubarok/pocketbeat/releases/tag/v1.3.0
[1.2.0]: https://github.com/muhamadsyahrulmubarok/pocketbeat/releases/tag/v1.2.0
[1.1.0]: https://github.com/muhamadsyahrulmubarok/pocketbeat/releases/tag/v1.1.0
[1.0.0]: https://github.com/muhamadsyahrulmubarok/pocketbeat/releases/tag/v1.0.0
