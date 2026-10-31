import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Collector } from "./collect.js";
import { GitHub } from "./http.js";
import { Store } from "./store.js";

const PORT = Number(process.env.PORT ?? 8080);
const DATA_DIR = process.env.DATA_DIR ?? fileURLToPath(new URL("../data", import.meta.url));
const PUBLIC_DIR = resolve(fileURLToPath(new URL("../public", import.meta.url)));
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8",
};

const store = new Store(DATA_DIR);
await store.load();
const collector = new Collector(store, new GitHub(process.env.GITHUB_TOKEN || undefined));
collector.start();

// Any request error (a malformed URL from a scanner, say) answers 400 instead of crashing the process.
const server = createServer((request, response) => {
  handle(request, response).catch(() => {
    if (!response.headersSent) response.writeHead(400);
    response.end();
  });
});

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === "/api/state") {
    response.writeHead(200, { "Content-Type": TYPES[".json"]!, "Cache-Control": "no-store" });
    response.end(JSON.stringify({ ...collector.state, startedAt: collector.startedAt, serverTime: new Date().toISOString() }));
    return;
  }
  if (url.pathname === "/healthz") {
    response.writeHead(collector.ready ? 200 : 503, { "Content-Type": "text/plain" });
    response.end(collector.ready ? "ok" : "starting");
    return;
  }
  const relative = url.pathname === "/" ? "index.html" : normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, "");
  const file = join(PUBLIC_DIR, relative);
  if (!file.startsWith(PUBLIC_DIR) || !TYPES[extname(file)]) {
    response.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { "Content-Type": TYPES[extname(file)]!, "Cache-Control": "no-cache" });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
}

server.listen(PORT, () => console.log(`AnyPS5 live dashboard on http://localhost:${PORT} (GitHub token: ${process.env.GITHUB_TOKEN ? "yes" : "no"})`));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close();
    void store.save().finally(() => process.exit(0));
  });
}
