# Blockers

None active. The T01 URL blocker was resolved on 2026-10-31: Huy explicitly authorized adding `https://` to the existing local Supabase API hostname. The project/database and `KITLY_DB_SCHEMA=public` were kept unchanged. Supabase API and Postgres connections verified.

T00's earlier GitHub push blocker remains resolved.

## T11 live integration dependency

Lane 2 previously reported a URL without an HTTP(S) scheme on its checkout. On this Lane 1 checkout, Huy authorized the HTTPS prefix fix and the API, shared Supabase tests, seed, and deployed catalog now work. No active URL blocker here; another checkout may still need its local env updated. T10 previously passed 39 Vitest and 2 Playwright tests on the T00 memory baseline.
T11 can be developed and verified in the explicitly supported fixture replay mode (`NEXT_PUBLIC_KITLY_MOCK=1`). T03/T04 now supply `/api/kit` and `/api/kit/refine`. History/budget/restore/swap verification still awaits Lane 1 T09 (`/api/threads`, `/api/kit/adjust`, `/api/kit/price`). The local Supabase URL issue is resolved; no env files were changed.

## Verification note outside Lane 1

`npm test` (125 passed), `npm run lint`, and `npm run build` pass after T04. A separate `npx tsc --noEmit` still reports fixture typing errors in `tests/ui/store.test.tsx` from T10: imported JSON attributes infer optional `undefined` entries incompatible with `Record<string, string>`. This is outside the requested Lane 1 tickets; the UI test file was not edited. Its fixtures should be parsed through the existing contract schemas by Lane 2. No blocker remains for the requested runtime/test/build gates.


## T15 live integration dependency

T15 frontend edits are implemented and verified with fixture-backed API responses: remove/undo, closest Add anyway, Fit/Undo, inline edits, selection reload and request/error locking. T09 adjust/price/history endpoints have landed and passed the Lane1 seeded HTTP tests; Lane2 end-to-end verification remains part of its live demo pass. Fixture replay does not simulate arbitrary optimizer responses; unsupported edits fail explicitly and leave the kit unchanged. No new env values or dependencies are needed.

## T17 live integration dependency

T17 persona/interest/wallet/follow-up/answer UI passes fixture tests and browser flows. T09 and T16 backend support has landed and passed real OpenAI+Supabase HTTP checks; Lane2 full live verification remains part of its demo pass. GitHub credential helper is configured and Lane 2 can push. No new env values are needed.

## T12 live integration dependency

Seller UI, preview/apply/reload/undo, live strip and Notify me are implemented and fixture-tested. T05 seller insights is now implemented and verified against the seeded DB. Live enrichment/watch verification still requires T06/T07, which remain outside this run. T09 edit/history routes have landed; those earlier missing-route dependencies are resolved. No env or package changes are needed.

## T13 — blocked before live demo pass (Lane 2, full)

After pushing T17 and T12, `git pull --rebase` is up to date at 885a684. Ticket 13 explicitly requires T06 and a real deployed DB/LLM demo; this checkout has no `/api/seller/insights` or `/api/seller/enrichment/{preview,apply,undo}` routes (T05/T06), so Beats 3–4 cannot run. The T16 backend for personalised interests/follow-up/answer turns is also not present yet, preventing the full judge-proofing pass. T12 fixture replay is not evidence for this live acceptance. Per AGENTS.md, stop on missing dependencies. Resume at T13 after Lane 1 pushes T05/T06/T16 (and T07 for Notify me); then T14, then T20b after T20a. Do not mark these tickets or Lane 2 complete. No env change is needed.

## Backend dependency update after T09/T16/T05

T09 edit/history, T16 personalization/answer turns and T05 seller insights are implemented and verified (see CODEX_LOG.md). The T13 historical blocker above describes its earlier checkout; its remaining missing backend dependencies are T06 enrichment and T07 Notify me (and later T20a for T20b). No active blocker applies to this run’s requested T09/T16/T05 tickets. No env values changed.

## T06 backend dependency update

T06 enrichment preview/apply/undo is implemented and verified through real-model/DB production HTTP, including durable insights `appliedFix` and exact Undo restoration. Migration `0004_enrichment_apply.sql` was applied alone to the configured schema, preserving data. Apply is atomic across instances. T13's remaining missing route dependency is T07 Notify me; T20b still awaits T20a. No env values changed.

## T07 backend dependency update

T07 Notify me is implemented and verified through production HTTP against the configured DB; insights include persisted watchers. T13's previously missing T05/T06/T07/T09/T16 backend routes are now present. Lane 2 can resume its live demo pass. T20b still awaits T20a; no env changes required.
## T13 — Lane 2 resume check, 2026-10-31

