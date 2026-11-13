// PocketBeat - service worker
// Owns search and suggestions (YouTube Music), lyrics (LRCLIB), the queue, and
// the offscreen player. No YouTube Music tab is ever opened.

const APP_VERSION = chrome.runtime.getManifest().version;

// ---------- REQUEST HEADERS ----------
// 1. Extension pages send no Referer, and YouTube rejects embeds without one
//    ("Error 153"), so embed requests get a Referer.
// 2. The YouTube Music internal API rejects a chrome-extension:// Origin, so
//    those requests get music.youtube.com as Origin/Referer.
// Both rules only match requests made by this extension. Its host is the
// extension id in Chrome and a per-install UUID in Firefox.
const EXTENSION_HOST = location.hostname;
const EMBED_RULE_ID = 1;
const YTM_RULE_ID = 2;

async function setupHeaderRules() {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [EMBED_RULE_ID, YTM_RULE_ID],
    addRules: [
      {
        id: EMBED_RULE_ID,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [
            { header: "referer", operation: "set", value: `https://${EXTENSION_HOST}.chromiumapp.org/` },
          ],
        },
        condition: {
          urlFilter: "||www.youtube.com/embed/",
          resourceTypes: ["sub_frame"],
          initiatorDomains: [EXTENSION_HOST],
        },
      },
      {
        id: YTM_RULE_ID,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [
            { header: "origin", operation: "set", value: "https://music.youtube.com" },
            { header: "referer", operation: "set", value: "https://music.youtube.com/" },
          ],
        },
        condition: {
          urlFilter: "||music.youtube.com/youtubei/",
          resourceTypes: ["xmlhttprequest"],
          initiatorDomains: [EXTENSION_HOST],
        },
      },
    ],
  });
}
chrome.runtime.onInstalled.addListener(setupHeaderRules);
chrome.runtime.onStartup.addListener(setupHeaderRules);

// ---------- YOUTUBE MUSIC (internal API: no API key, no quota) ----------
// The same API music.youtube.com itself uses. It is unofficial, so the response
// shape can change at any time; the parsers below fail soft (empty results).
const YTM_CLIENT = { clientName: "WEB_REMIX", clientVersion: "1.20241106.01.00", hl: "en" };
const YTM_SONGS_FILTER = "EgWKAQIIAWoMEA4QChADEAQQCRAF"; // the "Songs" search filter

