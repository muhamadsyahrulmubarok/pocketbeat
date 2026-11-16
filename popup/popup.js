/* global Romanize */
// PocketBeat - popup UI
// The popup is only a remote control: playback runs in the offscreen document,
// so music keeps playing after the popup closes, with no YouTube Music tab.

const $ = (id) => document.getElementById(id);

const ICONS = {
  add: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"/></svg>',
  // Arrow into the list: "play next".
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h12v2H3V6Zm0 4h12v2H3v-2Zm0 4h7v2H3v-2Zm11 0 5 3.5-5 3.5v-7Z"/></svg>',
  remove:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z"/></svg>',
  // Arrow pointing up-left into the search box: "use this text".
  fill: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h9v2H10.4l8.3 8.3-1.4 1.4L9 10.4V16H7V7Z"/></svg>',
  // List with a plus: "save as playlist".
  save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h12v2H3V6Zm0 4h12v2H3v-2Zm0 4h8v2H3v-2Zm14-1h2v3h3v2h-3v3h-2v-3h-3v-2h3v-3Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm4 2v8h1.5v-8H10Zm2.5 0v8H14v-8h-1.5Z"/></svg>',
};

function setStatus(text) {
  $("status").textContent = text || "";
}

function sw(msg) {
  return chrome.runtime.sendMessage({ target: "sw", ...msg }).catch((err) => ({ ok: false, error: err.message }));
}

function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Album art from YouTube Music (googleusercontent; the size is set by the
// "=w120-h120" suffix), or the YouTube video thumbnail as a fallback.
function artUrl(track, px = 120) {
  const t = track.thumbnail || "";
  if (/googleusercontent\.com/.test(t)) return t.replace(/=w\d+-h\d+[^/]*$/, `=w${px}-h${px}-l90-rj`);
  if (t) return t;
  // mqdefault is 16:9 without black bars (default.jpg is letterboxed).
  return `https://i.ytimg.com/vi/${encodeURIComponent(track.videoId)}/mqdefault.jpg`;
}

// Scroll inside the panel only. scrollIntoView also scrolls the popup page
// itself (sideways too), which cut off the left edge of the popup.
function scrollPanelTo(el, center) {
  const panel = document.querySelector(".panels");
  if (!el || !panel) return;
  const top = el.offsetTop - panel.offsetTop;
  if (center) {
    panel.scrollTo({ top: top - panel.clientHeight / 2 + el.offsetHeight / 2, behavior: "smooth" });
  } else if (top < panel.scrollTop) {
    panel.scrollTop = top;
  } else if (top + el.offsetHeight > panel.scrollTop + panel.clientHeight) {
    panel.scrollTop = top + el.offsetHeight - panel.clientHeight;
  }
}

function setRangeFill(el) {
  const max = Number(el.max) || 0;
  const pct = max ? (Number(el.value) / max) * 100 : 0;
  el.style.setProperty("--pct", `${pct}%`);
}

// ---------- TABS ----------
let activeTab = "queue";

function showTab(name) {
  activeTab = name;
  document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
  document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.dataset.panel !== name));
  $("settings-btn").setAttribute("aria-expanded", String(name === "settings"));
  $("settings-btn").title = name === "settings" ? "Close settings" : "Settings";
  document.querySelector(".panels").scrollTop = 0;
  if (name === "lyrics") requestAnimationFrame(scrollActiveLyric);
  if (name === "playlists") renderRecent();
}

document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));

$("settings-btn").addEventListener("click", () => {
  showTab(activeTab === "settings" ? lastContentTab : "settings");
});
let lastContentTab = "queue";
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => (lastContentTab = t.dataset.tab)));

// ---------- TRACK LIST ----------
// track: a song, or { title, sub, thumbnail } for a playlist row.
function makeRow(track, { onPlay, action, actions = action ? [action] : [], current = false }) {
  const subText = track.sub ?? (track.album ? `${track.artist} · ${track.album}` : track.artist);
  const li = document.createElement("li");
  li.className = "row" + (current ? " current" : "");
  li.tabIndex = 0;
  li.title = `${track.title} — ${subText}`;

  const img = document.createElement("img");
  img.className = "row-art";
  if (track.videoId) img.src = artUrl(track, 120);
  else if (track.thumbnail) img.src = artUrl({ thumbnail: track.thumbnail }, 120);
  else img.style.visibility = "hidden";
  img.alt = "";
  img.loading = "lazy";

  const text = document.createElement("div");
  text.className = "row-text";
  const title = document.createElement("p");
  title.className = "row-title";
  title.textContent = track.title;
  const sub = document.createElement("p");
  sub.className = "row-sub";
  sub.textContent = subText;
  if (track.auto) {
    const tag = document.createElement("span");
    tag.className = "row-tag";
    tag.textContent = " · from Up next";
    sub.appendChild(tag);
  }
  text.append(title, sub);
  li.append(img, text);

  for (const a of actions) {
    const b = document.createElement("button");
    b.className = "icon-btn";
    b.type = "button";
    b.title = a.label;
    b.setAttribute("aria-label", a.label);
    b.innerHTML = ICONS[a.icon];
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      a.onClick(b);
    });
    li.appendChild(b);
  }

  li.addEventListener("click", onPlay);
  li.addEventListener("keydown", (e) => {
    if (e.target === li && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onPlay();
    }
  });
  return li;
}

