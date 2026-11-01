"use strict";

// A timeline of beats, 6 seconds each. shorts.sh passes the time it starts recording, so both start together.
const START_AT = Number(new URLSearchParams(location.search).get("start")) || Date.now() + 1000, BEAT_MS = 6000;
const number = new Intl.NumberFormat("en-US");
const fmt = (value) => (value === null || value === undefined ? "—" : number.format(value));
const escape = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const avatar = (url, size) => `${url}${url.includes("?") ? "&" : "?"}s=${size}`;

function countUp(node, target) {
  const started = performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - started) / 1800);
    node.textContent = `+${fmt(Math.round(target * (1 - (1 - progress) ** 3)))}`;
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function beats(state) {
  const { progress, github, games, libraries } = state;
  const target = (Math.floor(progress.done / 1000) + 1) * 1000;
  const pace = progress.week?.done > 0 ? progress.week.done / 7 : null;
  const days = pace ? Math.max(1, Math.round((target - progress.done) / pace)) : null;
  const list = [
    `<div class="kicker">AnyPS5 today</div>
     <div class="huge up-text" id="gain" data-gain="${progress.day?.done ?? 0}">+0</div>
     <div class="line">PS5 functions implemented in 24 hours</div>
     <div class="small">The project porting PS5 games to PC</div>`,
    `<div class="kicker">${fmt(progress.done)} done so far</div>
     <canvas id="short-map"></canvas>
     <div class="small">Each blue square is a PS5 system function that now works.</div>`,
  ];
  if (github?.topAuthors?.length) {
    list.push(`<div class="kicker">${fmt(github.merged24h)} PRs merged today</div>
      <div class="people">${github.topAuthors.slice(0, 3).map((person) => `<div class="person"><img src="${escape(avatar(person.avatar, 240))}" alt="">${escape(person.author)}<span>${fmt(person.merged)}</span></div>`).join("")}</div>
      <div class="small">Today's top contributors</div>`);
  }
  if (games?.recent?.length) {
    const reported = games.recent.filter((game) => game.stage).slice(0, 4);
    list.push(`<div class="kicker">${fmt(games.inGame)} games reach gameplay</div>
      <div class="games">${reported.map((game) => `<div class="game">${escape(game.name)}<small>${escape(game.stage)}</small></div>`).join("")}</div>
      <div class="small">Latest test reports</div>`);
  }
  list.push(`<div class="kicker">Next goal</div>
     <div class="huge">${fmt(target)}</div>
     <div class="bar-big"><span style="width:${(((progress.done % 1000) / 1000) * 100).toFixed(1)}%"></span></div>
     <div class="line">${fmt(target - progress.done)} to go${days ? ` · about ${days} day${days > 1 ? "s" : ""}` : ""}</div>
     <div class="sub">Subscribe for tomorrow's update</div>`);
  return list;
}

async function main() {
  const state = await (await fetch("/api/state", { cache: "no-store" })).json();
  const root = document.getElementById("short");
  // Five beats fill the 30 seconds; with fewer, each one simply lasts longer.
  const list = beats(state);
  root.innerHTML = list.map((html) => `<section class="beat">${html}</section>`).join("");
  const sections = [...root.children];
  sections[0].classList.add("on");
  const beatMs = Math.max(BEAT_MS, 30_000 / list.length);
  await document.fonts.ready;
  const canvas = document.getElementById("short-map");
  if (canvas && state.libraries) drawLibraryMap(canvas, state.libraries.all, { labels: false, background: "#0d0d0d" });
  setTimeout(() => {
    const gain = document.getElementById("gain");
    countUp(gain, Number(gain.dataset.gain));
    sections.forEach((section, index) => {
      if (index) setTimeout(() => {
        section.classList.add("on");
        sections[index - 1].classList.remove("on");
      }, index * beatMs);
    });
  }, Math.max(0, START_AT - Date.now()));
}

main();
