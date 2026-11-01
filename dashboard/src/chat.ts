import { STAGES } from "./games.js";
import type { ChatAnswer, GameThread, LibSummary, State } from "./types.js";

export const DISCORD_INVITE = "discord.gg/BHFztBPUe";
// Posted in the chat as the channel. YouTube allows 200 characters.
export const CHAT_REMINDER = `💬 Ask the stream: !game <name>, !lib <name>, !next, !top, !random. The answer shows up on screen. Discord: https://${DISCORD_INVITE}`;
// The official console date. gta6.js counts down to the same one.
const GTA_VI_RELEASE = Date.parse("2026-11-19T00:00:00Z");
const MILESTONE_STEP = 1000;

export interface ChatContext {
  progress?: State["progress"];
  topAuthors?: NonNullable<State["github"]>["topAuthors"];
}

// What people type for the games they know by their short names.
const ALIASES: [RegExp, string][] = [
  [/^gta\b ?/, "grand theft auto "],
  [/^rdr\b ?/, "red dead redemption "],
  [/^mgs\b ?/, "metal gear solid "],
  [/^gow\b ?/, "god of war "],
  [/^ff\b ?/, "final fantasy "],
  [/^re\b ?/, "resident evil "],
  [/^cod\b ?/, "call of duty "],
  [/^tlou\b ?/, "the last of us "],
];

const number = new Intl.NumberFormat("en-US");
// "Demon's Souls" and "demons souls" read the same: apostrophes go, everything else splits words.
const normalize = (text: string): string => text.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const words = (text: string): string[] => normalize(text).split(" ").filter((word) => word.length > 2);

const expand = (query: string): string => ALIASES.reduce((text, [alias, name]) => text.replace(alias, name), query).trim();

// 4 for the exact name, 3 for its start, 2 anywhere inside it, 1 for all its words in any order, 0 for no match.
function score(query: string, ...names: string[]): number {
  const wanted = query.split(" ");
  let best = 0;
  for (const name of names.map(normalize)) {
    if (name === query) return 4;
    if (name.startsWith(query)) best = Math.max(best, 3);
    else if (name.includes(query)) best = Math.max(best, 2);
    else if (wanted.every((word) => name.split(" ").includes(word))) best = Math.max(best, 1);
  }
  return best;
}

// The name sharing the most words with the query, for a "did you mean" when nothing matches.
function closest(query: string, names: string[]): string | null {
  const wanted = new Set(words(query));
  let best: { name: string; shared: number } | null = null;
  for (const name of names) {
    const shared = words(name).filter((word) => wanted.has(word)).length;
    if (shared && (!best || shared > best.shared)) best = { name, shared };
  }
  return best?.name ?? null;
}

// The query is never shown: anything a viewer types would otherwise go on air as is.
function miss(id: string, kicker: string, what: string, query: string, names: string[]): ChatAnswer {
  const near = closest(query, names);
  return { id, kind: "answer", kicker, title: `No ${what} found with that name`, meta: near ? `Closest: ${near}` : `Try part of the ${what}'s name`, icon: "🔍" };
}

function gameCard(id: string, kicker: string, thread: GameThread): ChatAnswer {
  const meta = [thread.titleId, `${number.format(thread.replies)} ${thread.replies === 1 ? "reply" : "replies"}`].filter(Boolean).join(" · ");
  const stage = thread.stage ? STAGES.indexOf(thread.stage) : -1;
  return { id, kind: "answer game", kicker, title: thread.name, meta, image: thread.cover ?? undefined, icon: "🎮", pill: thread.stage ?? "Being tested", progress: stage >= 0 ? ((stage + 1) / STAGES.length) * 100 : 0 };
}

function gtaVi(id: string, kicker: string): ChatAnswer {
  const days = Math.ceil((GTA_VI_RELEASE - Date.now()) / 86_400_000);
  const meta = days > 0 ? `Out in ${number.format(days)} day${days === 1 ? "" : "s"} on consoles, so there's nothing to test yet` : "Out on consoles, no AnyPS5 test report yet";
  return { id, kind: "answer game", kicker, title: "GTA VI", meta, icon: "🌴", pill: "0%", progress: 0 };
}

