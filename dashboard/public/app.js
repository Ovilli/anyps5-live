"use strict";

const REFRESH_MS = 15_000;
const RELOAD_MS = 6 * 3_600_000;
const KIND_COLORS = {
  discovery: "var(--series-1)",
  jump: "var(--series-2)",
  percent: "var(--series-3)",
  milestone: "var(--series-4)",
  complete: "var(--series-5)",
  release: "var(--series-7)",
  library: "var(--series-8)",
};

const numberFormat = new Intl.NumberFormat("en-US");
const fmt = (value) => (value === null || value === undefined ? "—" : numberFormat.format(value));
const pct = (value) => `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const signed = (value) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${fmt(Math.abs(value))}`;
const $ = (id) => document.getElementById(id);
const escape = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const avatar = (url, size) => `${url}${url.includes("?") ? "&" : "?"}s=${size}`;
const shortDate = (iso) => new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });

function ago(iso) {
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}

function tickClock() {
  $("clock").textContent = new Date().toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false });
}

function renderKpis(state) {
  const progress = state.progress;
  if (progress) {
    $("hero-percent").textContent = pct(progress.percent);
    $("hero-count").textContent = `${fmt(progress.done)} / ${fmt(progress.total)} functions`;
    const parts = [];
    if (progress.day) parts.push(`<span class="up">${signed(progress.day.done)}</span> in 24h`);
    if (progress.week) parts.push(`<span class="up">${signed(progress.week.done)}</span> in 7 days`);
    $("hero-delta").innerHTML = parts.join(" · ") || "&nbsp;";
    $("hero-meter").style.width = `${Math.min(100, progress.percent)}%`;
  }
  const github = state.github;
  if (github) {
    $("kpi-merged24").textContent = fmt(github.merged24h);
    $("kpi-merged7").textContent = `${fmt(github.merged7d)} this week`;
    $("kpi-open-prs").textContent = fmt(github.openPrs);
    $("kpi-stars").textContent = fmt(github.stars);
    $("kpi-release").textContent = github.release ? `latest release ${github.release.tag}` : "";
  }
  if (state.games) {
    $("kpi-playable").textContent = fmt(state.games.playable);
    $("kpi-menus").textContent = `${fmt(state.games.menus)} reach menus`;
  }
}

function niceMax(value) {
  const step = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / step) * step;
}

function renderChart(history) {
  const svg = $("chart");
  const width = svg.clientWidth, height = svg.clientHeight;
  if (!history.length || !width || !height) return;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const left = 58, right = 118, top = 10, bottom = 30;
  const times = history.map((point) => Date.parse(`${point.date}T12:00:00Z`));
  const first = times[0], last = times[times.length - 1];
  const yMax = niceMax(Math.max(...history.map((point) => point.total)) * 1.05);
  const x = (time) => left + ((time - first) / Math.max(1, last - first)) * (width - left - right);
  const y = (value) => top + (1 - value / yMax) * (height - top - bottom);
  const path = (key) => history.map((point, index) => `${index ? "L" : "M"}${x(times[index]).toFixed(1)},${y(point[key]).toFixed(1)}`).join("");

  const parts = [];
  for (let index = 0; index <= 3; index += 1) {
    const value = (yMax / 3) * index;
    const py = y(value);
    parts.push(`<line class="${index ? "grid" : "axis"}" x1="${left}" x2="${width - right + 8}" y1="${py}" y2="${py}"/>`);
    parts.push(`<text class="tick" x="${left - 10}" y="${py + 5}" text-anchor="end">${value >= 1000 ? `${fmt(Math.round(value / 1000))}k` : fmt(value)}</text>`);
  }
  for (let time = first; time <= last; time += 14 * 86_400_000) {
    parts.push(`<text class="tick" x="${x(time)}" y="${height - 6}" text-anchor="middle">${shortDate(new Date(time).toISOString())}</text>`);
  }
  parts.push(`<path class="area" d="${path("done")}L${x(last)},${y(0)}L${x(first)},${y(0)}Z" fill="var(--series-1)"/>`);
  parts.push(`<path class="line" d="${path("total")}" stroke="var(--series-2)"/>`);
  parts.push(`<path class="line" d="${path("done")}" stroke="var(--series-1)"/>`);

  const end = history[history.length - 1];
  const doneY = y(end.done), totalY = y(end.total);
  const gap = Math.abs(doneY - totalY) < 44 ? 44 : 0;
  parts.push(`<text class="end-label" x="${x(last) + 14}" y="${totalY + 4}">${fmt(end.total)}</text>`);
  parts.push(`<text class="end-note" x="${x(last) + 14}" y="${totalY + 22}">declared</text>`);
  parts.push(`<text class="end-label" x="${x(last) + 14}" y="${doneY + 4 + gap}">${fmt(end.done)}</text>`);
  parts.push(`<text class="end-note" x="${x(last) + 14}" y="${doneY + 22 + gap}">implemented</text>`);
  svg.innerHTML = parts.join("");
}

