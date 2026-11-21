#!/usr/bin/env node
// chief-dispatch SHADOW cycle (knowledge#16243). Reads the Utopia Fleet Board (org Project 1) through
// github-symphony's GitHub Project tracker, decides what it WOULD dispatch to each master lane, and appends
// the decisions to a JSONL log. It never dispatches, comments, moves an item or writes to GitHub.
//
// Routing model (our board, not upstream's): Status = lifecycle (Todo/Doing active, Done terminal, Blocked parked);
// Lane = which box runs it. win/nova/cloud/dust are interchangeable masters; agent (and an empty Lane) is never
// dispatched. One active issue per master. Candidates sort by Priority option order (P0 first), then oldest.
//
// Env: GITHUB_TOKEN (read-only), CHIEF_SHADOW_LOG (default ~/chief/shadow/decisions.jsonl),
//      CHIEF_QUOTA_FILE (optional JSON {"<lane>": {"ok": bool, "reason": str}}).
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fetchProjectIssues } from "../packages/tracker-github/dist/index.js";
import { decide } from "./decide.mjs";

export const BOARD = {
  projectId: "PVT_kwDOEZ-Tjc4Bb8OG",
  lifecycle: {
    stateFieldName: "Status",
    activeStates: ["Todo", "Doing"],
    terminalStates: ["Done"],
    planningStates: [],
    requiredLabels: [],
  },
  priorityFieldName: "Priority",
  masters: ["win", "nova", "cloud", "dust"],
};

function readQuota(path) {
  if (!path || !existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN missing");
  const log =
    process.env.CHIEF_SHADOW_LOG ?? join(homedir(), "chief/shadow/decisions.jsonl");
  mkdirSync(dirname(log), { recursive: true });
  const started = Date.now();
  const issues = await fetchProjectIssues({
    projectId: BOARD.projectId,
    token,
    lifecycle: BOARD.lifecycle,
    priorityFieldName: BOARD.priorityFieldName,
    filterTerminalStates: true,
  });
  const quota = readQuota(process.env.CHIEF_QUOTA_FILE);
  const result = decide(issues, { masters: BOARD.masters, quota });
  const record = {
    at: new Date().toISOString(),
    mode: "shadow",
    fetched: issues.length,
    ms: Date.now() - started,
    statusMissing: issues.skippedItemCount ?? 0,
    ...result,
  };
  appendFileSync(log, JSON.stringify(record) + "\n");
  for (const d of result.decisions) {
    console.log(
      `${d.lane}\t${d.action}\t${d.issue ?? "-"}\t${d.reason}${d.next ? "\tnext=" + d.next : ""}${d.title ? "\t" + d.title.slice(0, 70) : ""}`
    );
  }
  console.log(
    `shadow: fetched ${issues.length} items in ${record.ms} ms; would dispatch ${result.decisions.filter((d) => d.action === "would-dispatch").length}; log ${log}`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`shadow cycle failed: ${err?.message ?? err}`);
    process.exit(1);
  });
}