function gameAnswer(id: string, kicker: string, query: string, threads: GameThread[]): ChatAnswer {
  const wanted = expand(normalize(query));
  const stage = (thread: GameThread) => (thread.stage ? STAGES.indexOf(thread.stage) : -1);
  // Several threads can cover one game (regions, editions): the furthest stage, then the most discussed, wins.
  const found = threads
    .map((thread) => ({ thread, score: score(wanted, thread.name, thread.titleId ?? "") }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || stage(b.thread) - stage(a.thread) || b.thread.replies - a.thread.replies)[0]?.thread;
  if (/^grand theft auto (6|vi)\b/.test(wanted) && !found) return gtaVi(id, kicker);
  return found ? gameCard(id, kicker, found) : miss(id, kicker, "game", query, threads.map((thread) => thread.name));
}

function libAnswer(id: string, kicker: string, query: string, libraries: LibSummary[]): ChatAnswer {
  const wanted = normalize(query);
  const found = libraries
    .map((library) => ({ library, score: score(wanted, library.name, library.label) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.library.total - a.library.total)[0]?.library;
  if (!found) return miss(id, kicker, "library", query, libraries.map((library) => library.label));
  const percent = found.total ? Math.floor((found.done / found.total) * 100) : 0;
  return { id, kind: "answer", kicker, title: found.label, meta: `${number.format(found.done)} / ${number.format(found.total)} functions implemented`, icon: "📚", pill: `${percent}%`, progress: percent };
}

function nextAnswer(id: string, kicker: string, progress: ChatContext["progress"]): ChatAnswer {
  if (!progress) return { id, kind: "answer", kicker, title: "Progress is still loading", meta: "Try again in a minute", icon: "⏳" };
  const target = (Math.floor(progress.done / MILESTONE_STEP) + 1) * MILESTONE_STEP;
  const left = target - progress.done;
  const days = progress.week && progress.week.done > 0 ? Math.max(1, Math.round(left / (progress.week.done / 7))) : null;
  return { id, kind: "answer", kicker, title: `Next goal: ${number.format(target)} functions`, meta: `${number.format(left)} to go${days ? ` · about ${days} day${days === 1 ? "" : "s"}` : ""}`, icon: "🎯", progress: ((progress.done % MILESTONE_STEP) / MILESTONE_STEP) * 100 };
}

function topAnswer(id: string, kicker: string, authors: NonNullable<ChatContext["topAuthors"]>): ChatAnswer {
  const [first, ...rest] = authors;
  if (!first) return { id, kind: "answer", kicker, title: "No merged PRs counted yet", meta: "Try again in a few minutes", icon: "⏳" };
  const meta = rest.slice(0, 2).map((author) => `${author.author} (${number.format(author.merged)})`).join(", ");
  return { id, kind: "answer", kicker, title: `${first.author} leads today`, meta: meta ? `Then ${meta}` : "Most merged PRs in 24 hours", icon: "🏆", pill: `${number.format(first.merged)} PR${first.merged === 1 ? "" : "s"}` };
}

function help(id: string, kicker: string): ChatAnswer {
  return { id, kind: "cta", kicker, title: "!game  !lib  !next  !top  !random  !discord", meta: "Try !game elden ring: the answer shows up here", icon: "💬" };
}

// Turns one chat message into an on-screen answer, or null when it is not a command.
export function answerCommand(id: string, text: string, author: string, threads: GameThread[], libraries: LibSummary[], context: ChatContext = {}): ChatAnswer | null {
  const match = /^!(game|lib|help|discord|next|top|random)\b\s*(.*)$/i.exec(text.trim());
  if (!match) return null;
  const command = match[1]!.toLowerCase();
  const query = match[2]!.trim().slice(0, 40);
  const kicker = `!${command} · asked by ${author.slice(0, 30)}`;
  if (command === "discord") return { id, kind: "discord", kicker, title: "Join the AnyPS5 Discord", meta: `${DISCORD_INVITE} · scan the code`, image: "discord-qr.svg" };
  if (command === "next") return nextAnswer(id, kicker, context.progress);
  if (command === "top") return topAnswer(id, kicker, context.topAuthors ?? []);
  if (command === "random") {
    const pool = threads.filter((thread) => thread.stage === "In game");
    const game = pool[Math.floor(Math.random() * pool.length)];
    return game ? gameCard(id, kicker, game) : help(id, kicker);
  }
  if (command === "help" || !normalize(query)) return help(id, kicker);
  return command === "game" ? gameAnswer(id, kicker, query, threads) : libAnswer(id, kicker, query, libraries);
}

// The API's daily quota resets at midnight in California.
export const quotaDay = (now: number): string => new Date(now).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

// How long to wait before opening the chat stream again. YouTube closes a quiet stream after about 10 seconds and
// each opening costs 5 units, so staying connected all day would cost about 42,000 of the 10,000 daily units. The
// stream is reopened at once only for a few minutes after a command, while the day's budget lasts.
export function nextChatDelay(now: number, burstUntil: number, unitsLeft: number, idleSeconds: number): number {
  if (unitsLeft <= 0) return 300_000;
  return now < burstUntil ? 250 : idleSeconds * 1000;
}
