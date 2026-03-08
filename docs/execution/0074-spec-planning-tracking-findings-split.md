# Spec Planning — Tracking Findings from `0073`

## QUESTION: Can we do all changes from `docs/execution/0073-tracking-findings-detailed-report.md` in one specification with Spec Kit or is it not recommended?

**Not recommended.** Here's why.

### Different scopes and risk profiles:

| Finding | Touches | Risk | Needs Migration |
|---|---|---|---|
| #1 + #2 | Server ingest + consumers + DB | High (migration + RPC) | Yes |
| #3 | `infer-stop-progress.ts` only | Low (~10 lines) | No |
| #4 | Van-tracker app (Expo) + server | Low (deletion only) | No (DB column later) |
| #5 | `osrm.ts` + env config | Trivial | No |

### Problems with one spec:

- #4 spans the van-tracker app (separate Expo project) — different build, different deploy
- #1+#2 requires a DB migration; if that PR gets blocked, it blocks trivial fixes like #5
- The project principles say "prefer minimal diffs; small PRs are safer and easier to review"
- One failing test in #4 shouldn't hold up the critical #1+#2 fix

---

## Recommended Split — 3 Specs

1. **`fix-position-freshness-and-race`** — Findings #1 + #2 (tightly coupled, same RPC solves both)
2. **`fix-stop-inference-lifecycle`** — Finding #3 (server-only, independent)
3. **`cleanup-tracker-sequence-and-osrm`** — Findings #4 + #5 (both are low-risk cleanup; #4 is van-tracker + server, #5 is server config — but they can share a PR since neither is risky)
