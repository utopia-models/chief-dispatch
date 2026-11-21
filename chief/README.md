# chief-dispatch (Utopia Models fork of hojinzs/github-symphony, MIT)

The Chief of Staff's dispatcher (knowledge#16243). Upstream github-symphony is unchanged except one tracker
patch: `packages/tracker-github/src/adapter.ts` exposes every single-select/text Project field on
`issue.metadata.projectFields`, so routing can read our `Lane`, `Priority`, `Mode` fields.

## SHADOW mode (now)
`chief/shadow.mjs` reads the Utopia Fleet Board (org Project 1) with the upstream GitHub Project tracker,
`chief/decide.mjs` decides per master lane (win, nova, cloud, dust) what it WOULD dispatch, and the cycle
appends one JSONL record to `~/chief/shadow/decisions.jsonl`. It never dispatches or writes to GitHub; the
token it gets (`/usr/local/lib/chief/chief-gh-token`) is read-only (issues, PRs, org projects, metadata).

Rules: Status Todo/Doing = active, Done = terminal; Lane agent/empty is never dispatched; one active issue per
master; candidates sort by Priority option order, then oldest, then identifier (upstream's order); labels
needs-human/blocked/epic/parked/do-not-dispatch and Mode=interactive are skipped; a lane whose quota file
entry says `ok:false` is held.

Tests: `node --test chief/*.test.mjs`. Deploy on Ra: `/opt/chief-dispatch` (built), user units in
`chief/systemd/` installed for user `chief`.

## Live mode (after the shadow week)
Compare the decision log with sweep-dispatch for 7 clean days, then switch the decision to call
`dispatch.sh <master> <issue#>` (with the quota gate) and delete the old dispatchers per
`_shots/fleet-goals/AUDIT-strip-list.md`.
