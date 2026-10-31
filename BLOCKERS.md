# Blockers

None active. The T01 URL blocker was resolved on 2026-10-31: Huy explicitly authorized adding `https://` to the existing local Supabase API hostname. The project/database and `KITLY_DB_SCHEMA=public` were kept unchanged. Supabase API and Postgres connections verified.

T00's earlier GitHub push blocker remains resolved.

## T11 live integration dependency

Lane 2 previously reported a URL without an HTTP(S) scheme on its checkout. On this Lane 1 checkout, Huy authorized the HTTPS prefix fix and the API, shared Supabase tests, seed, and deployed catalog now work. No active URL blocker here; another checkout may still need its local env updated. T10 previously passed 39 Vitest and 2 Playwright tests on the T00 memory baseline.
T11 can be developed and verified in the explicitly supported fixture replay mode (`NEXT_PUBLIC_KITLY_MOCK=1`). T03/T04 now supply `/api/kit` and `/api/kit/refine`. History/budget/restore/swap verification still awaits Lane 1 T09 (`/api/threads`, `/api/kit/adjust`, `/api/kit/price`). The local Supabase URL issue is resolved; no env files were changed.

## Verification note outside Lane 1

`npm test` (125 passed), `npm run lint`, and `npm run build` pass after T04. A separate `npx tsc --noEmit` still reports fixture typing errors in `tests/ui/store.test.tsx` from T10: imported JSON attributes infer optional `undefined` entries incompatible with `Record<string, string>`. This is outside the requested Lane 1 tickets; the UI test file was not edited. Its fixtures should be parsed through the existing contract schemas by Lane 2. No blocker remains for the requested runtime/test/build gates.


## T15 live integration dependency

T15 frontend edits are implemented and verified with fixture-backed API responses: remove/undo, closest Add anyway, Fit/Undo, inline edits, selection reload and request/error locking. Live verification awaits T09 adjust/price/history endpoints. Fixture replay does not simulate arbitrary optimizer responses; unsupported edits fail explicitly and leave the kit unchanged. No new env values or dependencies are needed.

## T17 live integration dependency

T17 persona/interest/wallet/follow-up/answer UI passes fixture tests and browser flows. Full live verification awaits T09 price/history and T16 interest/follow-up/answer support. GitHub credential helper is configured and Lane 2 can push. No new env values are needed.
