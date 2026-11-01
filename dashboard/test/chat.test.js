import { test } from "node:test";
import assert from "node:assert/strict";
import { answerCommand } from "../dist/chat.js";

const thread = (number, name, stage, replies, titleId = null) => ({ number, name, titleId, stage, replies, createdAt: "", updatedAt: "", cover: null });
const threads = [
  thread(1, "Demon's Souls", "Menu", 4, "PPSA01341"),
  thread(2, "Demon's Souls", "In game", 9, "PPSA01342"),
  thread(3, "Astro's Playroom", "Logos or loading", 30, "PPSA01325"),
];
const libraries = [
  { name: "libKernel", label: "Kernel", done: 450, total: 600 },
  { name: "libSceGnmDriver", label: "GPU driver", done: 10, total: 400 },
];
const ask = (text) => answerCommand("m1", text, "Viewer", threads, libraries);

test("ignores messages that are not commands", () => {
  assert.equal(ask("hello"), null);
  assert.equal(ask("this !game is great"), null);
  assert.equal(ask("!gamer"), null);
});

test("!game picks the furthest stage among duplicate threads", () => {
  const answer = ask("!game demons souls");
  assert.equal(answer.title, "Demon's Souls");
  assert.equal(answer.pill, "In game");
  assert.equal(answer.kicker, "!game · asked by Viewer");
});

test("!game matches a title ID and part of a name, any case", () => {
  assert.equal(ask("!GAME ppsa01325").title, "Astro's Playroom");
  assert.equal(ask("!game astro").title, "Astro's Playroom");
});

test("a miss suggests the closest name", () => {
  const answer = ask("!game playroom of astro bot");
  assert.match(answer.title, /^No game matches/);
  assert.equal(answer.meta, "Closest: Astro's Playroom");
});

test("!lib matches the name or the label and shows the share done", () => {
  assert.equal(ask("!lib kernel").pill, "75%");
  assert.equal(ask("!lib gnm").title, "GPU driver");
  assert.match(ask("!lib zzz").title, /^No library matches/);
});

test("!help, and a command without a name, list the commands", () => {
  assert.match(ask("!help").title, /!game/);
  assert.match(ask("!game").title, /!lib/);
});
