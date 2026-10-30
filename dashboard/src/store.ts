import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { LiveEvent, Snapshot } from "./types.js";

export interface Persisted {
  snapshots: Snapshot[];
  events: LiveEvent[];
  prAdded: Record<string, number | null>;
  releaseTag: string | null;
}

const empty = (): Persisted => ({ snapshots: [], events: [], prAdded: {}, releaseTag: null });

export class Store {
  private readonly file: string;
  data: Persisted = empty();

  constructor(directory: string) {
    this.file = join(directory, "state.json");
  }

  async load(): Promise<void> {
    try {
      this.data = { ...empty(), ...JSON.parse(await readFile(this.file, "utf8")) };
    } catch {
      this.data = empty();
    }
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    await writeFile(temporary, JSON.stringify(this.data));
    await rename(temporary, this.file);
  }

  addEvents(events: LiveEvent[]): void {
    const known = new Set(this.data.events.map((event) => `${event.kind}|${event.title}`));
    for (const event of events) {
      const key = `${event.kind}|${event.title}`;
      if (!known.has(key)) {
        this.data.events.push(event);
        known.add(key);
      }
    }
    this.data.events.sort((a, b) => b.time.localeCompare(a.time));
    this.data.events = this.data.events.slice(0, 200);
  }
}
