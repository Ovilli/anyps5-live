export interface LibSummary {
  name: string;
  label: string;
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

export type EventKind = "discovery" | "jump" | "percent" | "library" | "complete" | "milestone" | "release";

export interface LiveEvent {
  time: string;
  kind: EventKind;
  title: string;
  detail?: string;
}

export interface PrReport {
  implemented: number;
  declared: number;
}

export interface MergedPr {
  number: number;
  title: string;
  author: string;
  avatar: string;
  mergedAt: string;
  report: PrReport | null;
}

export interface OpenedPr {
  number: number;
  title: string;
  author: string;
  avatar: string;
  createdAt: string;
  report: PrReport | null;
}

export interface GameThread {
  number: number;
  name: string;
  titleId: string | null;
  stage: string | null;
  replies: number;
  createdAt: string;
  updatedAt: string;
  cover: string | null;
}

// Shaped like a client-side alert card, so the page shows it as is.
export interface ChatAnswer {
  id: string;
  kind?: string;
  kicker: string;
  title: string;
  meta?: string;
  image?: string;
  icon?: string;
  pill?: string;
  progress?: number;
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
    all: LibSummary[];
    movers: { name: string; gained: number; done: number; total: number }[];
    moversSince: string | null;
  } | null;
  github: {
    stars: number;
    openPrs: number | null;
    merged24h: number | null;
    merged7d: number | null;
    mergedPrs: MergedPr[];
    openedPrs: OpenedPr[];
    topAuthors: { author: string; avatar: string; merged: number }[];
    release: { tag: string; publishedAt: string | null } | null;
    rateRemaining: number | null;
    authenticated: boolean;
  } | null;
  games: {
    tracked: number;
    inGame: number;
    menu: number;
    active24h: number;
    stages: { name: string; count: number }[];
    recent: GameThread[];
    highlights: GameThread[];
    rockstar: GameThread[];
  } | null;
  events: LiveEvent[];
  youtube: {
    likes: number | null;
    viewers: number | null;
    shorts: boolean;
  };
  chat: { enabled: boolean; answers: ChatAnswer[] };
}
