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