function emptyItem(text) {
  const li = document.createElement("li");
  li.className = "empty";
  li.textContent = text;
  return li;
}

// ---------- SEARCH SUGGESTIONS (autocomplete) ----------
// Keyboard: ↓/↑ move the highlight, → fills the input with the highlighted
// suggestion (or the first one), Enter searches it, Esc closes the list.
const suggest = { items: [], active: -1, timer: null, seq: 0 };
const SUGGEST_DELAY = 150; // ms of typing pause before asking YouTube Music

function suggestOpen() {
  return !$("query-suggest").hidden;
}

function closeSuggest() {
  clearTimeout(suggest.timer);
  suggest.seq++; // ignore responses still in flight
  suggest.items = [];
  suggest.active = -1;
  $("query-suggest").hidden = true;
  $("query-suggest").replaceChildren();
  const input = $("search-input");
  input.setAttribute("aria-expanded", "false");
  input.removeAttribute("aria-activedescendant");
}

function setActiveSuggestion(index) {
  suggest.active = index;
  const input = $("search-input");
  $("query-suggest")
    .querySelectorAll(".qs-item")
    .forEach((li, i) => li.setAttribute("aria-selected", String(i === index)));
  if (index >= 0) input.setAttribute("aria-activedescendant", `qs-${index}`);
  else input.removeAttribute("aria-activedescendant");
}

function renderSuggestions(items) {
  const list = $("query-suggest");
  suggest.items = items;
  suggest.active = -1;
  list.replaceChildren();
  if (!items.length) {
    closeSuggest();
    return;
  }
  items.forEach((item, i) => {
    const li = document.createElement("li");
    li.className = "qs-item";
    li.id = `qs-${i}`;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", "false");

    const text = document.createElement("span");
    text.className = "qs-text";
    // YouTube Music marks the part that matches the typed text as bold.
    const runs = item.runs?.length ? item.runs : [{ text: item.query, bold: false }];
    runs.forEach((run) => {
      const span = document.createElement("span");
      span.className = run.bold ? "qs-typed" : "qs-rest";
      span.textContent = run.text;
      text.appendChild(span);
    });

    const fill = document.createElement("button");
    fill.type = "button";
    fill.className = "qs-fill";
    fill.tabIndex = -1;
    fill.title = "Fill search box (→)";
    fill.setAttribute("aria-label", `Fill search box with ${item.query}`);
    fill.innerHTML = ICONS.fill;

    li.append(text, fill);
    // mousedown (not click) so the input keeps focus and doesn't blur-close the list.
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      if (e.target.closest(".qs-fill")) fillFromSuggestion(i);
      else searchFor(item.query);
    });
    li.addEventListener("mousemove", () => {
      if (suggest.active !== i) setActiveSuggestion(i);
    });
    list.appendChild(li);
  });
  list.hidden = false;
  $("search-input").setAttribute("aria-expanded", "true");
  setActiveSuggestion(-1); // a fresh list starts with nothing highlighted
}

async function requestSuggestions(text) {
  const seq = ++suggest.seq;
  const res = await sw({ type: "SUGGEST_QUERIES", input: text });
  // Drop stale answers: the user kept typing or already searched.
  if (seq !== suggest.seq || $("search-input").value.trim() !== text) return;
  renderSuggestions(res?.ok ? res.items : []);
}

function scheduleSuggestions() {
  clearTimeout(suggest.timer);
  const text = $("search-input").value.trim();
  if (!text) {
    closeSuggest();
    return;
  }
  suggest.timer = setTimeout(() => requestSuggestions(text), SUGGEST_DELAY);
}

// → : put the suggestion into the input and keep refining from there.
function fillFromSuggestion(index) {
  const item = suggest.items[index];
  if (!item) return;
  const input = $("search-input");
  input.value = item.query + " ";
  input.setSelectionRange(input.value.length, input.value.length);
  input.focus();
  scheduleSuggestions();
}

function searchFor(query) {
  $("search-input").value = query;
  closeSuggest();
  $("search-form").requestSubmit();
}

$("search-input").addEventListener("input", scheduleSuggestions);

