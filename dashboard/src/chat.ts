import { STAGES } from "./games.js";
import type { ChatAnswer, GameThread, LibSummary } from "./types.js";

const number = new Intl.NumberFormat("en-US");
// "Demon's Souls" and "demons souls" read the same: apostrophes go, everything else splits words.
const normalize = (text: string): string => text.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const words = (text: string): string[] => normalize(text).split(" ").filter((word) => word.length > 2);

// 3 for the exact name, 2 for its start, 1 anywhere inside it, 0 for no match.
function score(query: string, ...names: string[]): number {
  let best = 0;
  for (const name of names.map(normalize)) {
    if (name === query) return 3;
    if (name.startsWith(query)) best = Math.max(best, 2);
    else if (name.includes(query)) best = Math.max(best, 1);
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

function miss(id: string, kicker: string, what: string, query: string, names: string[]): ChatAnswer {
  const near = closest(query, names);
  return { id, kicker, title: `No ${what} matches “${query}”`, meta: near ? `Closest: ${near}` : `Try part of the ${what}'s name`, icon: "🔍" };
}

function gameAnswer(id: string, kicker: string, query: string, threads: GameThread[]): ChatAnswer {
  const wanted = normalize(query);
  const stage = (thread: GameThread) => (thread.stage ? STAGES.indexOf(thread.stage) : -1);
  // Several threads can cover one game (regions, editions): the furthest stage, then the most discussed, wins.
  const found = threads
    .map((thread) => ({ thread, score: score(wanted, thread.name, thread.titleId ?? "") }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || stage(b.thread) - stage(a.thread) || b.thread.replies - a.thread.replies)[0]?.thread;
  if (!found) return miss(id, kicker, "game", query, threads.map((thread) => thread.name));
  const meta = [found.titleId, `${number.format(found.replies)} ${found.replies === 1 ? "reply" : "replies"}`].filter(Boolean).join(" · ");
  return { id, kind: "game", kicker, title: found.name, meta, image: found.cover ?? undefined, icon: "🎮", pill: found.stage ?? "No stage yet" };
}

function libAnswer(id: string, kicker: string, query: string, libraries: LibSummary[]): ChatAnswer {
  const wanted = normalize(query);
  const found = libraries
    .map((library) => ({ library, score: score(wanted, library.name, library.label) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.library.total - a.library.total)[0]?.library;
  if (!found) return miss(id, kicker, "library", query, libraries.map((library) => library.label));
  const percent = found.total ? Math.floor((found.done / found.total) * 100) : 0;
  return { id, kicker, title: found.label, meta: `${number.format(found.done)} / ${number.format(found.total)} functions implemented`, icon: "📚", pill: `${percent}%` };
}

// Turns one chat message into an on-screen answer, or null when it is not a command.
export function answerCommand(id: string, text: string, author: string, threads: GameThread[], libraries: LibSummary[]): ChatAnswer | null {
  const match = /^!(game|lib|help)\b\s*(.*)$/i.exec(text.trim());
  if (!match) return null;
  const command = match[1]!.toLowerCase();
  const query = match[2]!.trim().slice(0, 40);
  const kicker = `!${command} · asked by ${author.slice(0, 30)}`;
  if (command === "help" || !normalize(query)) {
    return { id, kind: "cta", kicker, title: "!game <name>  ·  !lib <name>", meta: "Type one in chat: the answer shows up here", icon: "💬" };
  }
  return command === "game" ? gameAnswer(id, kicker, query, threads) : libAnswer(id, kicker, query, libraries);
}
