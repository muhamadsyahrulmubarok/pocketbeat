// PocketBeat - allow autoplay (Firefox only)
// Firefox blocks audible autoplay in the hidden player until autoplay is
// allowed for PocketBeat. That permission belongs to the extension's origin,
// and Firefox only offers it from the address bar of a tab. So this page tries
// to play the current song: Firefox shows its autoplay icon, the user allows
// autoplay, and the same permission unblocks the hidden player.

const YT_ORIGIN = "https://www.youtube.com";
const frame = document.getElementById("test-player");
let finished = false;
let retry = null;

function post(obj) {
  frame.contentWindow?.postMessage(JSON.stringify({ ...obj, id: 1, channel: "widget" }), YT_ORIGIN);
}

async function start() {
  const res = await chrome.runtime.sendMessage({ target: "sw", type: "GET_STATE" }).catch(() => null);
  const videoId = res?.queue?.[res.index]?.videoId;
  if (!videoId) {
    frame.remove();
    document.getElementById("waiting").hidden = true;
    document.getElementById("no-song").hidden = false;
    return;
  }
  const params = new URLSearchParams({
    enablejsapi: "1",
    autoplay: "1",
    controls: "0",
    playsinline: "1",
    origin: location.origin,
  });
  frame.src = `${YT_ORIGIN}/embed/${encodeURIComponent(videoId)}?${params}`;
  frame.addEventListener("load", () => post({ event: "listening" }));
  // The permission applies without a reload, so keep asking until it plays.
  retry = setInterval(() => {
    post({ event: "listening" });
    post({ event: "command", func: "playVideo", args: [] });
  }, 1500);
}

window.addEventListener("message", (e) => {
  if (e.origin !== YT_ORIGIN || e.source !== frame.contentWindow) return;
  let data;
  try {
    data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
  } catch (_) {
    return;
  }
  const state = data.event === "onStateChange" ? data.info : data.info?.playerState;
  if (state === 1) finish();
});

async function finish() {
  if (finished) return;
  finished = true;
  clearInterval(retry);
  post({ event: "command", func: "pauseVideo", args: [] });
  frame.remove();
  document.getElementById("waiting").hidden = true;
  document.getElementById("done").hidden = false;
  await chrome.runtime.sendMessage({ target: "sw", type: "CONTROL", action: "resume" }).catch(() => {});
  setTimeout(async () => {
    const tab = await chrome.tabs.getCurrent();
    if (tab) chrome.tabs.remove(tab.id);
  }, 2500);
}

start();