async function ytmApi(endpoint, body) {
  const res = await fetch(`https://music.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context: { client: YTM_CLIENT }, ...body }),
  });
  if (!res.ok) throw new Error(`YouTube Music rejected the request (${res.status})`);
  return res.json();
}

const runsText = (runs = []) => runs.map((r) => r.text).join("");
const pageType = (run) =>
  run.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig
    ?.pageType || "";

// "3:10" -> 190 seconds
function parseClock(text) {
  if (!/^\d+(:\d+){1,2}$/.test(text || "")) return 0;
  return text.split(":").reduce((acc, n) => acc * 60 + Number(n), 0);
}

function bestThumb(thumbnails = []) {
  const t = thumbnails[thumbnails.length - 1];
  return t ? t.url : "";
}

// "Artist • Album • 3:10" -> { artist, album, duration }
function parseByline(runs = []) {
  const artists = runs.filter((r) => pageType(r) === "MUSIC_PAGE_TYPE_ARTIST").map((r) => r.text);
  const album = runs.find((r) => pageType(r) === "MUSIC_PAGE_TYPE_ALBUM")?.text || "";
  const groups = runsText(runs).split(" • ");
  const duration = parseClock(groups[groups.length - 1]);
  return { artist: artists.length ? artists.join(", ") : groups[0] || "", album, duration };
}

function searchShelfItems(data) {
  const sections =
    data?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
  return sections.flatMap((s) => s.musicShelfRenderer?.contents || []);
}

const flexColumns = (r) => (r.flexColumns || []).map((c) => c.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []);

async function searchYtm(query) {
  const data = await ytmApi("search", { query, params: YTM_SONGS_FILTER });
  const items = searchShelfItems(data);
  const tracks = [];
  for (const item of items) {
    const r = item.musicResponsiveListItemRenderer;
    const videoId = r?.playlistItemData?.videoId;
    if (!videoId) continue;
    const cols = flexColumns(r);
    tracks.push({
      videoId,
      title: runsText(cols[0]),
      ...parseByline(cols[1]),
      thumbnail: bestThumb(r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails),
    });
  }
  return tracks;
}

// Search-as-you-type suggestions ("babym" -> "babymonster", "babymonster choom").
// Each suggestion keeps YouTube Music's runs so the popup can show which part
// matched the typed text (bold runs).
const MAX_QUERY_SUGGESTIONS = 4;

async function suggestQueries(input) {
  const data = await ytmApi("music/get_search_suggestions", { input });
  const out = [];
  for (const section of data.contents || []) {
    for (const item of section.searchSuggestionsSectionRenderer?.contents || []) {
      const r = item.searchSuggestionRenderer; // text suggestions only, not artist/song cards
      if (!r) continue;
      const runs = (r.suggestion?.runs || []).map((run) => ({ text: run.text, bold: !!run.bold }));
      const query = r.navigationEndpoint?.searchEndpoint?.query || runsText(runs);
      if (query && !out.some((s) => s.query === query)) out.push({ query, runs });
    }
  }
  return out.slice(0, MAX_QUERY_SUGGESTIONS);
}

// The YouTube Music radio ("Up next") for a song.
async function radioYtm(videoId) {
  const data = await ytmApi("next", { videoId, playlistId: `RDAMVM${videoId}`, isAudioOnly: true });
  const panel =
    data.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs?.[0]
      ?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer;
  return (panel?.contents || [])
    .map((c) => c.playlistPanelVideoRenderer)
    .filter((v) => v?.videoId)
    .map((v) => {
      const byline = parseByline(v.longBylineText?.runs);
      return {
        videoId: v.videoId,
        title: runsText(v.title?.runs),
        artist: byline.artist,
        album: byline.album,
        duration: parseClock(v.lengthText?.runs?.[0]?.text) || byline.duration,
        thumbnail: bestThumb(v.thumbnail?.thumbnails),
      };
    });
}

// ---------- FALLBACK: YOUTUBE DATA API v3 (optional key) ----------
// Only used when the YouTube Music search fails. Returns regular YouTube
// videos, not song versions. The key lives in chrome.storage.local only.
async function getApiKey() {
  const { apiKey } = await chrome.storage.local.get({ apiKey: "" });
  return apiKey || null;
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function searchDataApi(query, key) {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  Object.entries({
    part: "snippet",
    q: query,
    type: "video",
    videoCategoryId: "10", // Music
    videoEmbeddable: "true",
    videoSyndicated: "true",
    maxResults: "20",
    key,
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube search failed (${res.status})`);
  const data = await res.json();
  return (data.items || [])
    .filter((item) => item.id?.videoId)
    .map((item) => ({
      videoId: item.id.videoId,
      title: decodeEntities(item.snippet.title),
      artist: decodeEntities(item.snippet.channelTitle.replace(/ - Topic$/, "")),
      thumbnail: item.snippet.thumbnails?.medium?.url || "",
    }));
}

// ---------- SEARCH ----------
async function searchSongs(query) {
  let ytmError = null;
  try {
    const results = await searchYtm(query);
    if (results.length) return results;
  } catch (err) {
    ytmError = err;
  }
  const key = await getApiKey();
  if (key) return searchDataApi(query, key);
  if (ytmError) throw ytmError;
  return [];
}

// ---------- SUGGESTIONS (YouTube Music radio) ----------
// Suggestions for song X come from, in order:
//   1. the radio X itself came from (if X was a suggestion) -> stays on one "station"
//   2. the radio of X
// Each radio is cached for 6 hours.
const POOL_TTL = 6 * 60 * 60 * 1000;
const MAX_POOLS = 15;
const MAX_HISTORY = 300;

async function getPool(key) {
  const { pools } = await chrome.storage.local.get({ pools: {} });
  const p = pools[key];
  return p && Date.now() - p.ts < POOL_TTL ? p.items : null;
}

async function savePool(key, items) {
  const { pools } = await chrome.storage.local.get({ pools: {} });
  pools[key] = { items, ts: Date.now() };
  const keys = Object.keys(pools).sort((a, b) => pools[b].ts - pools[a].ts);
  keys.slice(MAX_POOLS).forEach((k) => delete pools[k]);
  await chrome.storage.local.set({ pools });
}