$("search-input").addEventListener("keydown", (e) => {
  const input = e.currentTarget;
  const n = suggest.items.length;
  if (e.key === "ArrowDown" && n) {
    e.preventDefault();
    setActiveSuggestion(suggest.active + 1 >= n ? 0 : suggest.active + 1);
  } else if (e.key === "ArrowUp" && n && suggestOpen()) {
    e.preventDefault();
    setActiveSuggestion(suggest.active <= 0 ? n - 1 : suggest.active - 1);
  } else if (e.key === "ArrowRight" && n && suggestOpen()) {
    // Only when the caret is at the end, so → still moves the caret mid-text.
    const atEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
    if (atEnd) {
      e.preventDefault();
      fillFromSuggestion(suggest.active >= 0 ? suggest.active : 0);
    }
  } else if (e.key === "Enter" && suggestOpen() && suggest.active >= 0) {
    e.preventDefault();
    searchFor(suggest.items[suggest.active].query);
  } else if (e.key === "Escape" && suggestOpen()) {
    e.preventDefault(); // close the list, not the whole popup
    closeSuggest();
  }
});

$("search-input").addEventListener("blur", () => setTimeout(closeSuggest, 100));

// ---------- SEARCH ----------
// The Results tab searches songs, albums, artists, or playlists.
const SEARCH_TYPES = { songs: "SEARCH", albums: "SEARCH_ALBUMS", artists: "SEARCH_ARTISTS", playlists: "SEARCH_PLAYLISTS" };
const search = { query: "", kind: "songs", seq: 0 };

// Search results, Up next, and Recently played: play now, play next, or add to the queue.
const songActions = (t) => [
  {
    icon: "next",
    label: "Play next",
    onClick: () => sw({ type: "PLAY_NEXT", track: t }).then(() => setStatus(`"${t.title}" plays next.`)),
  },
  { icon: "add", label: "Add to queue", onClick: () => sw({ type: "ENQUEUE", track: t }) },
];

function songRow(r) {
  return makeRow(r, { onPlay: () => sw({ type: "PLAY_TRACK", track: r }), actions: songActions(r) });
}

// Albums, artists, and playlists: play (replaces the queue) or save to Playlists.
// An artist plays and saves as their top songs.
function playlistResultRow(p) {
  const target = p.artistId ? { artistId: p.artistId } : { playlistId: p.playlistId };
  const name = p.artistId ? `${p.title}: top songs` : p.title;
  return makeRow(
    { title: p.title, sub: p.subtitle, thumbnail: p.thumbnail },
    {
      onPlay: () => playPlaylist(target),
      action: {
        icon: "save",
        label: p.artistId ? "Save top songs to Playlists" : "Save to Playlists",
        onClick: async () => {
          setStatus(`Saving "${name}"...`);
          const res = await sw({ type: "SAVE_PLAYLIST", ...target, name, thumbnail: p.thumbnail });
          setStatus(res?.ok ? `Saved "${res.name}" to Playlists (${res.count} songs).` : `Couldn't save: ${res?.error}`);
        },
      },
    }
  );
}

async function runSearch() {
  const { query, kind } = search;
  if (!query) return;
  const seq = ++search.seq;
  const resultsEl = $("search-results");
  $("tab-results").hidden = false;
  lastContentTab = "results";
  showTab("results");
  resultsEl.replaceChildren(emptyItem(`Searching ${kind} for "${query}"...`));

  const res = await sw({ type: SEARCH_TYPES[kind], query });
  if (seq !== search.seq) return; // a newer search started
  resultsEl.replaceChildren();
  if (!res?.ok) {
    resultsEl.appendChild(emptyItem(`Search failed: ${res?.error || "unknown error"}`));
    return;
  }
  if (!res.results.length) {
    resultsEl.appendChild(emptyItem(`No ${kind} for "${query}". Try different keywords.`));
    return;
  }
  // Albums play and save like playlists (each has an audio playlist); artists as their top songs.
  res.results.forEach((r) => resultsEl.appendChild(kind === "songs" ? songRow(r) : playlistResultRow(r)));
}

$("search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  closeSuggest();
  search.query = $("search-input").value.trim();
  runSearch();
});

document.querySelectorAll(".seg-btn").forEach((btn) =>
  btn.addEventListener("click", () => {
    if (search.kind === btn.dataset.kind) return;
    search.kind = btn.dataset.kind;
    document.querySelectorAll(".seg-btn").forEach((b) => b.setAttribute("aria-checked", String(b === btn)));
    runSearch();
  })
);

// ---------- PLAYLISTS ----------
// Playing a playlist replaces the queue.
async function playPlaylist(target) {
  setStatus("Loading playlist...");
  const res = await sw({ type: "PLAY_PLAYLIST", ...target });
  if (!res?.ok) setStatus(`Couldn't play the playlist: ${res?.error || "unknown error"}`);
}

