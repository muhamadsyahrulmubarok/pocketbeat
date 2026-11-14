# Privacy Policy

_Last updated: 2026-11-14_

PocketBeat is a browser extension that runs entirely in your browser. It has no servers of its own, no
analytics, no tracking, and no user accounts. The author of PocketBeat receives no data from you.

## Data stored on your device

Stored with `chrome.storage` in your browser profile, and never sent to the author:

- your queue and the position in it
- the playlists you save (their names and songs)
- your play history (the last 300 song IDs, used so suggestions don't repeat songs)
- cached Up next suggestions (kept for 6 hours)
- your volume setting and whether romanized lyrics are on
- your YouTube Data API key, if you choose to add one

Removing the extension deletes all of it. Clearing the queue in the popup removes the queue, and deleting a
playlist removes it.

## Data sent to third parties

PocketBeat only contacts these services, and only to do what you asked:

| Service | When | What is sent |
|---------|------|--------------|
| YouTube Music (`music.youtube.com`) | When you search, load Up next suggestions, or play or save a YouTube Music playlist | Your search text, the ID of the song playing, or the playlist ID |
| YouTube (`www.youtube.com`) | When a song plays | The song's video ID, through the standard YouTube embed player |
| LRCLIB (`lrclib.net`) | When a song starts | The song title, artist, and duration, to find lyrics |
| Google APIs (`www.googleapis.com`) | Only if you added an API key and the YouTube Music search failed | Your search text and your API key |

These services receive your IP address and normal browser information, as with any web request, and
handle it under their own policies: [Google Privacy Policy](https://policies.google.com/privacy) (YouTube,
YouTube Music, Google APIs) and [LRCLIB](https://lrclib.net). YouTube may set cookies through the embed
player.

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | Save your queue, playlists, history, settings, and optional API key locally |
| `offscreen` | Keep a hidden player page alive so music plays after the popup closes |
| `declarativeNetRequestWithHostAccess` | Add the request headers YouTube requires for embeds and search, only on requests made by PocketBeat |
| Host access to `music.youtube.com`, `www.youtube.com`, `lrclib.net`, `www.googleapis.com` | Reach the services listed above. PocketBeat does not read or change the pages you visit. |

## Contact

Questions or concerns: open an issue at
<https://github.com/muhamadsyahrulmubarok/pocketbeat/issues>.
