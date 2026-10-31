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