async function renderPlaylists() {
  const el = $("playlist-list");
  const res = await sw({ type: "GET_PLAYLISTS" });
  const playlists = res?.ok ? res.playlists : [];
  el.replaceChildren();
  if (!playlists.length) {
    el.appendChild(
      emptyItem("No playlists yet. Save your queue from the Queue tab, or search for playlists and save one.")
    );
    return;
  }
  playlists.forEach((p) => {
    el.appendChild(
      makeRow(
        { title: p.name, sub: `${p.count} ${p.count === 1 ? "song" : "songs"}`, thumbnail: p.thumbnail },
        {
          onPlay: () => playPlaylist({ id: p.id }),
          action: {
            icon: "trash",
            label: "Delete playlist",
            // Two clicks to delete, so a stray click doesn't lose a playlist.
            onClick: (btn) => {
              if (btn.classList.contains("confirm")) {
                sw({ type: "DELETE_PLAYLIST", id: p.id });
                return;
              }
              btn.classList.add("confirm");
              btn.title = "Click again to delete";
              btn.setAttribute("aria-label", `Click again to delete ${p.name}`);
              setTimeout(() => {
                btn.classList.remove("confirm");
                btn.title = "Delete playlist";
                btn.setAttribute("aria-label", "Delete playlist");
              }, 3000);
            },
          },
        }
      )
    );
  });
}

// Recently played (last 50 songs), under the saved playlists.
async function renderRecent() {
  const el = $("recent-list");
  const res = await sw({ type: "GET_RECENT" });
  const items = res?.ok ? res.items : [];
  el.replaceChildren();
  if (!items.length) {
    el.appendChild(emptyItem("Songs you play show up here."));
    return;
  }
  items.forEach((t) =>
    el.appendChild(makeRow(t, { onPlay: () => sw({ type: "PLAY_TRACK", track: t }), actions: songActions(t) }))
  );
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.playlists) renderPlaylists();
  if (changes.recent && activeTab === "playlists") renderRecent();
});

// Export / import saved playlists as a JSON file (backup, or move to another browser).
$("export-btn").addEventListener("click", async () => {
  const res = await sw({ type: "EXPORT_PLAYLISTS" });
  const playlists = res?.ok ? res.playlists : [];
  if (!playlists.length) return setStatus("No playlists to export yet.");
  const data = {
    app: "PocketBeat",
    version: chrome.runtime.getManifest().version,
    exported: new Date().toISOString(),
    playlists: playlists.map(({ name, thumbnail, tracks }) => ({ name, thumbnail, tracks })),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `pocketbeat-playlists-${data.exported.slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  setStatus(`Exported ${playlists.length} ${playlists.length === 1 ? "playlist" : "playlists"}.`);
});

$("import-btn").addEventListener("click", () => {
  // Firefox closes the popup when the file picker opens, so import from a tab there.
  if (!chrome.offscreen && !location.search.includes("tab=playlists")) {
    chrome.tabs.create({ url: chrome.runtime.getURL("popup/popup.html?tab=playlists") });
    window.close();
    return;
  }
  $("import-file").click();
});

$("import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (_) {
    return setStatus("That file isn't a PocketBeat playlists file.");
  }
  const res = await sw({ type: "IMPORT_PLAYLISTS", data });
  if (!res?.ok) return setStatus(`Couldn't import: ${res?.error || "unknown error"}`);
  setStatus(
    `Imported ${res.imported} ${res.imported === 1 ? "playlist" : "playlists"}` +
      (res.skipped ? ` (${res.skipped} skipped: empty, or over the 50 playlist limit).` : ".")
  );
});

// Save the queue as a playlist (form in the Queue tab).
$("save-queue-btn").addEventListener("click", () => {
  const form = $("save-playlist-form");
  form.hidden = !form.hidden;
  if (!form.hidden) {
    const first = state.queue[0];
    $("playlist-name").value = first ? `${first.artist} and more` : "";
    $("playlist-name").select();
    $("playlist-name").focus();
  }
});

$("save-cancel-btn").addEventListener("click", () => ($("save-playlist-form").hidden = true));

$("save-playlist-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const res = await sw({ type: "SAVE_PLAYLIST", name: $("playlist-name").value });
  if (res?.ok) {
    $("save-playlist-form").hidden = true;
    setStatus(`Saved "${res.name}" to Playlists (${res.count} songs).`);
  } else {
    setStatus(`Couldn't save: ${res?.error || "unknown error"}`);
  }
});

// ---------- STATE ----------
let state = { queue: [], index: -1, status: null };

function currentTrack() {
  return state.queue[state.index] || null;
}

function render() {
  const track = currentTrack();
  $("current-title").textContent = track?.title || "Nothing playing";
  $("current-artist").textContent = track ? track.artist : "Search for a song to start";
  const art = $("np-art");
  if (track) {
    const src = artUrl(track, 240);
    if (art.getAttribute("src") !== src) art.src = src;
  }
  art.hidden = !track;
  $("np-art-empty").hidden = !!track;
  $("queue-count").textContent = state.queue.length ? String(state.queue.length) : "";
  renderStatus();
  renderQueue();
  maybeLoadLyrics();
  maybeLoadSuggestions();
}

