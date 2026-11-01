import { answerCommand } from "./chat.js";
import { historyEvents, snapshotEvents } from "./events.js";
import { STAGES, toThread, type DiscussionJson } from "./games.js";
import { GitHub, getJson } from "./http.js";
import type { Store } from "./store.js";
import type { ChatAnswer, GameThread, HistoryPoint, LiveEvent, MergedPr, OpenedPr, PrReport, Snapshot, State } from "./types.js";

const REPO = process.env.ANYPS5_REPO ?? "boykopovar/AnyPS5";
const PAGES = (process.env.ANYPS5_PAGES ?? "https://boykopovar.github.io/AnyPS5").replace(/\/$/, "");
const ROADMAP = (process.env.ROADMAP_URL ?? "https://alxcbtw.github.io/anyps5-roadmap").replace(/\/$/, "");
const MINUTE = 60_000;
// Chat commands, off unless CHAT_COMMANDS=1. Each read costs 5 of the API key's 10,000 daily units, on top of
// the like counter's 1 unit a minute: one read a minute uses 8,640 units a day in all.
const CHAT_COMMANDS = process.env.CHAT_COMMANDS === "1";
const CHAT_POLL_SECONDS = Math.max(30, Number(process.env.CHAT_POLL_SECONDS) || 60);
const CHAT_COOLDOWN_MS = 60_000;
const CHAT_ANSWERS_PER_READ = 3;

interface ChatJson {
  nextPageToken?: string;
  items: { id: string; snippet: { type: string; displayMessage?: string }; authorDetails: { channelId: string; displayName: string } }[];
}

interface ProgressJson {
  libraries: { done: number; total: number; percent: number; groups: { name: string; label?: string; done: number; todo: number }[] };
  shaders: { done: number; total: number; percent: number };
}

interface HistoryEntry {
  date: string;
  commit: string;
  libraries: { done: number; total: number; percent: number };
  shaders: { done: number; total: number; percent: number };
}

interface PullJson {
  number: number;
  title: string;
  merged_at: string | null;
  created_at: string;
  draft?: boolean;
  user: { login: string; avatar_url: string };
}

// The roadmap is archived and its stages stopped on 23 October 2026: only its cover images are still used.
interface RoadmapJson {
  games: { titles?: { id: string }[]; image?: { wide?: string; square?: string } | null }[];
}

interface DiscussionsJson {
  repository: {
    discussionCategory: { id: string } | null;
    discussions: { pageInfo: { endCursor: string | null; hasNextPage: boolean }; nodes: DiscussionJson[] };
  };
}

const GAME_CATEGORY = "game-bring-up";
const CATEGORY_QUERY = `query($owner: String!, $name: String!, $slug: String!) {
  repository(owner: $owner, name: $name) { discussionCategory(slug: $slug) { id } }
}`;
const THREADS_QUERY = `query($owner: String!, $name: String!, $category: ID!, $after: String) {
  repository(owner: $owner, name: $name) {
    discussions(first: 100, after: $after, categoryId: $category, orderBy: { field: UPDATED_AT, direction: DESC }) {
      pageInfo { endCursor hasNextPage }
      nodes { number title body createdAt updatedAt comments { totalCount } }
    }
  }
}`;

const today = (): string => new Date().toISOString().slice(0, 10);
const daysAgo = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

// Reads "+6 implemented functions" or "+8 declared functions" from the progress-report bot's summary line.
function reportCount(body: string, kind: "implemented" | "declared"): number {
  const match = new RegExp(`([+−-]\\s?\\d[\\d\\s]*) ${kind} functions?`).exec(body);
  return match ? Number(match[1]!.replace(/[\s+]/g, "").replace("−", "-")) : 0;
}

interface SearchPull {
  user: { login: string; avatar_url: string };
}

function topAuthors(pulls: SearchPull[]): NonNullable<State["github"]>["topAuthors"] {
  const authors = new Map<string, { author: string; avatar: string; merged: number }>();
  for (const pull of pulls) {
    if (pull.user.login.endsWith("[bot]")) continue;
    const entry = authors.get(pull.user.login) ?? { author: pull.user.login, avatar: pull.user.avatar_url, merged: 0 };
    entry.merged += 1;
    authors.set(pull.user.login, entry);
  }
  return [...authors.values()].sort((a, b) => b.merged - a.merged).slice(0, 8);
}

