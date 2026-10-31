# Kitly — Hackathon-day runbook (31 Oct 2026)

Mode for the day: **full** (D25), kit revised 30/10 after the team review (D26–D38) and the personalisation grill (D39–D48).

## Before the day
- [ ] 30/10: each member activates OpenAI API + Codex credits from the setup email; installs the Codex app; logs in to GitHub.
- [ ] Huy: Vercel + Supabase accounts ready (new projects are created on-site, not before).
- [ ] Everyone has this `kit/` folder (private kit repo) on their laptop.

## Timeline
Mode: **full** (D25). Ticket order after 30/10 (D26–D48): Lane 1 `00 01 02 03 04 09 16 05 06 07 08 20a`,
Lane 2 `10 11 15 17 12 13 14 20b`. Times = rehearsal 30→31/10 (Claude, `../rehearsal/RESULTS-full-2.md`) × 1.5 for Codex:
code-complete path 2h35m × 1.5 ≈ **3h50m → ~14:00**; the walk-and-fix pass after it took 1h20m × 1.5 ≈ 2h (most of those
fixes are now written into the tickets, so expect less).

| Time | Lane 1 (Codex, BE/AI/data) | Lane 2 (Codex, FE) | Lane 3 (QA/submission/backup) |
|---|---|---|---|
| 10:00 | read kit; wait 5 min for repo | read kit | create public repo, **Supabase project in Southeast Asia (Singapore)** + Vercel project with **Function Region = Singapore (sin1)** (same region: ~5 ms per DB call; across regions 150–300 ms × ~8 calls per kit edit = the "< 1 s" edits take 3 s), share env incl. `KITLY_SERVICE_TIER=fast`, copy `kit/` + `AGENTS.md` to repo root, push. Check after the first deploy: `curl -sI <url>/api/persona` header `x-vercel-id` reads `…::sin1::…` (31/10 the default `iad1` made ✕ take > 5 s) — or commit `vercel.json` `{"regions":["sin1"]}` |
| 10:05 | **T00** (~20') | wait for T00 push (read PRD/DEMO) | write `SUBMISSION.md` drafts |
| 10:25 | T01 (~35', LLM catalog) | T10 (~10') | start slides |
| 10:35 | | T11 (mock mode, ~20') | QA pass 1 (store pages) |
| 11:00 | T02 (~20') | (waits for T09) | |
| 11:20 | T03 (~15') | | |
| 11:35 | T04 (~12') | | QA pass 2 (Kitly beat 1 live, reload, history) |
| 11:45 | T09 (~12') | | |
| 12:00 | **T16** (~25': persona, 💛 cards, follow-up, answers) | T15 (~12') | |
| 12:20 | T05 (~20') | **T17** (~15') | QA pass 3 (Lan vs Guest, follow-up pills) |
| 12:40 | T06 (~12') | | |
| 12:50 | T07 (~5'), T08 (~10') | T12 (~12') | QA pass 4 (seller + live strip) |
| 13:05 | T20a (~5') | T13 (~25') | |
| 13:30 | free → fixes from QA | T14 e2e (~20') | |
| 13:50 | | T20b (~5') | |
| **14:00** | **Code complete. Lane 3 walks DEMO.md Beats 1–4 + Judge-proofing on the deployed URL; every ❌ becomes a `BLOCKERS.md` line → fix loop (both lanes)** | | full DEMO walk, `npm run e2e`, `npm run eval` |
| **15:45** | **Decision: Beats 1–4 working? Yes → polish only. No → bug-fix only.** | | |
| **16:15** | **code freeze** | **code freeze** | re-seed, walk DEMO twice, record numbers for CODEX_LOG |
| 16:30–16:45 | | | **submit** (repo, write-up PDF, demo link, declarations PDF) |

Before the demo round: run the hero sentence once (the first call with a new JSON schema is slower), re-seed, Undo any
listing fix, persona cookie on Lan.

**Cut line if late (in this order):** T07 Notify me → T14 e2e → T20b polish → the version switcher's "Restore" in T11 →
assumption-chip editing in T15. Never cut: closest match (T03), 3-basket fix (T02), threads + reload (T03/T09/T11), live
strip (T05/T12), **personalisation T16/T17 (D48: Lan, wallet, 💛 card, follow-up, answer turns)** — the demo depends on them.

**Lane 3 blocker loop (hourly).** Lane 3 reads `BLOCKERS.md` every hour, turns each open line into a small ticket
(`kit/tickets/9x-<slug>.md`: one paragraph, acceptance check, "Lane 1" or "Lane 2") and hands it to the lane that owns
the folders involved, ahead of that lane's next ticket. Resolved lines are deleted from `BLOCKERS.md` in the same commit.


## How to hand a ticket to Codex
Paste exactly (change lane/mode/ticket):
```
You are Lane <1|2>, mode <lean|full>. Read AGENTS.md, then kit/PRD.md, kit/CONTRACT.md, kit/DATA.md, kit/DEMO.md.
Implement ONLY kit/tickets/<NN-file>.md. Follow AGENTS.md exactly: tests first at the named seams,
npm test + npm run build green, commit "T<NN>: …", pull --rebase, push, append to CODEX_LOG.md.
```
When Codex finishes: read its final message, check `npm test` yourself, open the app, then next ticket.
If a run goes off the rails for > 15 min: stop it, `git reset --hard origin/main`, re-run with a sharper note.

## Credits
Rehearsal numbers (per ticket, per lane) live in `../rehearsal/RESULTS-full-2.md` (31/10: Lane 1 ≈ 16%, Lane 2 ≈ 11% of the
$100 Codex budget, estimated). If a lane passes ~80% of its
estimate before 14:30, Lane 3 takes the next ticket on its account.

## Optional: private demo link (Basic Auth)
To share the deployed URL with teammates without letting strangers spend the LLM key, set the env var
`KITLY_BASIC_AUTH=user:pass` (Vercel project settings). When it is set, a Next.js middleware (`src/middleware.ts`)
answers every request (pages and `/api/*`) with `401` + `WWW-Authenticate: Basic` unless the `Authorization: Basic …`
header matches; when it is unset, the middleware does nothing. Remove the variable before the judges' link goes
into the submission. The credentials are never committed (env only).
