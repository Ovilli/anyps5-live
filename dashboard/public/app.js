"use strict";

const REFRESH_MS = 15_000;
const RELOAD_MS = 6 * 3_600_000;
const SOURCES = {
  progress: { label: "Progress", staleMinutes: 40 },
  history: { label: "History", staleMinutes: 90 },
  github: { label: "GitHub", staleMinutes: 20 },
  repo: { label: "Repo", staleMinutes: 70 },
  search: { label: "Search", staleMinutes: 30 },
  roadmap: { label: "Roadmap", staleMinutes: 400 },
  games: { label: "Games", staleMinutes: 90 },
};
const KINDS = {
  discovery: { label: "Discovery", color: "var(--series-1)" },
  jump: { label: "Big jump", color: "var(--series-2)" },
  percent: { label: "Progress", color: "var(--series-3)" },
  milestone: { label: "Milestone", color: "var(--series-4)" },
  complete: { label: "Completed", color: "var(--series-5)" },
  game: { label: "Game", color: "var(--series-6)" },
  release: { label: "Release", color: "var(--series-7)" },
  library: { label: "Library", color: "var(--series-8)" },
};

const numberFormat = new Intl.NumberFormat("en-US");
const fmt = (value) => (value === null || value === undefined ? "—" : numberFormat.format(value));
const pct = (value, digits = 2) => `${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
const signed = (value) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${fmt(Math.abs(value))}`;
const $ = (id) => document.getElementById(id);
const escape = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const avatar = (url, size) => `${url}${url.includes("?") ? "&" : "?"}s=${size}`;

function ago(iso) {
  if (!iso) return "—";
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}

function compactAgo(iso) {
  const minutes = Math.max(0, (Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${Math.floor(minutes)}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}

const shortDate = (iso) => new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });

function tickClocks() {
  const now = new Date();
  $("clock-utc").textContent = now.toLocaleTimeString("en-GB", { timeZone: "UTC", hour12: false });
  $("clock-paris").textContent = now.toLocaleTimeString("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false });
}

function renderSources(sources) {
  $("sources").innerHTML = Object.entries(SOURCES)
    .map(([key, { label, staleMinutes }]) => {
      const source = sources[key];
      let state = "";
      if (!source || !source.at) state = "down";
      else if (!source.ok || (Date.now() - Date.parse(source.at)) / 60000 > staleMinutes) state = "stale";
      return `<span class="source ${state}" title="${escape(source?.error ?? "")}"><span class="source-dot"></span>${label}</span>`;
    })
    .join("");
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
    $("kpi-shaders").textContent = pct(progress.shadersPercent, progress.shadersPercent === 100 ? 0 : 1);
    $("kpi-shaders-note").textContent = `${fmt(progress.shadersDone)} / ${fmt(progress.shadersTotal)} opcodes`;
  }
  const github = state.github;
  if (github) {
    $("kpi-merged24").textContent = fmt(github.merged24h);
    $("kpi-merged7").textContent = `${fmt(github.merged7d)} in 7 days`;
    $("kpi-open-prs").textContent = fmt(github.openPrs);
    $("kpi-issues").textContent = fmt(github.openIssues);
    $("kpi-stars").textContent = fmt(github.stars);
    $("kpi-forks").textContent = `${fmt(github.forks)} forks`;
    if (github.release) {
      $("kpi-release").textContent = github.release.tag;
      $("kpi-release-date").textContent = github.release.publishedAt ? `published ${ago(github.release.publishedAt)}` : "Windows and Linux";
    }
  }
  const games = state.games;
  if (games) {
    $("kpi-playable").textContent = fmt(games.playable);
    $("kpi-menus").textContent = `${fmt(games.menus)} reach menus`;
  }
}

function niceMax(value) {
  const step = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / step) * step;
}

