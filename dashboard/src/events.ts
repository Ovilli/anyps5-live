import type { HistoryPoint, LiveEvent, Snapshot } from "./types.js";

const number = new Intl.NumberFormat("en-US");
const DISCOVERY_EXPORTS = 300;
const JUMP_FUNCTIONS = 150;
const PERCENT_POINTS = 1;
const LIBRARY_JUMP = 25;

const noon = (date: string): string => `${date}T12:00:00Z`;
const signed = (value: number, digits = 0): string =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${digits ? Math.abs(value).toFixed(digits) : number.format(Math.abs(value))}`;

export function historyEvents(points: HistoryPoint[]): LiveEvent[] {
  const events: LiveEvent[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const point = points[index]!;
    const time = noon(point.date);
    const gainedTotal = point.total - previous.total;
    const gainedDone = point.done - previous.done;
    const movedPercent = point.percent - previous.percent;

    if (gainedTotal >= DISCOVERY_EXPORTS) {
      events.push({
        time,
        kind: "discovery",
        title: `${signed(gainedTotal)} PS5 exports declared`,
        detail: `The tracked total grew from ${number.format(previous.total)} to ${number.format(point.total)} functions.`,
      });
    }
    if (gainedDone >= JUMP_FUNCTIONS) {
      events.push({
        time,
        kind: "jump",
        title: `${signed(gainedDone)} functions implemented in a single day`,
        detail: `${number.format(previous.done)} → ${number.format(point.done)} functions done.`,
      });
    }
    if (Math.abs(movedPercent) >= PERCENT_POINTS) {
      const widened = movedPercent < 0 && gainedTotal >= DISCOVERY_EXPORTS;
      events.push({
        time,
        kind: "percent",
        title: widened
          ? `Completion rate ${signed(movedPercent, 2)} pts (total widened)`
          : `Completion rate ${signed(movedPercent, 2)} pts (now ${point.percent.toFixed(2)}%)`,
        detail: widened
          ? "Mechanical drop: the total widened, no function was lost."
          : `From ${previous.percent.toFixed(2)}% to ${point.percent.toFixed(2)}%.`,
      });
    }
    const before = Math.floor(previous.done / 1000);
    const after = Math.floor(point.done / 1000);
    for (let mark = before + 1; mark <= after; mark += 1) {
      events.push({ time, kind: "milestone", title: `${number.format(mark * 1000)} implemented functions reached` });
    }
    if (point.shadersTotal > 0 && point.shadersDone === point.shadersTotal && previous.shadersDone < previous.shadersTotal) {
      events.push({ time, kind: "milestone", title: "GPU shaders: 100% of RDNA instructions decoded" });
    }
  }
  return events;
}

export function snapshotEvents(previous: Snapshot, current: Snapshot, time: string): LiveEvent[] {
  const events: LiveEvent[] = [];
  for (const [name, [done, total]] of Object.entries(current.libraries)) {
    const before = previous.libraries[name];
    if (!before) {
      events.push({
        time,
        kind: "discovery",
        title: `New library: ${name}`,
        detail: `${number.format(total)} exports declared, ${number.format(done)} already implemented.`,
      });
      continue;
    }
    const [doneBefore, totalBefore] = before;
    if (total - totalBefore >= 5) {
      events.push({ time, kind: "discovery", title: `${name}: ${signed(total - totalBefore)} exports discovered` });
    }
    if (done - doneBefore >= LIBRARY_JUMP) {
      events.push({ time, kind: "library", title: `${name}: ${signed(done - doneBefore)} functions implemented` });
    }
    if (total > 0 && done === total && doneBefore < totalBefore) {
      events.push({ time, kind: "complete", title: `${name} reached 100%`, detail: `${number.format(total)} of ${number.format(total)} functions.` });
    }
  }
  return events;
}