Pulled origin/main to 415cad7; T16 personalisation backend has landed, resolving that dependency. T13 remains blocked by T05/T06: `src/app/api/seller/` is absent, including insights and enrichment preview/apply/undo. The deployed seeded-DB seller demo and loop cannot be verified from this implementation. T07 watch support is also still required for Full Notify me. Per AGENTS.md, stopped without moving to another ticket; resume T13 full after the seller backend lands. No runtime files or env values changed; no processes started.

## T20b — dependency audit, Lane 2 full, 2026-10-31

T20a is not recorded as delivered at 415cad7. T02/T03 provide three profiles and Balanced explanation facts, but T20a acceptance is not fully established: the explainer prompt only optionally suggests comparing Saver/Premium, and pipeline tests do not cover the specified >=5-products-per-hero-category, 3M profile invariants or separate identical options. Ticket 20b explicitly lists T20a as a dependency. Per AGENTS.md, stopped before UI implementation; Lane 1 must complete/verify T20a, or the user must explicitly authorize decoupling T20b from that dependency. No source/test/env changes or running processes.

## Lane 2 polling update — 2026-10-31

Pulled T05 at 40ea2d1: seller insights now exists. Earlier notes about the missing insights route are superseded. T13 still awaits T06 enrichment preview/apply/undo; T20b still awaits T20a. Continuing the user-requested five-minute checks.

## T13 — Lane 2 continuation check at 40ea2d1

Resumed Lane 2 in full mode from the recorded T13 handoff. `git pull --rebase --autostash` reports already up to date and preserved existing local changes. T05 insights and T16 personalization are present, but T06 enrichment preview/apply/undo routes remain absent. T13 explicitly depends on T06, so the live seller fix → buyer exact-match loop cannot be verified. Per AGENTS.md, stopped before implementation or moving to another ticket. Lane 1 must deliver T06 before T13 can resume. No tests or servers started; no env/runtime files changed.

## T13 — resumed after T06/T07 at 76413a2

T06 and T07 have landed. All previously missing backend route dependencies for T13 are resolved; earlier blocked-check notes above are historical. Lane 2 is resuming the full live demo pass.

## Completion of requested T06 → T07 → T08 → T20a run

All four requested Lane 1/full tickets are implemented and verified in order. T20a preserves all three profiles through create/refine/adjust; its pipeline checks use at least five products per hero category. Lane 2 can resume T20b. Latest validation after merging Lane 2 T13: `npm test` 206 passed / 9 opt-in skipped, `npm run build` and lint succeed, real eval 13/13, production HTTP enrichment/watch/three-basket smoke passed. No active blocker for these tickets. Only migration 0004 was applied directly (no reset, no db:migrate or seed); catalog remains 359 products / 25 shops, demand 12,202 rows / 1,640 sessions. No env values changed; test server port 3198 is closed. Next work is outside this requested ticket list. The live smoke checks here used a local production build against the real DB/model.

## T13 — active Lane 2/full demo acceptance blocker, 2026-10-31

Production browser rehearsal after deployment recovery completed DEMO beats 1–4 (including seller Apply/reload → new buyer exact backpack with Updated badge → seller Undo), answer/refine/remove/reload/history isolation, puppy clarify/uncovered/live strip and Lan versus Guest. Live-strip age incorrectly showed59daysago; Lane2 fixed it in55c9b30 with red/green regression,207tests passed/9opt-in skipped,build/lint green.

Full judge-proofing fails the exact DEMO sentence `Grade 1, budget 200k`: the live production run returned Balanced `status: ok`,grandTotal185000,4lines (notebook35000,pencils25000,pencilcase45000,crayons55000,+shipping25000), and `Skipped for budget`: Grade1backpack,Waterbottle,Lunchbox,Uniformshirts. Expected per DEMO.md: `over_budget`,minimumcost,costdrivers,Fit suggestions while cart remains enabled. The frontend correctly reflects the server option; the runtime result treats enough school needs as optional to fit200k. Lane1 must reconcile Planner required-item decisions with this acceptance (or explicitly revise the acceptance with the product owner); Lane2 must not fabricate over-budget status or totals. Reproduce on https://kitly-arn-codex-hackathon.vercel.app/kit/new with the exact sentence and inspect `/api/threads/<id>` latest plan/options. The failure can depend on the model's plan. Per AGENTS.md stop on the backend blocker: T13 remains incomplete; express quick reply and swap-over-budget→Fit live checks are not claimed passed. No env/seed/schema changes; listing Undo completed and browser processes closed.
