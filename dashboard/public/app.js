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
    countTo($("hero-done"), progress.done);
    $("hero-count").textContent = `${pct(progress.percent)} of ${fmt(progress.total)} found so far`;
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
    $("kpi-ingame").textContent = fmt(state.games.inGame);
    $("kpi-games-note").textContent = `of ${fmt(state.games.tracked)} reported`;
  }
}

// Rolls a number up to its new value, so a change on screen is seen and not just swapped in.
function countTo(node, target) {
  const from = Number(node.dataset.value);
  node.dataset.value = target;
  if (!Number.isFinite(from) || from === target || !node.dataset.counted) {
    node.dataset.counted = "1";
    node.textContent = fmt(target);
    return;
  }
  const started = performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - started) / 2000);
    node.textContent = fmt(Math.round(from + (target - from) * progress));
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
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
  renderPrList($("prs"), github.mergedPrs, (pr) => pr.mergedAt);
  renderPrList($("opened"), github.openedPrs ?? [], (pr) => pr.createdAt);
}

function renderPrList(list, prs, timeOf) {
  const known = new Set([...list.querySelectorAll(".pr")].map((node) => node.dataset.number));
  const html = prs
    .slice(0, 3)
    .map((pr) => {
      const fresh = known.size && !known.has(String(pr.number)) ? " fresh" : "";
      const implemented = pr.report?.implemented ?? 0, declared = pr.report?.declared ?? 0;
      const pill = implemented > 0
        ? `<span class="pill">+${fmt(implemented)} function${implemented > 1 ? "s" : ""}</span>`
        : declared > 0 ? `<span class="pill declared">+${fmt(declared)} declared</span>` : "";
      return `<li class="pr${fresh}" data-number="${pr.number}"><img class="avatar" src="${avatar(pr.avatar, 88)}" alt=""><div class="pr-text"><div class="pr-title">${escape(pr.title)}</div><div class="pr-meta">#${pr.number} · ${escape(pr.author)} · ${ago(timeOf(pr))}</div></div>${pill}</li>`;
    })
    .join("");
  // Rewriting an unchanged list makes its avatars flicker on air.
  if (list.dataset.html !== html) {
    list.dataset.html = html;
    list.innerHTML = html;
  }
}

// "Exports discovered" lines say the total grew, which is noise next to what got done: they only fill up a quiet list.
const eventTitle = (title) => title.replace(/^(lib[\w.]+): /, (_, name) => `${libraryLabel(name)}: `);

function renderEvents(events) {
  const done = events.filter((event) => event.kind !== "discovery");
  const found = events.filter((event) => event.kind === "discovery" && !event.title.includes("exports discovered"));
  const list = [...done, ...found].slice(0, 5);
  $("events").innerHTML = list.length
    ? list
        .map((event) => `<li class="event"><span class="event-dot" style="background:${KIND_COLORS[event.kind] ?? "var(--series-1)"}"></span><span class="event-title">${escape(eventTitle(event.title))}</span><span class="event-date">${shortDate(event.time)}</span></li>`)
        .join("")
    : `<li class="empty">Nothing yet.</li>`;
}