export class Collector {
  readonly startedAt = new Date().toISOString();
  private history: HistoryPoint[] = [];
  private current: ProgressJson | null = null;
  private covers = new Map<string, string>();
  private gameCategory: string | null = null;
  private threads: GameThread[] = [];
  private liveChatId: string | null = null;
  private chat: { id: string | null; token: string | null; asked: Map<string, number> } = { id: null, token: null, asked: new Map() };
  readonly state: State = {
    updatedAt: new Date().toISOString(),
    sources: {},
    progress: null,
    history: [],
    libraries: null,
    github: null,
    games: null,
    events: [],
    youtube: { likes: null, viewers: null, shorts: Boolean(process.env.YOUTUBE_REFRESH_TOKEN) },
    chat: { answers: [] },
  };

  // Reports on open PRs change with every push, so they are kept in memory and read again after a while.
  private readonly openReports = new Map<number, { at: number; report: PrReport | null }>();

  constructor(private readonly store: Store, private readonly github: GitHub) {}

  get ready(): boolean {
    return this.state.progress !== null || this.state.github !== null;
  }

  private mark(source: string, error?: unknown): void {
    const previous = this.state.sources[source];
    this.state.sources[source] = error
      ? { ok: false, at: previous?.at ?? null, error: error instanceof Error ? error.message : String(error) }
      : { ok: true, at: new Date().toISOString() };
    this.state.updatedAt = new Date().toISOString();
    if (error) console.error(`[${source}]`, error instanceof Error ? error.message : error);
  }

  private async run(source: string, task: () => Promise<void>): Promise<void> {
    try {
      await task();
      this.mark(source);
    } catch (error) {
      this.mark(source, error);
    }
  }

  private ensureGithub(): NonNullable<State["github"]> {
    this.state.github ??= {
      stars: 0,
      openPrs: null,
      merged24h: null,
      merged7d: null,
      mergedPrs: [],
      openedPrs: [],
      topAuthors: [],
      release: null,
      rateRemaining: null,
      authenticated: this.github.authenticated,
    };
    return this.state.github;
  }

