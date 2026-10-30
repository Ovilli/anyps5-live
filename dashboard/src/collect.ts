import { gameEvents, historyEvents, snapshotEvents, describeGameChange } from "./events.js";
import { GitHub, getJson } from "./http.js";
import type { Store } from "./store.js";
import type { HistoryPoint, LiveEvent, MergedPr, Snapshot, State } from "./types.js";

const REPO = process.env.ANYPS5_REPO ?? "boykopovar/AnyPS5";
const PAGES = (process.env.ANYPS5_PAGES ?? "https://boykopovar.github.io/AnyPS5").replace(/\/$/, "");
const ROADMAP = (process.env.ROADMAP_URL ?? "https://alxcbtw.github.io/anyps5-roadmap").replace(/\/$/, "");
const MINUTE = 60_000;

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
  user: { login: string; avatar_url: string };
}

interface RoadmapJson {
  generated_at: string;
  stages: { name: string; rank: number }[];
  stats: {
    games: number;
    games_playable: number;
    games_reach_menus: number;
    games_with_open_blockers: number;
    games_by_stage: Record<string, number>;
  };
}

interface FeedJson {
  items: { id: string; content_text?: string }[];
}

const today = (): string => new Date().toISOString().slice(0, 10);
const daysAgo = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

export class Collector {
  readonly startedAt = new Date().toISOString();
  private history: HistoryPoint[] = [];
  private current: ProgressJson | null = null;
  private feed: FeedJson | null = null;
  readonly state: State = {
    updatedAt: new Date().toISOString(),
    sources: {},
    progress: null,
    history: [],
    libraries: null,
    github: null,
    games: null,
    events: [],
  };

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
      release: null,
      rateRemaining: null,
      authenticated: this.github.authenticated,
    };
    return this.state.github;
  }

  private refreshEvents(): void {
    const computed: LiveEvent[] = [...historyEvents(this.history), ...(this.feed ? gameEvents(this.feed.items) : [])];
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
        added: this.store.data.prAdded[pull.number] ?? null,
      }));
      github.rateRemaining = this.github.rateRemaining;
      await this.collectReports(merged.slice(0, 14));
    });
  }

  private async collectReports(merged: PullJson[]): Promise<void> {
    const budget = this.github.authenticated ? 14 : 2;
    const missing = merged.filter((pull) => !(pull.number in this.store.data.prAdded)).slice(0, budget);
    for (const pull of missing) {
      if (this.github.rateRemaining !== null && this.github.rateRemaining < 10) break;
      const comments = await this.github.get<{ body: string }[]>(`/repos/${REPO}/issues/${pull.number}/comments?per_page=100`);
      const report = comments.find((comment) => comment.body.includes("<!-- progress-report -->"));
      let added: number | null = null;
      if (report) {
        const functions = /([+−-]\s?\d[\d\s]*) implemented functions?/.exec(report.body);
        added = functions ? Number(functions[1]!.replace(/[\s+]/g, "").replace("−", "-")) : 0;
      } else if (Date.now() - Date.parse(pull.merged_at!) < 2 * 60 * MINUTE) {
        continue;
      }
      this.store.data.prAdded[pull.number] = added;
    }
    const keys = Object.keys(this.store.data.prAdded).map(Number).sort((a, b) => b - a);
    for (const key of keys.slice(400)) delete this.store.data.prAdded[key];
    const github = this.ensureGithub();
    for (const pr of github.mergedPrs) pr.added = this.store.data.prAdded[pr.number] ?? null;
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

  async collectCounts(): Promise<void> {
    await this.run("search", async () => {
      const github = this.ensureGithub();
      const count = async (query: string) =>
        (await this.github.get<{ total_count: number }>(`/search/issues?per_page=1&q=${encodeURIComponent(`repo:${REPO} ${query}`)}`)).total_count;
      const since = new Date(Date.now() - 86_400_000).toISOString().slice(0, 19) + "Z";
      github.openPrs = await count("is:pr is:open");
      github.merged24h = await count(`is:pr is:merged merged:>=${since}`);
      github.merged7d = await count(`is:pr is:merged merged:>=${daysAgo(7)}`);
    });
  }

  async collectRoadmap(): Promise<void> {
    await this.run("roadmap", async () => {
      const roadmap = await getJson<RoadmapJson>(`${ROADMAP}/roadmap.json?${Date.now()}`);
      const stages = [...roadmap.stages].sort((a, b) => a.rank - b.rank);
      this.state.games = {
        generatedAt: roadmap.generated_at,
        tracked: roadmap.stats.games,
        playable: roadmap.stats.games_playable,
        menus: roadmap.stats.games_reach_menus,
        blockers: roadmap.stats.games_with_open_blockers,
        stages: stages.map((stage) => ({ name: stage.name, count: roadmap.stats.games_by_stage[stage.name] ?? 0 })),
        changes: this.state.games?.changes ?? [],
      };
    });
  }

  async collectFeed(): Promise<void> {
    await this.run("games", async () => {
      this.feed = await getJson<FeedJson>(`${ROADMAP}/feed.json?${Date.now()}`);
      const changes = this.feed.items.flatMap((item) =>
        (item.content_text ?? "").split("\n").filter((line) => line.trim()).map((line) => ({ time: item.id, text: describeGameChange(line) })),
      );
      if (this.state.games) this.state.games.changes = changes.slice(0, 8);
      this.refreshEvents();
    });
  }

  start(): void {
    const fast = this.github.authenticated;
    const every = (minutes: number, task: () => Promise<void>) => setInterval(() => void task(), minutes * MINUTE).unref();
    void (async () => {
      await this.collectHistory();
      await this.collectProgress();
      await this.collectRoadmap();
      await this.collectFeed();
      await this.collectRepository();
      await this.collectActivity();
      await this.collectCounts();
    })();
    every(fast ? 10 : 15, () => this.collectProgress());
    every(30, () => this.collectHistory());
    every(fast ? 2 : 6, () => this.collectActivity());
    every(fast ? 10 : 30, () => this.collectRepository());
    every(fast ? 5 : 10, () => this.collectCounts());
    every(180, () => this.collectRoadmap());
    every(30, () => this.collectFeed());
  }
}
