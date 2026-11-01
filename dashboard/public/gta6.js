"use strict";

// The official date, in UTC since the launch hour is not the same everywhere. If Rockstar moves it, change it here.
const RELEASE = Date.parse("2026-11-19T00:00:00Z");
const RELOAD_MS = 6 * 3_600_000, ROTATE_MS = 10_000;
const CTAS = ["👍 Like if you're counting down too", "🔔 Subscribe so you don't miss the launch", "💬 Tell us: are you buying it day one?"];
const THIS_GAME = /grand theft auto\s*(vi|6)\b|\bgta\s*(vi|6)\b/i;
const number = new Intl.NumberFormat("en-US");
const fmt = (value) => number.format(value);
const $ = (id) => document.getElementById(id);
const pad = (value) => String(value).padStart(2, "0");
const turn = () => Math.floor(Date.now() / ROTATE_MS);
let facts = [];

function drawSkyline() {
  let seed = 7, x = 0, bars = "";
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  while (x < 1920) {
    const width = 26 + random() * 62;
    const center = Math.abs(x - 960) / 960;
    const height = 50 + random() * 90 + (1 - center) * 130 * random();
    bars += `<rect x="${x.toFixed(0)}" y="${(300 - height).toFixed(0)}" width="${width.toFixed(0)}" height="${height.toFixed(0)}"/>`;
    x += width + random() * 8;
  }
  $("skyline").innerHTML = bars;
}

function tick() {
  const left = RELEASE - Date.now();
  if (left <= 0) {
    $("kicker").textContent = "It's out. Time since launch";
    $("when").textContent = "Out now on PS5 and Xbox Series X|S";
  }
  const seconds = Math.floor(Math.abs(left) / 1000);
  const units = [[Math.floor(seconds / 86400), "days"], [pad(Math.floor(seconds / 3600) % 24), "hours"], [pad(Math.floor(seconds / 60) % 60), "min"], [pad(seconds % 60), "sec"]];
  $("count").innerHTML = units.map(([value, label]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join("");
  $("cta").textContent = CTAS[turn() % CTAS.length];
  $("fact").textContent = facts.length ? facts[turn() % facts.length] : "";
}

function render(state) {
  const thread = state.games?.rockstar?.find((game) => THIS_GAME.test(game.name));
  if (thread) {
    $("pc-status").textContent = "Testing has started";
    $("pc-note").textContent = thread.stage ? `first report: ${thread.stage}` : "first reports are in";
  } else if (Date.now() >= RELEASE) {
    $("pc-note").textContent = "no test report yet";
  }
  const next = [];
  if (state.games?.inGame) next.push(`🎮 ${fmt(state.games.inGame)} PS5 games already reach gameplay on PC with fan project AnyPS5`);
  const known = { "Red Dead Redemption": "🤠 Red Dead Redemption already reaches gameplay in AnyPS5 tests", "Grand Theft Auto V": "🚗 GTA V is being tested on PC right now with AnyPS5" };
  for (const game of state.games?.rockstar ?? []) {
    if (game.name === "Red Dead Redemption" && game.stage === "In game") next.push(known[game.name]);
    if (game.name === "Grand Theft Auto V") next.push(known[game.name]);
  }
  next.push("🌴 One screen, one countdown, live until launch day");
  facts = next;
}

async function refresh() {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (response.ok) render(await response.json());
  } catch (error) {
    console.error("refresh", error);
  }
}

drawSkyline();
tick();
setInterval(tick, 1000);
refresh();
setInterval(refresh, 15_000);
setTimeout(() => location.reload(), RELOAD_MS);