  private refreshEvents(): void {
    const computed: LiveEvent[] = historyEvents(this.history);
    const seen = new Set<string>();
    this.state.events = [...this.store.data.events, ...computed]
      .filter((event) => {
        const key = `${event.kind}|${event.title}|${event.time.slice(0, 10)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.time.localeCompare(a.time))
      .slice(0, 60);
  }

  private refreshProgress(): void {
    const current = this.current;
    if (!current) return;
    const delta = (point: HistoryPoint | undefined) =>
      point
        ? {
            done: current.libraries.done - point.done,
            total: current.libraries.total - point.total,
            percent: Math.round((current.libraries.percent - point.percent) * 100) / 100,
          }
        : null;
    const before = (date: string) => [...this.history].reverse().find((point) => point.date <= date);
    this.state.progress = {
      done: current.libraries.done,
      total: current.libraries.total,
      percent: current.libraries.percent,
      shadersDone: current.shaders.done,
      shadersTotal: current.shaders.total,
      shadersPercent: current.shaders.percent,
      day: delta(before(daysAgo(1))),
      week: delta(before(daysAgo(7))),
    };
  }

  async collectProgress(): Promise<void> {
    await this.run("progress", async () => {
      const progress = await getJson<ProgressJson>(`${PAGES}/progress.json?${Date.now()}`);
      this.current = progress;
      const groups = progress.libraries.groups.map((group) => ({ name: group.name, label: group.label ?? group.name, done: group.done, total: group.done + group.todo }));
      const snapshot: Snapshot = { date: today(), libraries: Object.fromEntries(groups.map((group) => [group.name, [group.done, group.total]])) };

      const snapshots = this.store.data.snapshots;
      const last = snapshots[snapshots.length - 1];
      if (last) this.store.addEvents(snapshotEvents(last, snapshot, new Date().toISOString()));
      if (last?.date === snapshot.date) snapshots[snapshots.length - 1] = snapshot;
      else snapshots.push(snapshot);
      this.store.data.snapshots = snapshots.slice(-35);

      const reference = [...this.store.data.snapshots].reverse().find((entry) => entry.date < snapshot.date);
      const movers = reference
        ? groups
            .map((group) => ({ ...group, gained: group.done - (reference.libraries[group.name]?.[0] ?? 0) }))
            .filter((group) => group.gained > 0)
            .sort((a, b) => b.gained - a.gained)
            .slice(0, 8)
            .map(({ name, gained, done, total }) => ({ name, gained, done, total }))
        : [];

      this.state.libraries = {
        count: groups.length,
        complete: groups.filter((group) => group.total > 0 && group.done === group.total).length,
        started: groups.filter((group) => group.done > 0 && group.done < group.total).length,
        untouched: groups.filter((group) => group.done === 0).length,
        biggest: [...groups].sort((a, b) => b.total - a.total).slice(0, 10),
        all: groups.filter((group) => group.total > 0).sort((a, b) => b.total - a.total),
        movers,
        moversSince: reference?.date ?? null,
      };
      this.refreshProgress();
      this.refreshEvents();
      await this.store.save();
    });
  }

  async collectHistory(): Promise<void> {
    await this.run("history", async () => {
      const entries = await getJson<HistoryEntry[]>(`${PAGES}/history.json?${Date.now()}`);
      this.history = entries.map((entry) => ({
        date: entry.date,
        commit: entry.commit,
        done: entry.libraries.done,
        total: entry.libraries.total,
        percent: entry.libraries.percent,
        shadersDone: entry.shaders.done,
        shadersTotal: entry.shaders.total,
      }));
      this.state.history = this.history;
      this.refreshProgress();
      this.refreshEvents();
    });
  }

  async collectActivity(): Promise<void> {
    await this.run("github", async () => {
      const github = this.ensureGithub();
      const pulls = await this.github.get<PullJson[]>(`/repos/${REPO}/pulls?state=closed&sort=updated&direction=desc&per_page=100`);
      const merged = pulls
        .filter((pull) => pull.merged_at)
        .sort((a, b) => b.merged_at!.localeCompare(a.merged_at!));
      github.mergedPrs = merged.slice(0, 14).map<MergedPr>((pull) => ({
        number: pull.number,
        title: pull.title,
        author: pull.user.login,
        avatar: pull.user.avatar_url,
        mergedAt: pull.merged_at!,
        report: this.store.data.prReports[pull.number] ?? null,
      }));
      const open = await this.github.get<PullJson[]>(`/repos/${REPO}/pulls?state=open&sort=created&direction=desc&per_page=20`);
      const opened = open.filter((pull) => !pull.draft).slice(0, 6);
      github.openedPrs = opened.map<OpenedPr>((pull) => ({
        number: pull.number,
        title: pull.title,
        author: pull.user.login,
        avatar: pull.user.avatar_url,
        createdAt: pull.created_at,
        report: this.openReports.get(pull.number)?.report ?? null,
      }));
      github.rateRemaining = this.github.rateRemaining;
      await this.collectReports(merged.slice(0, 14));
      await this.collectOpenReports(opened);
    });
  }

  private async readReport(number: number): Promise<PrReport | null> {
    const comments = await this.github.get<{ body: string }[]>(`/repos/${REPO}/issues/${number}/comments?per_page=100`);
    const comment = comments.find((item) => item.body.includes("<!-- progress-report -->"));
    return comment ? { implemented: reportCount(comment.body, "implemented"), declared: reportCount(comment.body, "declared") } : null;
  }

  private async collectOpenReports(opened: PullJson[]): Promise<void> {
    if (!this.github.authenticated) return;
    const shown = new Set(opened.map((pull) => pull.number));
    for (const number of this.openReports.keys()) if (!shown.has(number)) this.openReports.delete(number);
    for (const pull of opened) {
      const cached = this.openReports.get(pull.number);
      if (cached && Date.now() - cached.at < 20 * MINUTE) continue;
      if (this.github.rateRemaining !== null && this.github.rateRemaining < 50) break;
      this.openReports.set(pull.number, { at: Date.now(), report: await this.readReport(pull.number) });
    }
    for (const pr of this.ensureGithub().openedPrs) pr.report = this.openReports.get(pr.number)?.report ?? null;
  }

  private async collectReports(merged: PullJson[]): Promise<void> {
    const budget = this.github.authenticated ? 14 : 2;
    const missing = merged.filter((pull) => !(pull.number in this.store.data.prReports)).slice(0, budget);
    for (const pull of missing) {
      if (this.github.rateRemaining !== null && this.github.rateRemaining < 10) break;
      const report = await this.readReport(pull.number);
      if (!report && Date.now() - Date.parse(pull.merged_at!) < 2 * 60 * MINUTE) continue;
      this.store.data.prReports[pull.number] = report;
    }
    const keys = Object.keys(this.store.data.prReports).map(Number).sort((a, b) => b - a);
    for (const key of keys.slice(400)) delete this.store.data.prReports[key];
    const github = this.ensureGithub();
    for (const pr of github.mergedPrs) pr.report = this.store.data.prReports[pr.number] ?? null;
    await this.store.save();
  }

  async collectRepository(): Promise<void> {
    await this.run("repo", async () => {
      const github = this.ensureGithub();
      const repo = await this.github.get<{ stargazers_count: number }>(`/repos/${REPO}`);
      github.stars = repo.stargazers_count;
      try {
        const release = await this.github.get<{ tag_name: string; published_at: string }>(`/repos/${REPO}/releases/latest`);
        github.release = { tag: release.tag_name, publishedAt: release.published_at };
        if (this.store.data.releaseTag && this.store.data.releaseTag !== release.tag_name) {
          this.store.addEvents([{ time: release.published_at, kind: "release", title: `New release ${release.tag_name} published` }]);
        }
        this.store.data.releaseTag = release.tag_name;
        await this.store.save();
      } catch {
        const release = await getJson<{ tag: string }>(`${PAGES}/release.json?${Date.now()}`);
        github.release = { tag: release.tag, publishedAt: null };
      }
      github.rateRemaining = this.github.rateRemaining;
      this.refreshEvents();
    });
  }

  // GitHub's search returns at most 1,000 results, far above a day of merges.
  private async mergedSince(since: string): Promise<{ total: number; pulls: SearchPull[] }> {
    const query = encodeURIComponent(`repo:${REPO} is:pr is:merged merged:>=${since}`);
    const pulls: SearchPull[] = [];
    let total = 0;
    for (let page = 1; page <= 10; page += 1) {
      const result = await this.github.get<{ total_count: number; items: SearchPull[] }>(`/search/issues?per_page=100&page=${page}&q=${query}`);
      total = result.total_count;
      pulls.push(...result.items);
      if (result.items.length < 100 || pulls.length >= total) break;
    }
    return { total, pulls };
  }

  async collectCounts(): Promise<void> {
    await this.run("search", async () => {
      const github = this.ensureGithub();
      const count = async (query: string) =>
        (await this.github.get<{ total_count: number }>(`/search/issues?per_page=1&q=${encodeURIComponent(`repo:${REPO} ${query}`)}`)).total_count;
      const since = new Date(Date.now() - 86_400_000).toISOString().slice(0, 19) + "Z";
      github.openPrs = await count("is:pr is:open");
      const merged = await this.mergedSince(since);
      github.merged24h = merged.total;
      github.topAuthors = topAuthors(merged.pulls);
      github.merged7d = await count(`is:pr is:merged merged:>=${daysAgo(7)}`);
    });
  }

  async collectCovers(): Promise<void> {
    await this.run("covers", async () => {
      const roadmap = await getJson<RoadmapJson>(`${ROADMAP}/roadmap.json?${Date.now()}`);
      const covers = new Map<string, string>();
      for (const game of roadmap.games) {
        const image = game.image?.wide ?? game.image?.square;
        if (image) for (const title of game.titles ?? []) covers.set(title.id, image);
      }
      this.covers = covers;
    });
  }

  // Per-game status lives in AnyPS5's game bring-up discussions, one thread per title.
  async collectGames(): Promise<void> {
    if (!this.github.authenticated) return;
    await this.run("games", async () => {
      const [owner, name] = REPO.split("/");
      this.gameCategory ??= (await this.github.graphql<DiscussionsJson>(CATEGORY_QUERY, { owner, name, slug: GAME_CATEGORY })).repository.discussionCategory?.id ?? null;
      if (!this.gameCategory) throw new Error(`No ${GAME_CATEGORY} discussion category`);
      const discussions: DiscussionJson[] = [];
      let after: string | null = null;
      do {
        const page: DiscussionsJson = await this.github.graphql<DiscussionsJson>(THREADS_QUERY, { owner, name, category: this.gameCategory, after });
        discussions.push(...page.repository.discussions.nodes);
        after = page.repository.discussions.pageInfo.hasNextPage ? page.repository.discussions.pageInfo.endCursor : null;
      } while (after);

      const threads = discussions.map((discussion) => toThread(discussion, this.covers));
      this.threads = threads;
      const count = (stage: string) => threads.filter((thread) => thread.stage === stage).length;
      this.state.games = {
        tracked: threads.length,
        inGame: count("In game"),
        menu: count("Menu"),
        active24h: threads.filter((thread) => Date.now() - Date.parse(thread.updatedAt) < 86_400_000).length,
        stages: STAGES.map((stage) => ({ name: stage, count: count(stage) })),
        recent: threads.slice(0, 24),
        // The most discussed games tend to be the ones a viewer has heard of.
        highlights: threads.filter((thread) => thread.stage === "In game" && thread.cover).sort((a, b) => b.replies - a.replies).slice(0, 6),
      };
    });
  }

  // The key travels in a header: an error message with the URL ends up in the public /api/state.
  async collectYoutube(): Promise<void> {
    const key = process.env.YOUTUBE_API_KEY, video = process.env.YOUTUBE_VIDEO_ID;
    if (!key || !video) return;
    await this.run("youtube", async () => {
      const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics,liveStreamingDetails&id=${encodeURIComponent(video)}`, {
        headers: { "X-Goog-Api-Key": key },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`YouTube ${response.status}`);
      const { items } = (await response.json()) as { items: { statistics?: { likeCount?: string }; liveStreamingDetails?: { concurrentViewers?: string; activeLiveChatId?: string } }[] };
      const item = items[0];
      if (!item) throw new Error(`YouTube has no video ${video}`);
      const number = (value: string | undefined) => (value === undefined ? null : Number(value));
      this.state.youtube.likes = number(item.statistics?.likeCount);
      this.state.youtube.viewers = number(item.liveStreamingDetails?.concurrentViewers);
      this.liveChatId = item.liveStreamingDetails?.activeLiveChatId ?? null;
    });
  }

