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

const cover = (game) => `<div class="cover-tile"><img src="${escape(game.cover)}" alt=""><div class="cover-title">${escape(game.name)}</div></div>`;

// Written for someone who lands on this in a feed and has never heard of the project.
function beats(state) {
  const { progress, github, games } = state;
  const target = (Math.floor(progress.done / 1000) + 1) * 1000;
  const pace = progress.week?.done > 0 ? progress.week.done / 7 : null;
  const days = pace ? Math.max(1, Math.round((target - progress.done) / pace)) : null;
  const highlights = games?.highlights?.slice(0, 6) ?? [];
  const list = [
    `${highlights.length >= 4 ? `<div class="collage">${highlights.slice(0, 4).map((game) => `<img src="${escape(game.cover)}" alt="">`).join("")}</div>` : ""}
     <div class="headline">PS5 games on PC.<br><span class="up-text">No emulator.</span></div>
     <div class="line-soft">AnyPS5 is a community project that converts them to run natively on Windows and Linux.</div>`,
  ];
  if (highlights.length && games.inGame) {
    list.push(`<div class="kicker">${fmt(games.inGame)} games already reach gameplay</div>
      <div class="covers">${highlights.map(cover).join("")}</div>
      <div class="small">Reported by testers. Most can't be finished yet: it's still early.</div>`);
  }
  list.push(`<div class="kicker">What's left to build</div>
     <div class="line">Games call PS5 system functions. PC needs its own version of each one.</div>
     <canvas id="short-map"></canvas>
     <div class="line"><span class="up-text">${fmt(progress.done)}</span> rebuilt · <span class="up-text" id="gain" data-gain="${progress.day?.done ?? 0}">+0</span> in 24 hours</div>`);
  if (github?.topAuthors?.length) {
    list.push(`<div class="kicker">Built in the open</div>
      <div class="line">${fmt(github.merged24h)} code changes added in the last 24 hours</div>
      <div class="people">${github.topAuthors.slice(0, 3).map((person) => `<div class="person"><img src="${escape(avatar(person.avatar, 240))}" alt="">${escape(person.author)}<span>${fmt(person.merged)}</span></div>`).join("")}</div>`);
  }
  list.push(`<div class="kicker">Next goal</div>
     <div class="huge">${fmt(target)}</div>
     <div class="bar-big"><span style="width:${(((progress.done % 1000) / 1000) * 100).toFixed(1)}%"></span></div>
     <div class="line">functions rebuilt${days ? `, in about ${days} day${days > 1 ? "s" : ""}` : ""}</div>
     <div class="sub">Subscribe for tomorrow's update</div>`);
  return list;
}

async function main() {
  const state = await (await fetch("/api/state", { cache: "no-store" })).json();
  const root = document.getElementById("short");
  // Five beats fill the 30 seconds; with fewer, each one simply lasts longer.
  const list = beats(state);
  root.innerHTML = list.map((html) => `<section class="beat">${html}</section>`).join("") + `<div class="short-brand">AnyPS5 · PS5 games on PC</div>`;
  const sections = [...root.querySelectorAll(".beat")];
  sections[0].classList.add("on");
  const beatMs = Math.max(BEAT_MS, 30_000 / list.length);
  await Promise.all([document.fonts.ready, ...[...root.querySelectorAll("img")].map((image) => image.decode().catch(() => {}))]);
  const canvas = document.getElementById("short-map");
  if (canvas && state.libraries) drawLibraryMap(canvas, state.libraries.all, { labels: false, background: "#0d0d0d" });
  setTimeout(() => {
    sections.forEach((section, index) => {
      if (index) setTimeout(() => {
        section.classList.add("on");
        sections[index - 1].classList.remove("on");
        const gain = section.querySelector("#gain");
        if (gain) countUp(gain, Number(gain.dataset.gain));
      }, index * beatMs);
    });
  }, Math.max(0, START_AT - Date.now()));
}

main();
