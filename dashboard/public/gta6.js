"use strict";

// The official date, in UTC since the launch hour is not the same everywhere. If Rockstar moves it, change it here.
const RELEASE = Date.parse("2026-11-19T00:00:00Z");
const RELOAD_MS = 6 * 3_600_000, CTA_MS = 15_000;
const CTAS = ["👍 Like if you're counting down too", "🔔 Subscribe to follow GTA VI on AnyPS5", "💬 Buying it on day one? Tell the chat"];
const THIS_GAME = /grand theft auto\s*(vi|6)\b|\bgta\s*(vi|6)\b/i;
const number = new Intl.NumberFormat("en-US");
const fmt = (value) => (value === null || value === undefined ? "—" : number.format(value));
const escape = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const $ = (id) => document.getElementById(id);
const pad = (value) => String(value).padStart(2, "0");

// A cover is optional and supplied by whoever runs the stream: PAGE=gta6.html?cover=https://...
function showCover() {
  const url = new URLSearchParams(location.search).get("cover");
  if (!url?.startsWith("https://")) return;
  $("cover").src = url;
  $("cover").hidden = false;
  $("hero").classList.add("has-cover");
}

function tick() {
  const left = RELEASE - Date.now();
  if (left <= 0) $("clock-label").textContent = "Out on consoles for";
  const seconds = Math.floor(Math.abs(left) / 1000);
  const units = [[Math.floor(seconds / 86400), "days"], [pad(Math.floor(seconds / 3600) % 24), "hours"], [pad(Math.floor(seconds / 60) % 60), "minutes"], [pad(seconds % 60), "seconds"]];
  $("count").innerHTML = units.map(([value, label]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join("");
  $("cta").textContent = CTAS[Math.floor(Date.now() / CTA_MS) % CTAS.length];
}

const stageClass = (stage) => (!stage ? "open" : stage === "In game" ? "" : "early");
let mapKey = "";

function render(state) {
  const thread = state.games?.rockstar?.find((game) => THIS_GAME.test(game.name));
  if (thread) {
    $("port-status").textContent = thread.stage ? `First reports: ${thread.stage}` : "First reports are in";
    $("port-note").textContent = `${fmt(thread.replies)} replies in its AnyPS5 test thread.`;
  } else if (Date.now() >= RELEASE) {
    $("port-status").textContent = "Out, no test report yet";
    $("port-note").textContent = "Waiting for the first AnyPS5 report.";
  }
  $("stat-done").textContent = fmt(state.progress?.done);
  $("stat-gain").textContent = state.progress?.day ? `+${fmt(state.progress.day.done)} in 24 h` : "";
  $("stat-games").textContent = fmt(state.games?.inGame);
  $("stat-merged").textContent = fmt(state.github?.merged24h);
  const games = (state.games?.rockstar ?? []).filter((game) => !THIS_GAME.test(game.name)).slice(0, 6);
  $("games").innerHTML = games.map((game) => `<li><span class="gta-game-name">${escape(game.name)}</span><span class="gta-game-stage ${stageClass(game.stage)}">${escape(game.stage ?? "Being tested")}</span></li>`).join("");
  const pr = state.github?.mergedPrs?.[0];
  $("latest").innerHTML = pr ? `<strong>Latest change:</strong> ${escape(pr.title)} · ${escape(pr.author)}` : "";
  const libraries = state.libraries?.all;
  const key = libraries?.map((library) => `${library.name}:${library.done}`).join(",");
  if (key && key !== mapKey) {
    mapKey = key;
    drawLibraryMap($("map"), libraries);
  }
}

async function refresh() {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (response.ok) render(await response.json());
  } catch (error) {
    console.error("refresh", error);
  }
}

showCover();
tick();
setInterval(tick, 1000);
refresh();
setInterval(refresh, 15_000);
setTimeout(() => location.reload(), RELOAD_MS);