async function getSuggestions(seed, n = 5) {
  if (!seed) return [];
  const { queue, played } = await chrome.storage.local.get({ queue: [], played: [] });
  const exclude = new Set([...queue.map((t) => t.videoId), ...played]);
  const out = [];
  const tried = new Set();

  const take = async (key, videoId) => {
    if (tried.has(key)) return;
    tried.add(key);
    let items = await getPool(key);
    if (!items) {
      try {
        items = await radioYtm(videoId);
        await savePool(key, items);
      } catch (_) {
        items = [];
      }
    }
    for (const t of items) {
      if (out.length >= n) break;
      if (!exclude.has(t.videoId)) {
        out.push({ ...t, source: key });
        exclude.add(t.videoId);
      }
    }
  };

  if (seed.source?.startsWith("r:")) await take(seed.source, seed.source.slice(2));
  if (out.length < n) await take(`r:${seed.videoId}`, seed.videoId);
  return out;
}

// ---------- PLAYLISTS ----------
// YouTube Music playlists can be searched and played, and any list of songs
// (the queue, or a YouTube Music playlist) can be saved locally under a name.
const YTM_PLAYLIST_FILTERS = [
  "EgeKAQQoADgBagwQDhAKEAMQBBAJEAU=", // playlists made by YouTube Music
  "EgeKAQQoAEABagwQDhAKEAMQBBAJEAU=", // community playlists
];
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,64}$/;
const MAX_PLAYLISTS = 50;
const MAX_PLAYLIST_TRACKS = 200;

async function searchPlaylistsYtm(query) {
  const pages = await Promise.all(
    YTM_PLAYLIST_FILTERS.map((params) => ytmApi("search", { query, params }).catch(() => null))
  );
  const out = [];
  for (const item of pages.flatMap(searchShelfItems)) {
    const r = item.musicResponsiveListItemRenderer;
    const browseId = r?.navigationEndpoint?.browseEndpoint?.browseId || "";
    const playlistId = browseId.startsWith("VL") ? browseId.slice(2) : "";
    if (!PLAYLIST_ID.test(playlistId) || out.some((p) => p.playlistId === playlistId)) continue;
    const cols = flexColumns(r);
    out.push({
      playlistId,
      title: runsText(cols[0]),
      subtitle: runsText(cols[1]), // "YouTube Music • 116 songs" or "Author • 1M views"
      thumbnail: bestThumb(r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails),
    });
  }
  return out.slice(0, 30);
}

function findKey(obj, key) {
  if (!obj || typeof obj !== "object") return null;
  if (obj[key]) return obj[key];
  for (const v of Object.values(obj)) {
    const found = findKey(v, key);
    if (found) return found;
  }
  return null;
}

// The first 100 songs of a YouTube Music playlist.
async function playlistTracksYtm(playlistId) {
  if (!PLAYLIST_ID.test(playlistId || "")) throw new Error("Invalid playlist");
  const data = await ytmApi("browse", { browseId: `VL${playlistId}` });
  const shelf = findKey(data, "musicPlaylistShelfRenderer");
  const tracks = [];
  for (const item of shelf?.contents || []) {
    const r = item.musicResponsiveListItemRenderer;
    const videoId = r?.playlistItemData?.videoId;
    if (!videoId) continue; // unavailable songs
    const cols = flexColumns(r);
    const fixed = r.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs;
    tracks.push({
      videoId,
      title: runsText(cols[0]),
      artist: runsText(cols[1]),
      album: runsText(cols[2]),
      duration: parseClock(runsText(fixed)),
      thumbnail: bestThumb(r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails),
    });
  }
  return tracks;
}

// Only the fields a queue item needs (drops flags such as `auto`).
const pickTrack = (t) => ({
  videoId: String(t.videoId),
  title: String(t.title || ""),
  artist: String(t.artist || ""),
  album: String(t.album || ""),
  duration: Number(t.duration) || 0,
  thumbnail: String(t.thumbnail || ""),
});

async function getPlaylists() {
  const { playlists } = await chrome.storage.local.get({ playlists: [] });
  return playlists;
}

async function savePlaylist(name, tracks, thumbnail) {
  if (!tracks.length) throw new Error("There are no songs to save");
  const playlists = await getPlaylists();
  if (playlists.length >= MAX_PLAYLISTS) throw new Error(`You can save up to ${MAX_PLAYLISTS} playlists`);
  const list = tracks.slice(0, MAX_PLAYLIST_TRACKS).map(pickTrack);
  const playlist = {
    id: crypto.randomUUID(),
    name: String(name || "").trim().slice(0, 80) || "My playlist",
    thumbnail: thumbnail || list[0].thumbnail,
    tracks: list,
    created: Date.now(),
  };
  await chrome.storage.local.set({ playlists: [playlist, ...playlists] });
  return playlist;
}

