import type { GameThread } from "./types.js";

// The dropdown of AnyPS5's game bring-up form, in order. Older threads use free text, read by the same rules.
export const STAGES = ["Does not convert", "Stops before first frame", "Logos or loading", "Menu", "In game"];

const RULES: [RegExp, number][] = [
  [/\bin[- ]game\b|\bgameplay\b|\bplayable\b/, 4],
  [/\bmenus?\b/, 3],
  [/\blogos?\b|loading screen|boot screens?/, 2],
  [/before the first|^boots? \(?stops|^none\b/, 1],
  [/does not convert/, 0],
];

// Replies alone rank a niche game with an active tester above Elden Ring, so well-known series go first.
const WELL_KNOWN = /elden ring|red dead|persona|silent hill|metal gear|doom|hades|sonic|diablo|007|astro|ghost of|god of war|spider-man|grand theft auto|cyberpunk|resident evil|final fantasy|dragon quest|last of us|minecraft|call of duty|castlevania|ufc|ea sports|gran turismo|demon's souls|horizon|uncharted|ratchet|mortal kombat|street fighter|tekken|assassin's creed/i;

export function byPopularity(a: GameThread, b: GameThread): number {
  return Number(WELL_KNOWN.test(b.name)) - Number(WELL_KNOWN.test(a.name)) || b.replies - a.replies;
}

export const isRockstar = (thread: GameThread): boolean => /grand theft auto|\bgta\b|red dead/i.test(thread.name);

export interface DiscussionJson {
  number: number;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  comments: { totalCount: number };
}

// Reads the "Furthest point" of a thread's first report. Null when it is missing or says something else:
// a thread is left out of the stages rather than guessed into one.
export function stageOf(body: string): number | null {
  const answer = /^#{2,3} Furthest point\s*\n+(.+)$/m.exec(body)?.[1]?.replace(/[*`]/g, "").trim().toLowerCase();
  if (!answer || answer.startsWith("- [")) return null;
  let best: { index: number; stage: number } | null = null;
  for (const [rule, stage] of RULES) {
    const index = answer.search(rule);
    if (index >= 0 && (!best || index < best.index)) best = { index, stage };
  }
  return best?.stage ?? null;
}

export function toThread(discussion: DiscussionJson, covers: Map<string, string>): GameThread {
  const titleId = /[A-Z]{4}\d{5}/.exec(discussion.title)?.[0] ?? null;
  const name = titleId ? discussion.title.slice(0, discussion.title.indexOf(titleId)).replace(/[\s(—–:-]+$/, "") : discussion.title;
  const stage = stageOf(discussion.body);
  return {
    number: discussion.number,
    name: name || discussion.title,
    titleId,
    stage: stage === null ? null : STAGES[stage]!,
    replies: discussion.comments.totalCount,
    createdAt: discussion.createdAt,
    updatedAt: discussion.updatedAt,
    cover: titleId ? covers.get(titleId) ?? null : null,
  };
}