let seeking = false; // don't overwrite the seek bar while it is being dragged

function renderStatus() {
  const s = state.status;
  const hasTrack = !!(s && currentTrack());
  const playing = !!(s && (s.state === 1 || s.state === 3));
  const playBtn = $("play-btn");
  playBtn.classList.toggle("playing", playing);
  playBtn.title = playing ? "Pause" : "Play";
  playBtn.setAttribute("aria-label", playBtn.title);

  const bar = $("seek-bar");
  const duration = hasTrack ? Math.floor(s.duration || 0) : 0;
  bar.disabled = !duration;
  bar.max = String(duration);
  $("time-total").textContent = fmtTime(duration);
  if (!seeking) {
    bar.value = String(hasTrack ? Math.floor(s.time || 0) : 0);
    $("time-current").textContent = fmtTime(hasTrack ? s.time : 0);
  }
  setRangeFill(bar);
  if (s) highlightLyric(s.time);
  $("autoplay-notice").hidden = !(hasTrack && s.blocked);
}

function renderQueue() {
  const el = $("queue-list");
  el.replaceChildren();
  $("clear-queue-btn").hidden = !state.queue.length;
  $("save-queue-btn").hidden = !state.queue.length;
  if (!state.queue.length) {
    $("save-playlist-form").hidden = true;
    el.appendChild(emptyItem("Your queue is empty. Search for a song and click + to add it."));
    return;
  }
  state.queue.forEach((t, i) => {
    const row = makeRow(t, {
      current: i === state.index,
      onPlay: () => sw({ type: "PLAY_INDEX", index: i }),
      action: { icon: "remove", label: "Remove from queue", onClick: () => sw({ type: "REMOVE", index: i }) },
    });
    makeDraggable(row, i);
    el.appendChild(row);
  });
  if (activeTab === "queue") scrollPanelTo(el.querySelector(".current"), false);
}

// Reorder the queue: drag a row, or Alt+Up/Down on a focused row.
let dragFrom = -1;
let focusAfterMove = -1;
function makeDraggable(row, i) {
  row.draggable = true;
  row.setAttribute("aria-keyshortcuts", "Alt+ArrowUp Alt+ArrowDown");
  const clear = () => row.classList.remove("drop-above", "drop-below");
  row.addEventListener("dragstart", (e) => {
    dragFrom = i;
    row.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(i));
  });
  row.addEventListener("dragend", () => {
    row.classList.remove("dragging");
    dragFrom = -1;
  });
  row.addEventListener("dragover", (e) => {
    if (dragFrom < 0) return;
    e.preventDefault();
    const below = e.offsetY > row.offsetHeight / 2;
    row.classList.toggle("drop-below", below);
    row.classList.toggle("drop-above", !below);
  });
  row.addEventListener("dragleave", clear);
  row.addEventListener("drop", (e) => {
    e.preventDefault();
    const below = row.classList.contains("drop-below");
    clear();
    if (dragFrom < 0) return;
    let to = below ? i + 1 : i;
    if (dragFrom < to) to--; // the dragged row leaves its old place first
    if (to !== dragFrom) sw({ type: "MOVE", from: dragFrom, to });
  });
  row.addEventListener("keydown", (e) => {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const to = e.key === "ArrowUp" ? i - 1 : i + 1;
    if (to < 0 || to >= state.queue.length) return;
    focusAfterMove = to;
    sw({ type: "MOVE", from: i, to });
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== "broadcast") return;
  if (msg.type === "STATE") {
    state = { queue: msg.queue, index: msg.index, status: msg.status };
    setStatus("");
    render();
    if (msg.modes) renderModes(msg.modes);
    if (focusAfterMove >= 0) {
      $("queue-list").children[focusAfterMove]?.focus();
      focusAfterMove = -1;
    }
  }
  if (msg.type === "PLAYER_STATUS") {
    state.status = msg;
    statusAt = performance.now();
    renderStatus();
  }
  if (msg.type === "PLAYER_ERROR") {
    setStatus("That song can't be played outside YouTube, so it was skipped.");
  }
});

// ---------- CONTROLS ----------
["play", "next", "prev"].forEach((action) => {
  $(`${action}-btn`).addEventListener("click", () => sw({ type: "CONTROL", action }));
});

$("clear-queue-btn").addEventListener("click", () => sw({ type: "CLEAR_QUEUE" }));

// Shuffle, repeat (off -> all -> one), and the sleep timer.
let modes = { shuffle: false, repeat: "off", sleep: { until: 0, endOfSong: false } };
const REPEAT_NEXT = { off: "all", all: "one", one: "off" };
const REPEAT_LABEL = { off: "Repeat: off", all: "Repeat: all", one: "Repeat: this song" };

