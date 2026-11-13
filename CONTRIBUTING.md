# Contributing to PocketBeat

Thanks for helping out! Bug reports, ideas, and pull requests are all welcome.

## Reporting bugs

Open an [issue](https://github.com/muhamadsyahrulmubarok/pocketbeat/issues/new/choose) and include:

- your browser and version (for example Chrome 131 on Windows 11)
- the PocketBeat version (shown on the card in `chrome://extensions`)
- what you did, what you expected, and what happened instead
- errors from the extension's consoles, if any:
  - popup: right-click the popup → **Inspect** → **Console**
  - service worker and player: `chrome://extensions` → PocketBeat → **Inspect views**

If search or Up next suddenly stops working for everyone, YouTube Music's internal API has probably
changed. Please say so in the issue title.

## Development setup

1. Fork and clone the repository.
2. `npm install` (Node.js 22.2+; this only installs ESLint).
3. In `chrome://extensions`, turn on **Developer mode** and **Load unpacked** the repository folder.
4. After changing code, click the reload icon on the PocketBeat card, then reopen the popup.

There is no build step. The code is plain JavaScript loaded directly by Chrome.

## Project layout

```
manifest.json
background/service-worker.js   search, suggestions, lyrics, queue, playback control
offscreen/offscreen.{html,js}  hidden player hosting the YouTube embed iframe
popup/popup.{html,css,js}      the popup UI
scripts/                       check and packaging tooling (Node)
```

Messages between the parts carry a `target` field: `"sw"` (service worker), `"offscreen"`, or
`"broadcast"` (status updates any page may listen to).

## Pull requests

- Keep each pull request to one change, and describe what it fixes and how you tested it.
- Run `npm test` before pushing; CI runs the same checks.
- Test the change in the browser: search, play, pause, next, auto-advance at the end of the queue.
- Follow the existing style: 2-space indent, double quotes, no new runtime dependencies.
- For UI changes, add a before/after screenshot.

## Releasing (maintainers)

1. Update `version` in both `manifest.json` and `package.json`, and add an entry to `CHANGELOG.md`.
2. Commit, then tag: `git tag v1.2.3 && git push origin v1.2.3`.
3. The release workflow builds `pocketbeat-<version>.zip` and attaches it to a GitHub release.

## Code of conduct

Be kind and assume good intent. Harassment or personal attacks are not tolerated in issues, pull requests,
or discussions.
