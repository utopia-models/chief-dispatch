// node --test chief/decide.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, sortCandidates, candidateReason } from "./decide.mjs";

const mk = (n, o = {}) => ({
  identifier: `utopia-models/knowledge#${n}`,
  title: `issue ${n}`,
  state: "Todo",
  priority: 2,
  createdAt: `2026-11-${String(10 + (n % 10)).padStart(2, "0")}T00:00:00.000Z`,
  labels: [],
  dispatchable: true,
  nativeRef: { sourceState: "OPEN" },
  metadata: { projectFields: { Lane: "win" } },
  ...o,
  metadata: { projectFields: { Lane: "win", ...(o.fields ?? {}) } },
});

test("picks the highest priority, then oldest, per lane", () => {
  const r = decide([mk(1, { priority: 2 }), mk(2, { priority: 0 }), mk(3, { priority: 0, createdAt: "2026-11-01T00:00:00.000Z" })], { masters: ["win"] });
  assert.equal(r.decisions[0].action, "would-dispatch");
  assert.equal(r.decisions[0].issue, "utopia-models/knowledge#3");
});

test("a lane with a Doing issue is busy", () => {
  const r = decide([mk(1, { state: "Doing" }), mk(2)], { masters: ["win"] });
  assert.equal(r.decisions[0].action, "busy");
});

test("agent lane and empty lane are never dispatched", () => {
  const r = decide([mk(1, { fields: { Lane: "agent" } }), mk(2, { fields: { Lane: "" } })], { masters: ["win", "nova"] });
  assert.deepEqual(r.decisions.map((d) => d.action), ["idle", "idle"]);
  assert.equal(r.summary.unrouted, 2);
});

test("quota hold beats work", () => {
  const r = decide([mk(1)], { masters: ["win"], quota: { win: { ok: false, reason: "weekly" } } });
  assert.equal(r.decisions[0].action, "hold");
  assert.equal(r.decisions[0].reason, "quota:weekly");
});

test("excluded labels, interactive mode and closed issues are skipped", () => {
  assert.equal(candidateReason(mk(1, { labels: ["needs-human"] }), "win"), "excluded-label:needs-human");
  assert.equal(candidateReason(mk(2, { fields: { Mode: "interactive" } }), "win"), "interactive-mode");
  assert.equal(candidateReason(mk(3, { nativeRef: { sourceState: "CLOSED" } }), "win"), "closed");
  assert.equal(candidateReason(mk(4, { dispatchable: false, dispatchReason: "blocked_by" }), "win"), "not-dispatchable:blocked_by");
});

test("null priority sorts last", () => {
  const s = sortCandidates([mk(1, { priority: null }), mk(2, { priority: 3 })]);
  assert.equal(s[0].identifier, "utopia-models/knowledge#2");
});

test("busy lane still reports the next candidate", () => {
  const r = decide([mk(1, { state: "Doing" }), mk(2, { priority: 0 })], { masters: ["win"] });
  assert.equal(r.decisions[0].next, "utopia-models/knowledge#2");
  assert.equal(r.summary.doingByLane.win, 1);
});