function renderPrs(github) {
  if (!github) return;
  const list = $("prs");
  const known = new Set([...list.querySelectorAll(".pr")].map((node) => node.dataset.number));
  list.innerHTML = github.mergedPrs
    .slice(0, 6)
    .map((pr) => {
      const fresh = known.size && !known.has(String(pr.number)) ? " fresh" : "";
      const implemented = pr.report?.implemented ?? 0, declared = pr.report?.declared ?? 0;
      const pill = implemented > 0
        ? `<span class="pill">+${fmt(implemented)} function${implemented > 1 ? "s" : ""}</span>`
        : declared > 0 ? `<span class="pill declared">+${fmt(declared)} declared</span>` : "";
      return `<li class="pr${fresh}" data-number="${pr.number}"><img class="avatar" src="${avatar(pr.avatar, 88)}" alt=""><div class="pr-text"><div class="pr-title">${escape(pr.title)}</div><div class="pr-meta">#${pr.number} · ${escape(pr.author)} · ${ago(pr.mergedAt)}</div></div>${pill}</li>`;
    })
    .join("");
}

function renderEvents(events) {
  const list = events.filter((event) => event.kind !== "game").slice(0, 5);
  $("events").innerHTML = list.length
    ? list
        .map((event) => `<li class="event"><span class="event-dot" style="background:${KIND_COLORS[event.kind] ?? "var(--series-1)"}"></span><span class="event-title">${escape(event.title)}</span><span class="event-date">${shortDate(event.time)}</span></li>`)
        .join("")
    : `<li class="empty">Nothing yet.</li>`;
}

function renderGames(games) {
  if (!games) return;
  $("games-meta").textContent = `${fmt(games.tracked)} tracked`;
  const max = Math.max(1, ...games.stages.map((stage) => stage.count));
  $("stages").innerHTML = games.stages
    .map((stage) => `<div class="stage"><span class="label">${escape(stage.name)}</span><span class="bar"><span style="width:${((stage.count / max) * 100).toFixed(1)}%"></span></span><span class="count">${fmt(stage.count)}</span></div>`)
    .join("");
}

let mapKey = "";
function renderMap(libraries) {
  if (!libraries) return;
  $("map-meta").textContent = `${fmt(libraries.count)} libraries · ${fmt(libraries.complete)} complete`;
  const canvas = $("map");
  const key = `${canvas.clientWidth}x${canvas.clientHeight}|${libraries.all.map((library) => `${library.name}:${library.done}/${library.total}`).join(",")}`;
  if (key === mapKey) return;
  mapKey = key;
  drawLibraryMap(canvas, libraries.all);
}

async function refresh() {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    const state = await response.json();
    renderKpis(state);
    renderChart(state.history);
    renderPrs(state.github);
    renderEvents(state.events);
    renderGames(state.games);
    renderMap(state.libraries);
  } catch (error) {
    console.error("refresh", error);
  }
}

tickClock();
setInterval(tickClock, 5000);
refresh();
setInterval(refresh, REFRESH_MS);
setTimeout(() => location.reload(), RELOAD_MS);