  // Reads new chat messages and answers !game, !lib and !help on screen. Nothing is posted back to the chat.
  async collectChat(): Promise<void> {
    const key = process.env.YOUTUBE_API_KEY, liveChatId = this.liveChatId;
    if (!key || !liveChatId) return;
    await this.run("chat", async () => {
      if (liveChatId !== this.chat.id) this.chat = { id: liveChatId, token: null, asked: new Map() };
      const query = new URLSearchParams({ liveChatId, part: "id,snippet,authorDetails", maxResults: "200" });
      if (this.chat.token) query.set("pageToken", this.chat.token);
      const response = await fetch(`https://www.googleapis.com/youtube/v3/liveChat/messages?${query}`, {
        headers: { "X-Goog-Api-Key": key },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`YouTube chat ${response.status}`);
      const body = (await response.json()) as ChatJson;
      const first = this.chat.token === null;
      this.chat.token = body.nextPageToken ?? this.chat.token;
      // The first read returns the recent history: those commands were typed before anyone listened.
      if (first) return;
      const now = Date.now();
      for (const [author, at] of this.chat.asked) if (now - at >= CHAT_COOLDOWN_MS) this.chat.asked.delete(author);
      const answers: ChatAnswer[] = [];
      for (const item of body.items) {
        if (answers.length >= CHAT_ANSWERS_PER_READ) break;
        if (item.snippet.type !== "textMessageEvent" || this.chat.asked.has(item.authorDetails.channelId)) continue;
        const answer = answerCommand(item.id, item.snippet.displayMessage ?? "", item.authorDetails.displayName, this.threads, this.state.libraries?.all ?? []);
        if (!answer) continue;
        this.chat.asked.set(item.authorDetails.channelId, now);
        answers.push(answer);
      }
      this.state.chat.answers = [...this.state.chat.answers, ...answers].slice(-10);
    });
  }

  start(): void {
    const fast = this.github.authenticated;
    const every = (minutes: number, task: () => Promise<void>) => setInterval(() => void task(), minutes * MINUTE).unref();
    void (async () => {
      await this.collectHistory();
      await this.collectProgress();
      await this.collectCovers();
      await this.collectGames();
      await this.collectRepository();
      await this.collectActivity();
      await this.collectCounts();
      await this.collectYoutube();
    })();
    every(fast ? 10 : 15, () => this.collectProgress());
    every(30, () => this.collectHistory());
    every(fast ? 2 : 6, () => this.collectActivity());
    every(fast ? 10 : 30, () => this.collectRepository());
    every(fast ? 5 : 10, () => this.collectCounts());
    every(180, () => this.collectCovers());
    every(10, () => this.collectGames());
    every(1, () => this.collectYoutube());
    if (CHAT_COMMANDS) every(CHAT_POLL_SECONDS / 60, () => this.collectChat());
  }
}