function renderModes(m) {
  modes = m;
  const shuffle = $("shuffle-btn");
  shuffle.setAttribute("aria-pressed", String(m.shuffle));
  shuffle.title = m.shuffle ? "Shuffle: on" : "Shuffle: off";
  shuffle.setAttribute("aria-label", shuffle.title);
  const repeat = $("repeat-btn");
  repeat.dataset.repeat = m.repeat;
  repeat.setAttribute("aria-pressed", String(m.repeat !== "off"));
  repeat.title = REPEAT_LABEL[m.repeat];
  repeat.setAttribute("aria-label", repeat.title);
  renderSleep();
}

function renderSleep() {
  const { until, endOfSong } = modes.sleep;
  const left = until ? Math.max(1, Math.ceil((until - Date.now()) / 60000)) : 0;
  const on = endOfSong || left > 0;
  const btn = $("sleep-btn");
  btn.setAttribute("aria-pressed", String(on));
  btn.title = endOfSong
    ? "Sleep timer: pauses after this song"
    : left
      ? `Sleep timer: pauses in ${left} min`
      : "Sleep timer";
  btn.setAttribute("aria-label", btn.title);
  $("sleep-badge").hidden = !on;
  $("sleep-badge").textContent = endOfSong ? "end" : String(left);
  $("sleep-menu")
    .querySelectorAll("button")
    .forEach((b) => {
      const checked = !on
        ? b.dataset.minutes === "0"
        : endOfSong
          ? !!b.dataset.end
          : Number(b.dataset.minutes) === modes.sleep.minutes;
      b.setAttribute("aria-checked", String(checked));
    });
}
setInterval(() => modes.sleep.until && renderSleep(), 20000);

$("shuffle-btn").addEventListener("click", async () => {
  const res = await sw({ type: "SET_MODES", shuffle: !modes.shuffle });
  if (res?.ok) renderModes(res.modes);
});
$("repeat-btn").addEventListener("click", async () => {
  const res = await sw({ type: "SET_MODES", repeat: REPEAT_NEXT[modes.repeat] });
  if (res?.ok) renderModes(res.modes);
});

function toggleSleepMenu(open) {
  $("sleep-menu").hidden = !open;
  $("sleep-btn").setAttribute("aria-expanded", String(open));
  if (open) ($("sleep-menu").querySelector('[aria-checked="true"]') || $("sleep-menu").querySelector("button")).focus();
}
$("sleep-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  toggleSleepMenu($("sleep-menu").hidden);
});
$("sleep-menu").addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  toggleSleepMenu(false);
  const res = await sw({ type: "SET_SLEEP", minutes: Number(b.dataset.minutes) || 0, endOfSong: !!b.dataset.end });
  if (res?.ok) renderModes(res.modes);
  $("sleep-btn").focus();
});
$("sleep-menu").addEventListener("keydown", (e) => {
  const items = [...$("sleep-menu").querySelectorAll("button")];
  const i = items.indexOf(document.activeElement);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
  } else if (e.key === "Escape") {
    e.preventDefault();
    toggleSleepMenu(false);
    $("sleep-btn").focus();
  }
});
document.addEventListener("click", (e) => {
  if (!$("sleep-menu").hidden && !e.target.closest(".sleep")) toggleSleepMenu(false);
});

// Firefox only: autoplay is allowed from a regular tab (see autoplay.html).
$("autoplay-btn").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("popup/autoplay.html") });
  window.close();
});

// ---------- SEEK & VOLUME ----------
$("seek-bar").addEventListener("input", (e) => {
  seeking = true;
  setRangeFill(e.target);
  $("time-current").textContent = fmtTime(Number(e.target.value));
});
$("seek-bar").addEventListener("change", async (e) => {
  const time = Number(e.target.value);
  if (state.status) {
    state.status.time = time;
    statusAt = performance.now();
  }
  lastActiveIdx = -1; // force the lyric highlight to recompute
  await sw({ type: "CONTROL", action: "seek", time });
  seeking = false;
});

let restoreVolume = 100;
function renderVolume(v) {
  const bar = $("volume-bar");
  bar.value = String(v);
  setRangeFill(bar);
  const muted = v === 0;
  $("mute-btn").classList.toggle("muted", muted);
  $("mute-btn").title = muted ? "Unmute" : "Mute";
  $("mute-btn").setAttribute("aria-label", $("mute-btn").title);
}
let volumeTimer = null;
function sendVolume(v) {
  clearTimeout(volumeTimer);
  // Send at most ~10 updates per second while dragging.
  volumeTimer = setTimeout(() => sw({ type: "SET_VOLUME", volume: v }), 100);
}
$("volume-bar").addEventListener("input", (e) => {
  const v = Number(e.target.value);
  if (v > 0) restoreVolume = v;
  renderVolume(v);
  sendVolume(v);
});
$("mute-btn").addEventListener("click", () => {
  const v = Number($("volume-bar").value) === 0 ? restoreVolume || 100 : 0;
  renderVolume(v);
  sendVolume(v);
});

