// Pure dispatch decision for the chief-dispatch shadow cycle (knowledge#16243). No I/O, so it is unit-tested.
// Sort order copied from github-symphony's sortCandidatesForDispatch (MIT): priority ascending (null last),
// createdAt oldest first (null last), identifier lexicographic.

export const EXCLUDE_LABELS = ["needs-human", "blocked", "epic", "parked", "do-not-dispatch"];

const lower = (s) => String(s ?? "").trim().toLowerCase();
const fields = (issue) => issue?.metadata?.projectFields ?? {};
const isOpen = (issue) => lower(issue?.nativeRef?.sourceState || "open") === "open";

export function sortCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    if (a.priority !== b.priority) {
      if (a.priority === null || a.priority === undefined) return 1;
      if (b.priority === null || b.priority === undefined) return -1;
      return a.priority - b.priority;
    }
    const ac = a.createdAt ?? null;
    const bc = b.createdAt ?? null;
    if (ac !== bc) {
      if (ac === null) return 1;
      if (bc === null) return -1;
      return ac.localeCompare(bc);
    }
    return String(a.identifier).localeCompare(String(b.identifier));
  });
}

export function candidateReason(issue, lane) {
  if (lower(fields(issue).Lane) !== lane) return "other-lane";
  if (!isOpen(issue)) return "closed";
  if (lower(issue.state) !== "todo") return "not-todo";
  if (!issue.dispatchable) return `not-dispatchable:${issue.dispatchReason ?? "unknown"}`;
  if (lower(fields(issue).Mode) === "interactive") return "interactive-mode";
  const bad = (issue.labels ?? []).find((l) => EXCLUDE_LABELS.includes(lower(l)));
  if (bad) return `excluded-label:${bad}`;
  return null;
}

export function decide(issues, { masters, quota = {} }) {
  const decisions = [];
  for (const lane of masters) {
    const inLane = issues.filter((i) => lower(fields(i).Lane) === lane && isOpen(i));
    const doing = inLane.filter((i) => lower(i.state) === "doing");
    const q = quota[lane];
    if (q && q.ok === false) {
      decisions.push({ lane, action: "hold", issue: null, reason: `quota:${q.reason ?? "limit"}` });
      continue;
    }
    const ready = sortCandidates(inLane.filter((i) => candidateReason(i, lane) === null));
    if (doing.length > 0) {
      decisions.push({
        lane,
        action: "busy",
        issue: doing[0].identifier,
        title: doing[0].title,
        reason: `doing:${doing.length}`,
        // what it would take next once the lane frees (makes the shadow comparable with sweep-dispatch)
        next: ready[0]?.identifier ?? null,
      });
      continue;
    }
    if (ready.length === 0) {
      decisions.push({ lane, action: "idle", issue: null, reason: "no-ready-todo" });
      continue;
    }
    decisions.push({
      lane,
      action: "would-dispatch",
      issue: ready[0].identifier,
      title: ready[0].title,
      reason: `priority:${ready[0].priority ?? "none"}`,
      queue: ready.slice(1, 4).map((i) => i.identifier),
    });
  }
  const openTodo = issues.filter((i) => isOpen(i) && lower(i.state) === "todo");
  const summary = {
    openTodo: openTodo.length,
    doingByLane: Object.fromEntries(
      masters.map((m) => [m, issues.filter((i) => isOpen(i) && lower(i.state) === "doing" && lower(fields(i).Lane) === m).length])
    ),
    unrouted: openTodo.filter((i) => !masters.includes(lower(fields(i).Lane))).length,
    byLane: Object.fromEntries(
      masters.map((m) => [m, openTodo.filter((i) => lower(fields(i).Lane) === m).length])
    ),
  };
  return { decisions, summary };
}
