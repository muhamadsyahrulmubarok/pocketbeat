# Changelog

All notable changes to PocketBeat are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

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

[1.2.0]: https://github.com/muhamadsyahrulmubarok/pocketbeat/releases/tag/v1.2.0
[1.1.0]: https://github.com/muhamadsyahrulmubarok/pocketbeat/releases/tag/v1.1.0
[1.0.0]: https://github.com/muhamadsyahrulmubarok/pocketbeat/releases/tag/v1.0.0
