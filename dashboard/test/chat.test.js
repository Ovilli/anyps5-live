import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAT_REMINDER, answerCommand, nextChatDelay, quotaDay } from "../dist/chat.js";

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
  assert.match(answer.title, /^No game found/);
  assert.equal(answer.meta, "Closest: Astro's Playroom");
});

test("!lib matches the name or the label and shows the share done", () => {
  assert.equal(ask("!lib kernel").pill, "75%");
  assert.equal(ask("!lib gnm").title, "GPU driver");
  assert.match(ask("!lib zzz").title, /^No library found/);
});

test("!help, and a command without a name, list the commands", () => {
  assert.match(ask("!help").title, /!game/);
  assert.match(ask("!game").title, /!lib/);
});

test("what a viewer types never reaches the screen", () => {
  const answer = ask("!game buy cheap followers at spam.example");
  assert.doesNotMatch(JSON.stringify(answer), /spam|followers/);
  assert.doesNotMatch(JSON.stringify(ask("!lib spam.example")), /spam/);
});

test("!game understands short names and words in any order", () => {
  const games = [thread(4, "Grand Theft Auto V", null, 25), thread(5, "Red Dead Redemption", "In game", 2)];
  const short = (text) => answerCommand("m", text, "Viewer", games, []);
  assert.equal(short("!game gta v").title, "Grand Theft Auto V");
  assert.equal(short("!game rdr").title, "Red Dead Redemption");
  assert.equal(short("!game redemption red").title, "Red Dead Redemption");
});

test("!game gta 6 answers honestly until a test thread exists", () => {
  const answer = ask("!game gta 6");
  assert.equal(answer.title, "GTA VI");
  assert.equal(answer.pill, "0%");
  const withThread = answerCommand("m", "!game gta vi", "Viewer", [thread(6, "Grand Theft Auto VI", "Menu", 3)], []);
  assert.equal(withThread.pill, "Menu");
});

test("!discord gives the invite and its code", () => {
  const answer = ask("!discord");
  assert.equal(answer.kind, "discord");
  assert.match(answer.meta, /discord\.gg\/BHFztBPUe/);
  assert.equal(answer.image, "discord-qr.svg");
});

test("!next and !top read the live figures", () => {
  const context = { progress: { done: 9134, week: { done: 2800 } }, topAuthors: [{ author: "ana", merged: 18 }, { author: "bo", merged: 3 }] };
  const live = (text) => answerCommand("m", text, "Viewer", threads, libraries, context);
  assert.equal(live("!next").title, "Next goal: 10,000 functions");
  assert.match(live("!next").meta, /^866 to go · about 2 days/);
  assert.equal(live("!top").title, "ana leads today");
  assert.equal(live("!top").pill, "18 PRs");
  assert.match(ask("!next").title, /loading/);
});

test("!random only picks games reaching gameplay", () => {
  for (let turn = 0; turn < 20; turn += 1) assert.equal(ask("!random").pill, "In game");
});

test("!gamer and other near misses stay ignored", () => {
  assert.equal(ask("!discordant"), null);
  assert.equal(ask("!topic"), null);
});

test("the chat reminder fits YouTube's limit and names the Discord", () => {
  assert.ok([...CHAT_REMINDER].length <= 200);
  assert.match(CHAT_REMINDER, /https:\/\/discord\.gg\/BHFztBPUe/);
});

test("the stream reopens at once only during a burst with budget left", () => {
  assert.equal(nextChatDelay(1000, 5000, 100, 75), 250);
  assert.equal(nextChatDelay(6000, 5000, 100, 75), 75_000);
  assert.equal(nextChatDelay(1000, 5000, 0, 75), 300_000);
});

test("the quota day follows California, not UTC", () => {
  assert.equal(quotaDay(Date.parse("2026-11-02T07:00:00Z")), "2026-11-01");
  assert.equal(quotaDay(Date.parse("2026-11-02T09:00:00Z")), "2026-11-02");
});
