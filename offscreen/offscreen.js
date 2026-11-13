// PocketBeat - offscreen player
// A hidden document that stays alive after the popup closes. It holds a
// YouTube embed iframe driven through the YouTube IFrame API postMessage
// protocol (the iframe_api script itself cannot be loaded in MV3).

const YT_ORIGIN = "https://www.youtube.com";

// YouTube playerState: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
const player = { videoId: null, state: -1, time: 0, duration: 0, volume: 100 };
let iframe = null;
let ready = false;
let pending = [];
let handshakeTimer = null;
let lastReport = 0;

function post(obj) {
  iframe?.contentWindow?.postMessage(JSON.stringify({ ...obj, id: 1, channel: "widget" }), YT_ORIGIN);
}

function command(func, args = []) {
  if (!ready) {
    pending.push([func, args]);
    return;
  }
  post({ event: "command", func, args });
}

function report(force = false) {
  const now = Date.now();
  if (!force && now - lastReport < 500) return;
  lastReport = now;
  chrome.runtime.sendMessage({ target: "broadcast", type: "PLAYER_STATUS", ...player }).catch(() => {});
}

function createPlayer(videoId, start) {
  if (handshakeTimer) clearInterval(handshakeTimer);
  iframe?.remove();
  ready = false;
  pending = [];

  const params = new URLSearchParams({
    enablejsapi: "1",
    autoplay: "1",
    playsinline: "1",
    controls: "0",
    cc_load_policy: "0",
    iv_load_policy: "3",
    origin: location.origin,
    start: String(Math.floor(start || 0)),
  });
  iframe = document.createElement("iframe");
  iframe.allow = "autoplay; encrypted-media";
  iframe.width = "320";
  iframe.height = "180";
  iframe.src = `${YT_ORIGIN}/embed/${encodeURIComponent(videoId)}?${params}`;
  iframe.addEventListener("load", () => {
    // Handshake: ask the iframe to start sending events, repeat until onReady.
    post({ event: "listening" });
    handshakeTimer = setInterval(() => {
      if (ready) clearInterval(handshakeTimer);
      else post({ event: "listening" });
    }, 250);
  });
  document.body.appendChild(iframe);
}

function applyVolume() {
  command("setVolume", [player.volume]);
  command(player.volume > 0 ? "unMute" : "mute");
}

function load(videoId, start = 0, volume) {
  player.videoId = videoId;
  player.time = start;
  player.duration = 0;
  player.state = 3;
  if (typeof volume === "number") player.volume = volume;
  report(true);
  if (iframe && ready) {
    // Reuse the iframe: faster than creating a new one.
    command("loadVideoById", [{ videoId, startSeconds: start }]);
  } else {
    createPlayer(videoId, start);
  }
  // New iframe: queued until onReady. Existing iframe: applied immediately.
  applyVolume();
}

function setState(state) {
  if (typeof state !== "number" || state === player.state) return;
  player.state = state;
  report(true);
}

window.addEventListener("message", (e) => {
  if (e.origin !== YT_ORIGIN || e.source !== iframe?.contentWindow) return;
  let data;
  try {
    data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
  } catch (_) {
    return;
  }

  if ((data.event === "onReady" || data.event === "initialDelivery") && !ready) {
    ready = true;
    pending.forEach(([func, args]) => post({ event: "command", func, args }));
    pending = [];
  }
  if (data.event === "infoDelivery" || data.event === "initialDelivery") {
    const info = data.info || {};
    if (typeof info.currentTime === "number") player.time = info.currentTime;
    if (typeof info.duration === "number" && info.duration > 0) player.duration = info.duration;
    if (info.videoData?.video_id) player.videoId = info.videoData.video_id;
    if (typeof info.volume === "number") player.playerVolume = info.volume;
    if (typeof info.muted === "boolean") player.muted = info.muted;
    if (typeof info.playerState === "number") setState(info.playerState);
    report();
  }
  if (data.event === "onStateChange") setState(data.info);
  if (data.event === "onError") {
    // 101/150: the owner disallows playback outside YouTube; 100: not found.
    chrome.runtime
      .sendMessage({ target: "sw", type: "PLAYER_ERROR", code: data.info, videoId: player.videoId })
      .catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || msg.target !== "offscreen") return;
  switch (msg.type) {
    case "LOAD":
      load(msg.videoId, msg.start || 0, msg.volume);
      break;
    case "SET_VOLUME":
      player.volume = msg.volume;
      applyVolume();
      break;
    case "TOGGLE":
      command(player.state === 1 || player.state === 3 ? "pauseVideo" : "playVideo");
      break;
    case "PLAY":
      command("playVideo");
      break;
    case "PAUSE":
      command("pauseVideo");
      break;
    case "SEEK":
      command("seekTo", [msg.time, true]);
      player.time = msg.time;
      report(true);
      break;
    case "GET_STATUS":
      break;
  }
  sendResponse({ ok: true, ...player });
});