function renderChart(history, events) {
  const svg = $("chart");
  if (!history.length) return;
  const width = 728, height = 372, left = 64, right = 150, top = 14, bottom = 34;
  const times = history.map((point) => Date.parse(`${point.date}T12:00:00Z`));
  const first = times[0], last = times[times.length - 1];
  const yMax = niceMax(Math.max(...history.map((point) => point.total)) * 1.05);
  const x = (time) => left + ((time - first) / Math.max(1, last - first)) * (width - left - right);
  const y = (value) => top + (1 - value / yMax) * (height - top - bottom);
  const path = (key) => history.map((point, index) => `${index ? "L" : "M"}${x(times[index]).toFixed(1)},${y(point[key]).toFixed(1)}`).join("");

  const parts = [];
  const ticks = 4;
  for (let index = 0; index <= ticks; index += 1) {
    const value = (yMax / ticks) * index;
    const py = y(value);
    parts.push(`<line class="${index ? "grid" : "axis"}" x1="${left}" x2="${width - right + 8}" y1="${py}" y2="${py}"/>`);
    parts.push(`<text class="tick" x="${left - 10}" y="${py + 5}" text-anchor="end">${value >= 1000 ? `${fmt(value / 1000)}k` : fmt(value)}</text>`);
  }
  const week = 7 * 86_400_000;
  for (let time = first; time <= last; time += week) {
    parts.push(`<text class="tick" x="${x(time)}" y="${height - 8}" text-anchor="middle">${shortDate(new Date(time).toISOString())}</text>`);
  }

  const doneArea = `${path("done")}L${x(last)},${y(0)}L${x(first)},${y(0)}Z`;
  parts.push(`<path class="area" d="${doneArea}" fill="var(--series-1)"/>`);
  parts.push(`<path class="line" d="${path("total")}" stroke="var(--series-2)"/>`);
  parts.push(`<path class="line" d="${path("done")}" stroke="var(--series-1)"/>`);

  const discoveries = new Set(events.filter((event) => event.kind === "discovery" && /PS5 exports declared/.test(event.title)).map((event) => event.time.slice(0, 10)));
  history.forEach((point, index) => {
    if (discoveries.has(point.date)) parts.push(`<circle class="discovery" cx="${x(times[index])}" cy="${y(point.total)}" r="6"/>`);
  });

  const end = history[history.length - 1];
  const doneY = y(end.done), totalY = y(end.total);
  const gap = Math.abs(doneY - totalY) < 44 ? 44 : 0;
  parts.push(`<text class="end-label" x="${x(last) + 14}" y="${totalY + 2}">${fmt(end.total)}</text>`);
  parts.push(`<text class="end-note" x="${x(last) + 14}" y="${totalY + 20}">declared</text>`);
  parts.push(`<text class="end-label" x="${x(last) + 14}" y="${doneY + 2 + gap}">${fmt(end.done)}</text>`);
  parts.push(`<text class="end-note" x="${x(last) + 14}" y="${doneY + 20 + gap}">implemented</text>`);
  svg.innerHTML = parts.join("");
}

function renderLibraries(libraries) {
  if (!libraries) return;
  const segments = [
    { value: libraries.complete, color: "var(--series-3)", label: "complete" },
    { value: libraries.started, color: "var(--series-1)", label: "in progress" },
    { value: libraries.untouched, color: "var(--axis)", label: "not started" },
  ];
  $("libs-meta").textContent = `${fmt(libraries.count)} libraries`;
  $("libs-split").innerHTML = segments.map((segment) => `<span style="flex:${segment.value};background:${segment.color}"></span>`).join("");
  $("libs-legend").innerHTML = segments
    .map((segment) => `<span><i class="dot" style="background:${segment.color}"></i><b>${fmt(segment.value)}</b> ${segment.label}</span>`)
    .join("");

  const row = (library, extra) => {
    const ratio = library.total ? (library.done / library.total) * 100 : 0;
    return `<div class="row-lib"><span class="name">${escape(library.name)}</span><span class="bar"><span style="width:${ratio.toFixed(1)}%"></span></span><span class="value">${extra ?? `${fmt(library.done)} / ${fmt(library.total)}`}</span></div>`;
  };
  $("movers-title").textContent = libraries.moversSince ? `Gains since ${shortDate(`${libraries.moversSince}T12:00:00Z`)}` : "Gains since yesterday";
  $("movers").innerHTML = libraries.movers.length
    ? libraries.movers.slice(0, 4).map((library) => row(library, `<span class="gain">${signed(library.gained)}</span> · ${fmt(library.done)}`)).join("")
    : `<div class="empty">First snapshot recorded: per-library gains show up after 24h.</div>`;
  $("biggest").innerHTML = libraries.biggest.slice(0, libraries.movers.length ? 6 : 8).map((library) => row(library)).join("");
}

function renderPrs(github) {
  if (!github) return;
  const list = $("prs");
  const known = new Set([...list.querySelectorAll(".pr")].map((node) => node.dataset.number));
  $("prs-meta").textContent = github.mergedPrs[0] ? `latest ${ago(github.mergedPrs[0].mergedAt)}` : "";
  list.innerHTML = github.mergedPrs
    .slice(0, 7)
    .map((pr) => {
      const fresh = known.size && !known.has(String(pr.number)) ? " fresh" : "";
      const pill = pr.added > 0 ? `<span class="pill up">+${fmt(pr.added)} function${pr.added > 1 ? "s" : ""}</span>` : pr.added === 0 ? `<span class="pill">quality</span>` : "";
      return `<li class="pr${fresh}" data-number="${pr.number}"><img class="avatar" src="${avatar(pr.avatar, 80)}" alt=""><div class="pr-text"><div class="pr-title">${escape(pr.title)}</div><div class="pr-meta">#${pr.number} · ${escape(pr.author)} · ${ago(pr.mergedAt)}</div></div>${pill}</li>`;
    })
    .join("");
}

