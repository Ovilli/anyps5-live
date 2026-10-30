const USER_AGENT = "anyps5-live-dashboard";

interface Cached {
  etag: string;
  body: unknown;
}

export class GitHub {
  private readonly cache = new Map<string, Cached>();
  rateRemaining: number | null = null;
  searchRemaining: number | null = null;

  constructor(private readonly token: string | undefined) {}

  get authenticated(): boolean {
    return Boolean(this.token);
  }

  async get<T>(path: string): Promise<T> {
    const url = path.startsWith("http") ? path : `https://api.github.com${path}`;
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const cached = this.cache.get(url);
    if (cached) headers["If-None-Match"] = cached.etag;

    const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
    const remaining = Number(response.headers.get("x-ratelimit-remaining"));
    if (Number.isFinite(remaining)) {
      if (response.headers.get("x-ratelimit-resource") === "search") this.searchRemaining = remaining;
      else this.rateRemaining = remaining;
    }
    if (response.status === 304 && cached) return cached.body as T;
    if (!response.ok) throw new Error(`GitHub ${response.status} on ${path}`);
    const body = (await response.json()) as T;
    const etag = response.headers.get("etag");
    if (etag) this.cache.set(url, { etag, body });
    return body;
  }
}

export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${response.status} on ${url}`);
  return (await response.json()) as T;
}