function renderGames(games) {
  if (!games) return;
  $("games-meta").textContent = `${fmt(games.active24h)} active today`;
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

const MILESTONE_STEP = 1000;
let latest = null;

function dailyPace(progress) {
  if (progress?.week?.done > 0) return progress.week.done / 7;
  return progress?.day?.done > 0 ? progress.day.done : null;
}

function etaText(left, pace) {
  if (!pace) return "";
  const hours = (left / pace) * 24;
  if (hours < 1) return "under an hour away";
  if (hours < 48) return `about ${Math.round(hours)} h away`;
  return `about ${Math.round(hours / 24)} days away`;
}

function nextMilestone(progress) {
  const target = (Math.floor(progress.done / MILESTONE_STEP) + 1) * MILESTONE_STEP;
  return { target, left: target - progress.done, from: target - MILESTONE_STEP };
}

function renderGoal(progress) {
  if (!progress) return;
  const { target, left } = nextMilestone(progress);
  const eta = etaText(left, dailyPace(progress));
  $("goal").innerHTML = `Goal: <strong>${fmt(target)}</strong> functions · <strong>${fmt(left)}</strong> to go${eta ? ` · ${eta}` : ""}`;
}

// Scenes
let spotlightIndex = Math.floor(Date.now() / 60_000) % 1000; // A page reload does not start over with the same game.
const STAGE_ORDER = ["Does not convert", "Stops before first frame", "Logos or loading", "Menu", "In game"];

function coverHtml(game) {
  const name = `<div class="cover-name">${escape(game.name)}</div>`;
  if (!game.cover) return `<div class="cover">${name}</div>`;
  return `<div class="cover">${name}<img src="${escape(game.cover)}" alt="" onerror="this.remove()"></div>`;
}

// Games reaching gameplay, best known first. Every other turn goes to the top few, so the games
// viewers are likely to know come back far more often than the rest.
const SPOTLIGHT_TOP = 6;

function pickSpotlight(pool, turn) {
  const top = pool.slice(0, SPOTLIGHT_TOP), rest = pool.slice(SPOTLIGHT_TOP);
  if (!rest.length || turn % 2 === 0) return top[Math.floor(turn / 2) % top.length];
  return rest[Math.floor(turn / 2) % rest.length];
}

function renderSpotlight() {
  const pool = latest?.games?.highlights ?? [];
  if (!pool.length) return false;
  const game = pickSpotlight(pool, spotlightIndex);
  spotlightIndex += 1;
  const reached = STAGE_ORDER.indexOf(game.stage);
  const steps = STAGE_ORDER.map((stage, index) => `<div class="track-step ${index === reached ? "current" : index < reached ? "passed" : ""}">${escape(stage)}</div>`).join("");
  const others = pool.filter((other) => other !== game).slice(0, 4)
    .map((other) => `<div class="other"><div class="other-name">${escape(other.name)}</div><div class="other-stage">${escape(other.stage)} · ${ago(other.updatedAt)}</div></div>`).join("");
  const replies = game.replies ? ` · ${fmt(game.replies)} ${game.replies > 1 ? "replies" : "reply"}` : "";
  $("scene-games").innerHTML = `<div class="scene-body">
    <div class="spotlight-main">${coverHtml(game)}
      <div class="spotlight-text">
        <div><div class="scene-tag">Game spotlight</div><h2 class="scene-title">${escape(game.name)}</h2></div>
        <div class="track">${steps}</div>
        <div class="spotlight-meta">Report updated ${ago(game.updatedAt)}${replies}</div>
      </div>
    </div>
    <div class="spotlight-others">${others}</div>
  </div>`;
  return true;
}

function renderContributors() {
  const github = latest?.github;
  if (!github?.topAuthors?.length) return false;
  $("scene-contributors").innerHTML = `<div class="scene-body">
    <div><div class="scene-tag">Who is building it</div><h2 class="scene-title">Most merged PRs today</h2></div>
    <div class="authors">${github.topAuthors.map((author) => `<div class="author"><img src="${escape(avatar(author.avatar, 220))}" alt=""><div class="author-text"><div class="author-name">${escape(author.author)}</div><div class="author-count">${fmt(author.merged)} PR${author.merged > 1 ? "s" : ""}</div></div></div>`).join("")}</div>
    <div class="scene-note">${fmt(github.merged24h)} PRs merged in the last 24 hours</div>
  </div>`;
  return true;
}

function renderMovers() {
  const libraries = latest?.libraries;
  const movers = libraries?.movers?.slice(0, 6) ?? [];
  if (!movers.length) return false;
  $("scene-movers").innerHTML = `<div class="scene-body">
    <div><div class="scene-tag">Moving fast</div><h2 class="scene-title">Biggest gains since ${libraries.moversSince ? shortDate(libraries.moversSince) : "yesterday"}</h2></div>
    <div class="movers">${movers.map((mover) => `<div class="mover"><div><div class="mover-name">${escape(libraryLabel(mover.name))}</div><div class="mover-lib">${escape(mover.name)} · ${fmt(mover.done)} / ${fmt(mover.total)}</div></div><div class="mover-bar"><span style="width:${mover.total ? ((mover.done / mover.total) * 100).toFixed(1) : 0}%"></span></div><div class="mover-gain">${signed(mover.gained)}</div></div>`).join("")}</div>
  </div>`;
  return true;
}

function renderMilestoneScene() {
  const progress = latest?.progress;
  if (!progress) return false;
  const { target, left, from } = nextMilestone(progress);
  const pace = dailyPace(progress);
  const eta = etaText(left, pace);
  const points = latest.history ?? [];
  const gains = points.slice(1).map((point, index) => ({ date: point.date, gain: point.done - points[index].done })).slice(-10);
  const top = Math.max(1, ...gains.map((entry) => entry.gain));
  $("scene-milestone").innerHTML = `<div class="scene-body">
    <div class="scene-tag">Next milestone</div>
    <div class="goal-row">
      <div class="goal-left">
        <div class="goal-number">${fmt(target)}</div>
        <div class="goal-left-text"><span>${fmt(left)}</span> functions to go${eta ? ` · ${eta}` : ""}</div>
        <div class="goal-meter"><span style="width:${(((progress.done - from) / MILESTONE_STEP) * 100).toFixed(1)}%"></span></div>
        <div class="scene-note">${pace ? `Pace: about ${fmt(Math.round(pace))} functions a day over 7 days. ` : ""}${fmt(progress.total)} found so far, and the total still grows as new ones are found.</div>
      </div>
      <div>
        <div class="gains-title">Functions added per update</div>
        <div class="gains">${gains.map((entry) => `<div class="gain"><span class="gain-value">${fmt(entry.gain)}</span><div class="gain-bar" style="height:${Math.max(1, (Math.max(0, entry.gain) / top) * 78).toFixed(1)}%"></div><span class="gain-date">${shortDate(`${entry.date}T12:00:00Z`).replace(/^\w+ /, "")}</span></div>`).join("")}</div>
      </div>
    </div>
  </div>`;
  return true;
}

const DASHBOARD_SECONDS = 45, SCENE_SECONDS = 25;
const SCENES = {
  dashboard: { node: "scene-dashboard", title: "Live dashboard", render: () => true, seconds: DASHBOARD_SECONDS },
  games: { node: "scene-games", title: "Game spotlight", render: renderSpotlight, seconds: SCENE_SECONDS },
  contributors: { node: "scene-contributors", title: "Top contributors", render: renderContributors, seconds: SCENE_SECONDS },
  movers: { node: "scene-movers", title: "Biggest gains", render: renderMovers, seconds: SCENE_SECONDS },
  milestone: { node: "scene-milestone", title: "Next milestone", render: renderMilestoneScene, seconds: SCENE_SECONDS },
};
const ROTATION = ["dashboard", "games", "dashboard", "milestone", "dashboard", "games", "dashboard", "contributors", "dashboard", "games", "dashboard", "movers"];
const params = new URLSearchParams(location.search);
const pinnedScene = SCENES[params.get("scene")] ? params.get("scene") : null;
const TRANSITION_MS = 500, PREPARE_SECONDS = 3;
let rotationIndex = 0;
let sceneEnds = 0;
let shownScene = "dashboard";
let prepared = null;

function showScene(name) {
  const previous = $(SCENES[shownScene].node), node = $(SCENES[name].node);
  node.classList.add("entering");
  shownScene = name;
  sceneEnds = Date.now() + SCENES[name].seconds * 1000;
  setTimeout(() => {
    previous.classList.remove("active");
    node.classList.add("active");
    node.classList.remove("entering");
  }, TRANSITION_MS);
}

function nextSceneName() {
  for (let offset = 1; offset <= ROTATION.length; offset += 1) {
    const index = (rotationIndex + offset) % ROTATION.length;
    if (ROTATION[index] !== shownScene) return { name: ROTATION[index], index };
  }
  return { name: "dashboard", index: 0 };
}

// The scene is filled and its picture decoded seconds ahead, so the slide itself has nothing else to do.
// A scene whose data is not there yet is skipped.
function prepareNext() {
  for (let tries = 0; tries < ROTATION.length; tries += 1) {
    const next = nextSceneName();
    if (SCENES[next.name].render()) {
      $(SCENES[next.name].node).querySelector("img")?.decode().catch(() => {});
      return next;
    }
    rotationIndex = next.index;
  }
  return null;
}

function tickScenes() {
  if (pinnedScene) {
    if (shownScene !== pinnedScene && latest && SCENES[pinnedScene].render()) showScene(pinnedScene);
    return;
  }
  if (!sceneEnds) sceneEnds = Date.now() + DASHBOARD_SECONDS * 1000;
  let left = Math.ceil((sceneEnds - Date.now()) / 1000);
  if (left <= PREPARE_SECONDS && !prepared && latest) prepared = prepareNext();
  if (left <= 0) {
    if (prepared) {
      rotationIndex = prepared.index;
      showScene(prepared.name);
      prepared = null;
    } else {
      sceneEnds = Date.now() + SCENES[shownScene].seconds * 1000;
    }
    left = SCENES[shownScene].seconds;
  }
  const next = SCENES[prepared?.name ?? nextSceneName().name];
  $("next-up").innerHTML = `Next: <strong>${next.title}</strong> in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

// Alerts: new merged PRs, new game reports and finished libraries slide in one at a time.
const ALERT_MS = 9000, ALERT_GAP_MS = 1500, ALERT_QUEUE = 6;
const alertQueue = [];
const seen = { prs: null, games: null, events: null, chat: null, done: null, likes: null };
let alertBusy = false;

function pushAlert(alert) {
  alertQueue.push(alert);
  while (alertQueue.length > ALERT_QUEUE) alertQueue.shift();
  playAlerts();
}

function playAlerts() {
  if (alertBusy || !alertQueue.length || $("takeover").classList.contains("show")) return;
  alertBusy = true;
  const alert = alertQueue.shift();
  const image = alert.image ? `<img src="${escape(alert.image)}" alt="">` : `<div class="alert-icon">${alert.icon ?? "★"}</div>`;
  $("alerts").innerHTML = `<div class="alert ${alert.kind ?? ""}">${image}<div class="alert-text"><div class="alert-kicker">${escape(alert.kicker)}</div><div class="alert-title">${escape(alert.title)}</div>${alert.meta ? `<div class="alert-meta">${escape(alert.meta)}</div>` : ""}</div>${alert.pill ? `<span class="pill">${escape(alert.pill)}</span>` : "<span></span>"}</div>`;
  setTimeout(() => {
    $("alerts").innerHTML = "";
    setTimeout(() => {
      alertBusy = false;
      playAlerts();
    }, ALERT_GAP_MS);
  }, ALERT_MS);
}

function celebrate(kicker, value, note) {
  const colors = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];
  const confetti = Array.from({ length: 36 }, (_, index) => `<span class="confetti" style="left:${(index * 53) % 100}%;background:${colors[index % colors.length]};animation-duration:${3 + (index % 5) * 0.6}s;animation-delay:-${(index * 0.37).toFixed(2)}s"></span>`).join("");
  $("takeover").innerHTML = `${confetti}<div class="takeover-text"><div class="takeover-kicker">${escape(kicker)}</div><div class="takeover-value">${escape(value)}</div><div class="takeover-note">${escape(note)}</div></div>`;
  $("takeover").classList.add("show");
  setTimeout(() => {
    $("takeover").classList.remove("show");
    $("takeover").innerHTML = "";
    playAlerts();
  }, 14_000);
}

function prAlert(pr) {
  const implemented = pr.report?.implemented ?? 0;
  return { kicker: "PR merged", title: pr.title, meta: `#${pr.number} · ${pr.author}`, image: avatar(pr.avatar, 152), pill: implemented > 0 ? `+${fmt(implemented)} function${implemented > 1 ? "s" : ""}` : null };
}

function gameAlert(game) {
  return { kind: "game", kicker: "New game report", title: game.name, meta: game.stage ? `Furthest point: ${game.stage}` : "First test reported", icon: "🎮" };
}

// The first read of each list only records what is there: an alert means it happened while on air.
function detectChanges(state) {
  const fresh = (key, items, id) => {
    const known = seen[key];
    seen[key] = new Set([...(known ?? []), ...items.map(id)]);
    return known ? items.filter((item) => !known.has(id(item))) : [];
  };
  // First, so that alerts arriving with a milestone wait for it instead of playing behind it.
  if (state.progress) {
    const before = seen.done;
    seen.done = state.progress.done;
    if (before !== null && Math.floor(state.progress.done / MILESTONE_STEP) > Math.floor(before / MILESTONE_STEP)) {
      celebrate("Milestone reached", fmt(Math.floor(state.progress.done / MILESTONE_STEP) * MILESTONE_STEP), "PS5 system functions implemented");
      const reached = Math.floor(state.progress.done / MILESTONE_STEP) * MILESTONE_STEP;
      pushAlert(likeCta(`Like if you want to see ${fmt(reached + MILESTONE_STEP)}`));
    }
  }
  if (state.github) fresh("prs", state.github.mergedPrs, (pr) => pr.number).reverse().forEach((pr) => pushAlert(prAlert(pr)));
  if (state.games) fresh("games", state.games.recent, (game) => game.number).filter((game) => Date.now() - Date.parse(game.createdAt) < 3_600_000).reverse().forEach((game) => pushAlert(gameAlert(game)));
  const notable = state.events.filter((event) => event.kind === "complete" || event.kind === "release");
  fresh("events", notable, (event) => `${event.kind}|${event.title}`).reverse().forEach((event) => pushAlert({ kicker: event.kind === "release" ? "New release" : "Library finished", title: eventTitle(event.title), meta: event.detail ?? "", icon: event.kind === "release" ? "🚀" : "✅" }));
  // Chat commands arrive as ready-made cards, oldest first.
  if (state.chat) fresh("chat", state.chat.answers, (answer) => answer.id).forEach(pushAlert);
}

// Calls to action: tied to good news when there is some, and a light reminder otherwise.
const CTA_EVERY_MS = 4 * 60_000;
let ctaTurn = 0;

function likeGoal(likes) {
  const step = likes < 100 ? 25 : likes < 500 ? 50 : likes < 2000 ? 100 : 500;
  return (Math.floor(likes / step) + 1) * step;
}

function likeCta(title) {
  const likes = latest?.youtube?.likes;
  const meta = typeof likes === "number" ? `${fmt(likes)} / ${fmt(likeGoal(likes))} likes` : "It helps more people find AnyPS5";
  return { kind: "cta", kicker: "Enjoying the live?", title, meta, icon: "👍" };
}

function subscribeCta() {
  const shorts = latest?.youtube?.shorts;
  return { kind: "cta", kicker: "Stay in the loop", title: shorts ? "Subscribe for a daily AnyPS5 Short" : "Subscribe to follow AnyPS5's progress", meta: shorts ? "The day's progress, in 30 seconds" : "", icon: "🔔" };
}

function remindCta() {
  if (document.hidden) return;
  pushAlert(ctaTurn % 2 === 0 ? likeCta("Hit like to support the stream") : subscribeCta());
  ctaTurn += 1;
}

function renderLikes(youtube) {
  const likes = youtube?.likes;
  const node = $("likes");
  node.hidden = typeof likes !== "number";
  if (node.hidden) return;
  const goal = likeGoal(likes);
  const before = seen.likes;
  seen.likes = likes;
  if (typeof before === "number" && likeGoal(before) <= likes) {
    pushAlert({ kind: "cta", kicker: "Like goal reached", title: `${fmt(likeGoal(before))} likes, thank you!`, meta: `Next goal: ${fmt(goal)} likes`, icon: "🎉" });
  }
  const start = goal - (likes < 100 ? 25 : likes < 500 ? 50 : likes < 2000 ? 100 : 500);
  node.innerHTML = `👍 ${fmt(likes)} / ${fmt(goal)}<span class="likes-bar"><span style="width:${(((likes - start) / (goal - start)) * 100).toFixed(1)}%"></span></span>`;
}

function runDemo(kind) {
  if (kind === "cta") {
    pushAlert(likeCta("Hit like to support the stream"));
    pushAlert(subscribeCta());
  }
  const github = latest?.github;
  if (kind === "alert" && github?.mergedPrs?.[0]) {
    pushAlert(prAlert({ ...github.mergedPrs[0], report: { implemented: 12, declared: 0 } }));
    if (latest.games?.recent?.[0]) pushAlert(gameAlert(latest.games.recent[0]));
  }
  if (kind === "chat") {
    const game = latest?.games?.highlights?.[0] ?? latest?.games?.recent?.[0];
    if (game) pushAlert({ kind: "game", kicker: "!game · asked by Viewer", title: game.name, meta: game.titleId ?? "", image: game.cover, icon: "🎮", pill: game.stage ?? "No stage yet" });
    const library = latest?.libraries?.all?.[0];
    if (library) pushAlert({ kicker: "!lib · asked by Viewer", title: library.label, meta: `${fmt(library.done)} / ${fmt(library.total)} functions implemented`, icon: "📚", pill: `${Math.floor((library.done / library.total) * 100)}%` });
    pushAlert({ kind: "cta", kicker: "!help · asked by Viewer", title: "!game <name>  ·  !lib <name>", meta: "Type one in chat: the answer shows up here", icon: "💬" });
  }
  if (kind === "milestone") celebrate("Milestone reached", "9,000", "PS5 system functions implemented");
}

async function refresh() {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    const state = await response.json();
    const first = !latest;
    latest = state;
    renderKpis(state);
    renderGoal(state.progress);
    renderChart(state.history);
    renderPrs(state.github);
    renderEvents(state.events);
    renderGames(state.games);
    renderMap(state.libraries);
    renderLikes(state.youtube);
    detectChanges(state);
    if (first && params.get("demo")) runDemo(params.get("demo"));
  } catch (error) {
    console.error("refresh", error);
  }
}

tickClock();
setInterval(tickClock, 5000);
tickScenes();
setInterval(tickScenes, 1000);
refresh();
setInterval(refresh, REFRESH_MS);
setInterval(remindCta, CTA_EVERY_MS);
setTimeout(() => location.reload(), RELOAD_MS);