function renderEvents(events) {
  const list = events.filter((event) => event.kind !== "game").slice(0, 6);
  $("events").innerHTML = list.length
    ? list
        .map((event) => {
          const kind = KINDS[event.kind] ?? KINDS.discovery;
          return `<li class="event"><span class="event-kind"><i style="background:${kind.color}"></i>${kind.label}</span><span class="event-title" title="${escape(event.detail ?? "")}">${escape(event.title)}</span><span class="event-date">${shortDate(event.time)}</span></li>`;
        })
        .join("")
    : `<li class="empty">No event yet.</li>`;
}

function renderGames(games) {
  if (!games) return;
  $("games-meta").textContent = `roadmap of ${shortDate(games.generatedAt)}`;
  $("games-kpis").innerHTML = `<span><b>${fmt(games.tracked)}</b>tracked</span><span><b>${fmt(games.menus)}</b>at menus</span><span><b>${fmt(games.blockers)}</b>blocked</span>`;
  const max = Math.max(1, ...games.stages.map((stage) => stage.count));
  $("stages").innerHTML = games.stages
    .map((stage) => `<div class="stage"><span class="label">${escape(stage.name)}</span><span class="bar"><span style="width:${((stage.count / max) * 100).toFixed(1)}%"></span></span><span class="count">${fmt(stage.count)}</span></div>`)
    .join("");
  const change = games.changes[0];
  $("game-change").innerHTML = change ? `<b>Latest change</b> · ${escape(change.text)}` : "";
}

function renderCi(github) {
  if (!github) return;
  $("ci-meta").textContent = github.authenticated ? "" : "no GitHub token";
  $("ci").innerHTML = github.ci
    .slice(0, 6)
    .map((run) => {
      let icon = "neutral", glyph = "–";
      if (run.status !== "completed") { icon = "running"; glyph = "●"; }
      else if (run.conclusion === "success") { icon = "good"; glyph = "✓"; }
      else if (run.conclusion === "failure" || run.conclusion === "timed_out") { icon = "bad"; glyph = "✕"; }
      return `<div class="ci-run"><span class="ci-icon ${icon}">${glyph}</span><span class="ci-name">${escape(run.workflow)}</span><span class="ci-time">${compactAgo(run.updatedAt)}</span></div>`;
    })
    .join("");
  $("commits").innerHTML = github.commits
    .slice(0, 4)
    .map((commit) => `<li class="commit"><span class="sha">${escape(commit.sha)}</span><span class="commit-text">${escape(commit.message)}</span></li>`)
    .join("");
}

function renderPeople(github) {
  if (!github) return;
  $("people-meta").textContent = `last ${fmt(github.contributorsWindow)} PRs`;
  const max = Math.max(1, ...github.contributors.map((person) => person.merged));
  $("people").innerHTML = github.contributors
    .slice(0, 8)
    .map((person) => `<li class="person"><img class="avatar" src="${avatar(person.avatar, 56)}" alt=""><div class="person-name"><div>${escape(person.login)}</div><div class="person-bar"><span style="width:${((person.merged / max) * 100).toFixed(0)}%"></span></div></div><span class="person-count">${fmt(person.merged)}</span></li>`)
    .join("");
}

let tickerText = "";
function renderTicker(state) {
  const items = [];
  for (const event of state.events.slice(0, 18)) items.push(`<span><b>${(KINDS[event.kind] ?? KINDS.discovery).label}</b> · ${escape(event.title)}</span>`);
  for (const pr of (state.github?.mergedPrs ?? []).slice(0, 8)) items.push(`<span><b>Merged</b> · #${pr.number} ${escape(pr.title)} (${escape(pr.author)})</span>`);
  for (const commit of (state.github?.commits ?? []).slice(0, 6)) items.push(`<span><b>Commit</b> · ${escape(commit.message)}</span>`);
  const text = items.join("");
  if (!text || text === tickerText) return;
  tickerText = text;
  const track = $("ticker");
  track.innerHTML = text + text;
  track.style.setProperty("--ticker-duration", `${Math.max(90, items.length * 9)}s`);
}

async function refresh() {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    const state = await response.json();
    renderSources(state.sources);
    renderKpis(state);
    renderChart(state.history, state.events);
    renderLibraries(state.libraries);
    renderPrs(state.github);
    renderEvents(state.events);
    renderGames(state.games);
    renderCi(state.github);
    renderPeople(state.github);
    renderTicker(state);
  } catch (error) {
    console.error("refresh", error);
  }
}

tickClocks();
setInterval(tickClocks, 1000);
refresh();
setInterval(refresh, REFRESH_MS);
setTimeout(() => location.reload(), RELOAD_MS);