async function deletePlaylist(id) {
  const playlists = await getPlaylists();
  await chrome.storage.local.set({ playlists: playlists.filter((p) => p.id !== id) });
}

// Replaces the queue with the songs and plays the first one.
async function playList(tracks) {
  if (!tracks.length) throw new Error("This playlist has no playable songs");
  await chrome.storage.local.set({ queue: tracks.slice(0, MAX_PLAYLIST_TRACKS).map(pickTrack) });
  await playIndex(0);
}

// ---------- LYRICS (LRCLIB) ----------
// Fallback results can look like "Artist - Title (Official Video) [HD]".
function cleanTrack(title, artist) {
  let t = title
    .replace(/[([【][^)\]】]*[)\]】]/g, " ") // drop (…) […] 【…】
    .replace(/\b(official|music|lyrics?|video|audio|mv|hd|4k|visualizer)\b/gi, " ")
    .replace(/\s+(ft\.?|feat\.?)\s.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  let a = artist.replace(/VEVO$/i, "").trim();
  const dash = t.split(/\s[-–—]\s/);
  if (dash.length >= 2) {
    a = dash[0].trim();
    t = dash.slice(1).join(" ").trim();
  }
  return { title: t || title, artist: a || artist };
}

async function lrclibSearch(params) {
  const url = new URL("https://lrclib.net/api/search");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, {
    headers: { "Lrclib-Client": `PocketBeat v${APP_VERSION} (https://github.com/muhamadsyahrulmubarok/pocketbeat)` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchLyrics(title, artist, duration) {
  const c = cleanTrack(title, artist);
  let results = await lrclibSearch({ track_name: c.title, artist_name: c.artist });
  if (!results.length) results = await lrclibSearch({ q: `${c.artist} ${c.title}` });
  if (!results.length) results = await lrclibSearch({ q: c.title });
  if (!results.length) return null;

  // Prefer synced lyrics, then the closest duration.
  const score = (d) => (d.syncedLyrics ? 0 : 1000) + (duration ? Math.abs((d.duration || 0) - duration) : 0);
  const best = results.slice().sort((x, y) => score(x) - score(y))[0];
  return { plain: best.plainLyrics || "", synced: best.syncedLyrics || "" };
}

// ---------- STATE (queue + player status) ----------
async function getPlayback() {
  return chrome.storage.local.get({ queue: [], index: -1 });
}

async function setPlayback(patch) {
  await chrome.storage.local.set(patch);
  broadcastState();
}

// Last status reported by the player (time, duration, playerState). Mirrored
// to storage.session because Chrome can suspend the service worker.
let lastStatus = null;

async function getLastStatus() {
  if (!lastStatus) {
    const { lastStatus: s } = await chrome.storage.session.get({ lastStatus: null });
    lastStatus = s;
  }
  return lastStatus;
}

async function broadcastState() {
  const { queue, index } = await getPlayback();
  const status = await getLastStatus();
  chrome.runtime.sendMessage({ target: "broadcast", type: "STATE", queue, index, status }).catch(() => {});
}

// ---------- OFFSCREEN PLAYER ----------
// Chrome hosts the player in an offscreen document. Firefox has no offscreen
// API, but its background script runs in a real page, so there the same player
// page is loaded in an iframe inside the background page.
const PLAYER_URL = "offscreen/offscreen.html";
const HAS_OFFSCREEN_API = !!chrome.offscreen;
let creatingOffscreen = null;

async function hasOffscreen() {
  if (!HAS_OFFSCREEN_API) return !!document.getElementById("player");
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  return contexts.length > 0;
}

function createPlayerFrame() {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.id = "player";
    frame.allow = "autoplay; encrypted-media";
    frame.src = chrome.runtime.getURL(PLAYER_URL);
    frame.addEventListener("load", () => resolve(), { once: true });
    document.body.appendChild(frame);
  });
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  if (!creatingOffscreen) {
    creatingOffscreen = (
      HAS_OFFSCREEN_API
        ? chrome.offscreen.createDocument({
            url: PLAYER_URL,
            reasons: ["AUDIO_PLAYBACK"],
            justification: "Plays music audio without opening a YouTube tab.",
          })
        : createPlayerFrame()
    ).finally(() => (creatingOffscreen = null));
  }
  await creatingOffscreen;
}

async function closeOffscreen() {
  if (!(await hasOffscreen())) return;
  if (HAS_OFFSCREEN_API) await chrome.offscreen.closeDocument();
  else document.getElementById("player").remove();
}

async function toOffscreen(msg) {
  return chrome.runtime.sendMessage({ target: "offscreen", ...msg }).catch(() => null);
}

// ---------- PLAYBACK ----------
async function playIndex(index, start = 0) {
  const { queue } = await getPlayback();
  const track = queue[index];
  if (!track) return;
  lastStatus = { videoId: track.videoId, state: 3, time: start, duration: 0 };
  await chrome.storage.session.set({ lastStatus });
  // Play history: songs already played are not suggested again.
  const { played, volume } = await chrome.storage.local.get({ played: [], volume: 100 });
  const history = [track.videoId, ...played.filter((id) => id !== track.videoId)].slice(0, MAX_HISTORY);
  await chrome.storage.local.set({ played: history });
  await setPlayback({ index });
  await ensureOffscreen();
  // Chrome's offscreen document may always play audio; Firefox may block it.
  await toOffscreen({ type: "LOAD", videoId: track.videoId, start, volume, watchAutoplay: !HAS_OFFSCREEN_API });
}

// Insert right after the current song, then play it.
async function playTrackNow(track) {
  const { queue, index } = await getPlayback();
  const at = index + 1;
  queue.splice(at, 0, track);
  await chrome.storage.local.set({ queue });
  await playIndex(at);
}

async function enqueue(track) {
  const { queue, index } = await getPlayback();
  queue.push(track);
  await setPlayback({ queue });
  if (index < 0) await playIndex(queue.length - 1); // nothing playing yet
}

async function removeAt(i) {
  const { queue, index } = await getPlayback();
  if (i < 0 || i >= queue.length) return;
  queue.splice(i, 1);
  if (i === index) {
    // The current song was removed: continue with the song now at that position.
    const newIndex = Math.min(index, queue.length - 1);
    await chrome.storage.local.set({ queue, index: newIndex });
    return newIndex >= 0 ? playIndex(newIndex) : stopPlayback();
  }
  await setPlayback({ queue, index: i < index ? index - 1 : index });
}

async function stopPlayback() {
  await closeOffscreen();
  lastStatus = null;
  await chrome.storage.session.set({ lastStatus: null });
  broadcastState();
}

async function next() {
  const { queue, index } = await getPlayback();
  if (index + 1 < queue.length) return playIndex(index + 1);
  // End of the queue: append the first suggestion and play it.
  const [suggestion] = await getSuggestions(queue[index], 1);
  if (suggestion) {
    queue.push({ ...suggestion, auto: true });
    await chrome.storage.local.set({ queue });
    return playIndex(queue.length - 1);
  }
  if (lastStatus) lastStatus.state = 0;
  broadcastState();
}

async function prev() {
  const { index } = await getPlayback();
  const status = await getLastStatus();
  if ((status?.time || 0) > 3 || index <= 0) {
    await toOffscreen({ type: "SEEK", time: 0 });
    return;
  }
  return playIndex(index - 1);
}

async function seek(time) {
  if (await hasOffscreen()) {
    await toOffscreen({ type: "SEEK", time });
  } else {
    // Chrome closed the idle player: reload the song at the requested position.
    const { index } = await getPlayback();
    if (index >= 0) return playIndex(index, time);
  }
  if (lastStatus) lastStatus.time = time;
}

async function setVolume(volume) {
  const v = Math.max(0, Math.min(100, Math.round(volume)));
  await chrome.storage.local.set({ volume: v });
  await toOffscreen({ type: "SET_VOLUME", volume: v });
}

async function toggle() {
  const { queue, index } = await getPlayback();
  if (!(await hasOffscreen())) {
    // Chrome closes the offscreen player after a while without audio:
    // resume from the last position, or start the queue from the top.
    const status = await getLastStatus();
    if (index >= 0 && queue[index]) return playIndex(index, status?.state === 0 ? 0 : status?.time || 0);
    if (queue.length) return playIndex(0);
    return;
  }
  await toOffscreen({ type: "TOGGLE" });
}

// Play, never pause (used after autoplay is allowed in Firefox).
async function resume() {
  if (await hasOffscreen()) await toOffscreen({ type: "PLAY" });
  else await toggle();
}

async function onPlayerStatus(status) {
  const prevState = lastStatus?.state;
  lastStatus = {
    videoId: status.videoId,
    state: status.state,
    time: status.time,
    duration: status.duration,
    blocked: !!status.blocked,
  };
  await chrome.storage.session.set({ lastStatus });
  if (status.state === 0 && prevState !== 0) await next(); // song ended
}

// ---------- MESSAGE ROUTER ----------
const handlers = {
  SEARCH: (msg) => searchSongs(msg.query).then((results) => ({ ok: true, results })),
  // Fails soft: no suggestions is better than an error while typing.
  SUGGEST_QUERIES: (msg) =>
    suggestQueries(String(msg.input || "").slice(0, 100))
      .then((items) => ({ ok: true, items }))
      .catch(() => ({ ok: true, items: [] })),
  LYRICS: (msg) => fetchLyrics(msg.title, msg.artist, msg.duration).then((lyrics) => ({ ok: true, lyrics })),
  GET_STATE: async () => {
    const { queue, index } = await getPlayback();
    let status = await getLastStatus();
    if (await hasOffscreen()) {
      const live = await toOffscreen({ type: "GET_STATUS" });
      if (live?.ok) status = live;
    } else if (status) {
      status = { ...status, state: status.state === 0 ? 0 : 2 }; // player closed = paused
    }
    const { volume } = await chrome.storage.local.get({ volume: 100 });
    return { ok: true, queue, index, status, volume };
  },
  GET_SUGGESTIONS: async () => {
    const { queue, index } = await getPlayback();
    return { ok: true, videoId: queue[index]?.videoId || null, items: await getSuggestions(queue[index], 5) };
  },
  SET_VOLUME: (msg) => setVolume(msg.volume).then(() => ({ ok: true })),
  PLAY_TRACK: (msg) => playTrackNow(msg.track).then(() => ({ ok: true })),
  ENQUEUE: (msg) => enqueue(msg.track).then(() => ({ ok: true })),
  PLAY_INDEX: (msg) => playIndex(msg.index).then(() => ({ ok: true })),
  REMOVE: (msg) => removeAt(msg.index).then(() => ({ ok: true })),
  SEARCH_PLAYLISTS: (msg) => searchPlaylistsYtm(msg.query).then((results) => ({ ok: true, results })),
  GET_PLAYLISTS: async () => ({
    ok: true,
    playlists: (await getPlaylists()).map((p) => ({ id: p.id, name: p.name, thumbnail: p.thumbnail, count: p.tracks.length })),
  }),
  // A saved playlist (id) or a YouTube Music playlist (playlistId).
  PLAY_PLAYLIST: async (msg) => {
    const tracks = msg.id
      ? (await getPlaylists()).find((p) => p.id === msg.id)?.tracks || []
      : await playlistTracksYtm(msg.playlistId);
    await playList(tracks);
    return { ok: true, count: tracks.length };
  },
  // Saves the queue, or a YouTube Music playlist (playlistId).
  SAVE_PLAYLIST: async (msg) => {
    const tracks = msg.playlistId ? await playlistTracksYtm(msg.playlistId) : (await getPlayback()).queue;
    const p = await savePlaylist(msg.name, tracks, msg.thumbnail);
    return { ok: true, name: p.name, count: p.tracks.length };
  },
  DELETE_PLAYLIST: (msg) => deletePlaylist(msg.id).then(() => ({ ok: true })),
  CLEAR_QUEUE: async () => {
    await stopPlayback();
    await setPlayback({ queue: [], index: -1 });
    return { ok: true };
  },
  CONTROL: async (msg) => {
    if (msg.action === "play") await toggle();
    if (msg.action === "resume") await resume();
    if (msg.action === "next") await next();
    if (msg.action === "prev") await prev();
    if (msg.action === "seek") await seek(Number(msg.time) || 0);
    return { ok: true };
  },
  PLAYER_ERROR: async (msg) => {
    chrome.runtime
      .sendMessage({ target: "broadcast", type: "PLAYER_ERROR", code: msg.code, videoId: msg.videoId })
      .catch(() => {});
    await next(); // skip songs that cannot be played
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Only accept messages from this extension's own pages.
  if (sender.id !== chrome.runtime.id) return;
  if (msg.target === "broadcast" && msg.type === "PLAYER_STATUS") {
    onPlayerStatus(msg);
    return;
  }
  if (msg.target !== "sw") return;
  const handler = handlers[msg.type];
  if (!handler) return;
  Promise.resolve(handler(msg))
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: err.message }));
  return true; // async response
});
