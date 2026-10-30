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
      const pill = pr.added > 0 ? `<span class="pill">+${fmt(pr.added)} function${pr.added > 1 ? "s" : ""}</span>` : "";
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

// Same layout as the progress map in AnyPS5's README (tools/progress.py): a squarified treemap of
// the libraries by size, each filled with one cell per function, implemented ones first.
function worstRatio(row, side) {
  const area = row.reduce((sum, value) => sum + value, 0);
  return Math.max(...row.map((value) => Math.max((side * side * value) / (area * area), (area * area) / (side * side * value))));
}

function placeRow(row, x, y, w, h, rects) {
  const thickness = row.reduce((sum, value) => sum + value, 0) / Math.min(w, h);
  let offset = 0;
  for (const area of row) {
    const length = area / thickness;
    rects.push(w >= h ? [x, y + offset, thickness, length] : [x + offset, y, length, thickness]);
    offset += length;
  }
  return w >= h ? [x + thickness, y, w - thickness, h] : [x, y + thickness, w, h - thickness];
}

function squarify(values, x, y, w, h) {
  const total = values.reduce((sum, value) => sum + value, 0);
  const areas = values.map((value) => (value * w * h) / total);
  const rects = [];
  let row = [];
  while (areas.length) {
    const side = Math.min(w, h);
    if (!row.length || worstRatio([...row, areas[0]], side) <= worstRatio(row, side)) {
      row.push(areas.shift());
      continue;
    }
    [x, y, w, h] = placeRow(row, x, y, w, h, rects);
    row = [];
  }
  if (row.length) placeRow(row, x, y, w, h, rects);
  return rects;
}

function cells(count, x, y, w, h) {
  if (!count || w <= 0 || h <= 0) return [];
  const rows = Math.max(1, Math.min(count, Math.round(Math.sqrt((count * h) / w))));
  const result = [];
  for (let r = 0; r < rows; r += 1) {
    const inRow = Math.floor(count / rows) + (r < count % rows ? 1 : 0);
    const cw = w / inRow;
    for (let c = 0; c < inRow; c += 1) result.push([x + c * cw, y + (r * h) / rows, cw, h / rows]);
  }
  return result;
}

let mapKey = "";
function renderMap(libraries) {
  if (!libraries) return;
  $("map-meta").textContent = `${fmt(libraries.count)} libraries · ${fmt(libraries.complete)} complete`;
  const canvas = $("map");
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const key = `${width}x${height}|${libraries.all.map((library) => `${library.name}:${library.done}/${library.total}`).join(",")}`;
  if (!width || !height || key === mapKey) return;
  mapKey = key;
  canvas.width = width;
  canvas.height = height;
  const style = getComputedStyle(document.documentElement);
  const colors = {
    surface: style.getPropertyValue("--surface").trim(),
    done: style.getPropertyValue("--series-1").trim(),
    todo: style.getPropertyValue("--todo").trim(),
    ink: style.getPropertyValue("--ink").trim(),
  };
  const context = canvas.getContext("2d");
  context.fillStyle = colors.surface;
  context.fillRect(0, 0, width, height);

  const groups = libraries.all;
  const rects = squarify(groups.map((group) => group.total), 0, 0, width, height);
  groups.forEach((group, index) => {
    const [x, y, w, h] = rects[index];
    const list = cells(group.total, x + 1, y + 1, w - 2, h - 2);
    list.forEach(([cx, cy, cw, ch], cell) => {
      const inset = Math.min(0.5, cw / 4, ch / 4);
      context.fillStyle = cell < group.done ? colors.done : colors.todo;
      context.fillRect(cx + inset, cy + inset, cw - 2 * inset, ch - 2 * inset);
    });
    context.strokeStyle = colors.surface;
    context.lineWidth = 2;
    context.strokeRect(x, y, w, h);

    const room = Math.floor((w - 12) / 8);
    const label = room > 0 ? group.label.slice(0, room) : "";
    if ((label === group.label || label.length >= 3) && h > 26) {
      context.font = "600 14px Inter, system-ui, sans-serif";
      context.lineJoin = "round";
      context.lineWidth = 4;
      context.strokeStyle = colors.surface;
      context.strokeText(label, x + 6, y + 19);
      context.fillStyle = colors.ink;
      context.fillText(label, x + 6, y + 19);
    }
  });
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