// ---------- SUGGESTIONS ----------
let suggestKey = "";
async function maybeLoadSuggestions() {
  const track = currentTrack();
  // Reload when the song changes or the queue changes.
  const key = track ? `${track.videoId}|${state.queue.length}` : "";
  if (key === suggestKey) return;
  suggestKey = key;
  const el = $("suggest-list");
  if (!track) {
    el.replaceChildren(emptyItem("Play a song and similar songs will show up here."));
    return;
  }
  el.replaceChildren(emptyItem("Finding similar songs..."));
  const res = await sw({ type: "GET_SUGGESTIONS" });
  if (suggestKey !== key) return;
  el.replaceChildren();
  if (!res?.ok) {
    el.appendChild(emptyItem(`Couldn't load suggestions: ${res?.error || "unknown error"}`));
    return;
  }
  if (!res.items.length) {
    el.appendChild(emptyItem("YouTube Music has no suggestions for this song yet."));
    return;
  }
  res.items.forEach((t) => {
    el.appendChild(makeRow(t, { onPlay: () => sw({ type: "PLAY_TRACK", track: t }), actions: songActions(t) }));
  });
}

// ---------- LYRICS ----------
let lyricsKey = "";
let lyricsLang = null; // "ja" | "ko" | null, for romanization
let romanizeOn = false;
let parsedLyrics = []; // { time, text }
let lastActiveIdx = -1;
// Timing adjustment per song, in seconds: positive shows lines later (for
// LRCLIB lyrics that run a bit early), negative earlier. Remembered per song.
let lyricOffset = 0;
const MAX_OFFSETS = 300;

async function maybeLoadLyrics() {
  const track = currentTrack();
  const key = track ? track.videoId : "";
  if (key === lyricsKey) return;
  lyricsKey = key;
  parsedLyrics = [];
  lastActiveIdx = -1;
  lyricOffset = 0;
  lyricsLang = null;
  $("lyrics-head").hidden = true;
  const container = $("lyrics-container");
  container.className = "lyrics";
  if (!track) {
    container.textContent = "Play a song to see its lyrics.";
    return;
  }
  container.textContent = "Loading lyrics...";
  const res = await sw({
    type: "LYRICS",
    title: track.title,
    artist: track.artist,
    // The song's length from YouTube Music: the player reports 0 until it has loaded.
    duration: track.duration || state.status?.duration || 0,
  });
  // The song changed while the request was in flight: drop the stale result.
  if (lyricsKey !== key) return;
  renderLyrics(res?.ok ? res.lyrics : null);
  if (state.status) highlightLyric(state.status.time);
}

function renderLyrics(lyrics) {
  const container = $("lyrics-container");
  container.replaceChildren();
  parsedLyrics = [];
  const addLine = (text) => {
    const div = document.createElement("div");
    div.className = "lyric-line";
    const span = document.createElement("span");
    span.className = "lyric-text";
    span.textContent = text || " ";
    div.appendChild(span);
    container.appendChild(div);
  };

  if (lyrics?.synced) {
    // Format LRC: [mm:ss.xx] teks
    lyrics.synced.split("\n").forEach((line) => {
      const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
      if (!m) return;
      const text = m[3].trim();
      if (!text) return;
      parsedLyrics.push({ time: parseInt(m[1], 10) * 60 + parseFloat(m[2]), text });
      addLine(text);
    });
  } else if (lyrics?.plain) {
    container.classList.add("plain");
    lyrics.plain.split("\n").forEach(addLine);
  } else {
    container.textContent = "No lyrics found for this song on LRCLIB.";
  }
  setupRomanization();
}

// ---------- ROMANIZATION (Korean and Japanese lyrics, optional) ----------
// Off by default. The choice is remembered; the button only shows for songs
// with Korean or Japanese lyrics.
chrome.storage.local.get({ romanize: false }).then(({ romanize }) => {
  romanizeOn = romanize;
  $("romanize-btn").setAttribute("aria-pressed", String(romanizeOn));
  applyRomanization();
});

function setupRomanization() {
  const texts = [...document.querySelectorAll("#lyrics-container .lyric-text")].map((el) => el.textContent);
  lyricsLang = Romanize.detect(texts.join("\n"));
  $("romanize-btn").hidden = !lyricsLang;
  $("romanize-note").textContent = lyricsLang === "ja" ? "Japanese lyrics" : lyricsLang === "ko" ? "Korean lyrics" : "";
  $("lyric-offset").hidden = !parsedLyrics.length;
  $("lyrics-head").hidden = !lyricsLang && !parsedLyrics.length;
  loadLyricOffset();
  applyRomanization();
}

