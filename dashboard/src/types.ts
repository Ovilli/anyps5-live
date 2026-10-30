export interface LibSummary {
  name: string;
  done: number;
  total: number;
}

export interface HistoryPoint {
  date: string;
  commit: string;
  done: number;
  total: number;
  percent: number;
  shadersDone: number;
  shadersTotal: number;
}

export type EventKind = "discovery" | "jump" | "percent" | "library" | "complete" | "milestone" | "game" | "release";

export interface LiveEvent {
  time: string;
  kind: EventKind;
  title: string;
  detail?: string;
}

export interface MergedPr {
  number: number;
  title: string;
  author: string;
  avatar: string;
  mergedAt: string;
  added: number | null;
}

export interface Commit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export interface CiRun {
  workflow: string;
  status: string;
  conclusion: string | null;
  updatedAt: string;
}

export interface Contributor {
  login: string;
  avatar: string;
  merged: number;
}

export interface Snapshot {
  date: string;
  libraries: Record<string, [number, number]>;
}

export interface SourceStatus {
  ok: boolean;
  at: string | null;
  error?: string;
}

export interface State {
  updatedAt: string;
  sources: Record<string, SourceStatus>;
  progress: {
    done: number;
    total: number;
    percent: number;
    shadersDone: number;
    shadersTotal: number;
    shadersPercent: number;
    day: { done: number; total: number; percent: number } | null;
    week: { done: number; total: number; percent: number } | null;
  } | null;
  history: HistoryPoint[];
  libraries: {
    count: number;
    complete: number;
    started: number;
    untouched: number;
    biggest: LibSummary[];
    movers: { name: string; gained: number; done: number; total: number }[];
    moversSince: string | null;
  } | null;
  github: {
    stars: number;
    forks: number;
    watchers: number;
    openPrs: number | null;
    openIssues: number | null;
    merged24h: number | null;
    merged7d: number | null;
    mergedPrs: MergedPr[];
    commits: Commit[];
    ci: CiRun[];
    contributors: Contributor[];
    contributorsWindow: number;
    release: { tag: string; publishedAt: string | null } | null;
    rateRemaining: number | null;
    authenticated: boolean;
  } | null;
  games: {
    generatedAt: string;
    tracked: number;
    playable: number;
    menus: number;
    blockers: number;
    stages: { name: string; count: number }[];
    changes: { time: string; text: string }[];
  } | null;
  events: LiveEvent[];
}