async function loadLyricOffset() {
  const key = lyricsKey;
  const { lyricOffsets } = await chrome.storage.local.get({ lyricOffsets: {} });
  if (key !== lyricsKey) return;
  lyricOffset = lyricOffsets[key] || 0;
  renderLyricOffset();
}

function renderLyricOffset() {
  $("offset-value").textContent = `${lyricOffset > 0 ? "+" : ""}${lyricOffset.toFixed(1)}s`;
  lastActiveIdx = -1;
  if (state.status) highlightLyric(state.status.time);
}

async function changeLyricOffset(delta) {
  const key = lyricsKey;
  lyricOffset = Math.round((lyricOffset + delta) * 10) / 10;
  renderLyricOffset();
  const { lyricOffsets } = await chrome.storage.local.get({ lyricOffsets: {} });
  delete lyricOffsets[key];
  if (lyricOffset) lyricOffsets[key] = lyricOffset;
  const entries = Object.entries(lyricOffsets).slice(-MAX_OFFSETS); // newest last
  await chrome.storage.local.set({ lyricOffsets: Object.fromEntries(entries) });
}

$("offset-minus").addEventListener("click", () => changeLyricOffset(-0.5));
$("offset-plus").addEventListener("click", () => changeLyricOffset(0.5));

async function applyRomanization() {
  const container = $("lyrics-container");
  const lines = [...container.querySelectorAll(".lyric-line")];
  lines.forEach((line) => line.querySelector(".lyric-roman")?.remove());
  container.classList.remove("romanized");
  if (!romanizeOn || !lyricsLang) return;
  const key = lyricsKey;
  if (lyricsLang === "ja") {
    try {
      $("romanize-note").textContent = "Loading Japanese readings...";
      await Romanize.loadJapanese();
      $("romanize-note").textContent = "Japanese lyrics";
    } catch (_) {
      $("romanize-note").textContent = "Couldn't load Japanese readings";
      return;
    }
    if (key !== lyricsKey || !romanizeOn) return; // song changed or turned off meanwhile
  }
  for (const line of lines) {
    if (line.querySelector(".lyric-roman")) continue;
    const roman = Romanize.romanize(line.querySelector(".lyric-text").textContent, lyricsLang);
    if (!roman) continue;
    const span = document.createElement("span");
    span.className = "lyric-roman";
    span.lang = lyricsLang === "ja" ? "ja-Latn" : "ko-Latn";
    span.textContent = roman;
    line.appendChild(span);
  }
  container.classList.add("romanized");
}

$("romanize-btn").addEventListener("click", () => {
  romanizeOn = !romanizeOn;
  $("romanize-btn").setAttribute("aria-pressed", String(romanizeOn));
  chrome.storage.local.set({ romanize: romanizeOn });
  applyRomanization();
  if (activeTab === "lyrics") requestAnimationFrame(scrollActiveLyric);
});

// The player reports its position every 500 ms. Between reports the position
// is estimated, so lines change on time instead of up to half a second late.
let statusAt = 0;
setInterval(() => {
  const s = state.status;
  if (!s || s.state !== 1 || !parsedLyrics.length || !statusAt) return;
  highlightLyric(s.time + (performance.now() - statusAt) / 1000);
}, 100);

function scrollActiveLyric() {
  scrollPanelTo($("lyrics-container").querySelector(".lyric-line.active"), true);
}

function highlightLyric(currentTime) {
  if (!parsedLyrics.length) return;
  const t = currentTime - lyricOffset;
  let activeIdx = -1;
  for (let i = 0; i < parsedLyrics.length; i++) {
    if (parsedLyrics[i].time <= t) activeIdx = i;
    else break;
  }
  if (activeIdx === lastActiveIdx) return;
  lastActiveIdx = activeIdx;
  const lines = $("lyrics-container").querySelectorAll(".lyric-line");
  lines.forEach((el, i) => el.classList.toggle("active", i === activeIdx));
  if (activeTab === "lyrics") scrollActiveLyric();
}

// ---------- SETTINGS ----------
$("api-key-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  await chrome.storage.local.set({ apiKey: $("api-key-input").value.trim() });
  setStatus("");
  showTab(lastContentTab);
});

// ---------- INIT ----------
(async () => {
  const { apiKey } = await chrome.storage.local.get({ apiKey: "" });
  $("api-key-input").value = apiKey;
  const startTab = new URLSearchParams(location.search).get("tab");
  showTab(startTab === "playlists" ? "playlists" : "queue");
  const res = await sw({ type: "GET_STATE" });
  if (res?.ok) {
    if (res.volume > 0) restoreVolume = res.volume;
    renderVolume(res.volume);
    state = { queue: res.queue, index: res.index, status: res.status };
    if (res.modes) renderModes(res.modes);
    render();
  } else {
    render();
  }
  renderPlaylists();
})();
