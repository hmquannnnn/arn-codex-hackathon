# Blockers

None active. The T01 URL blocker was resolved on 2026-10-31: Huy explicitly authorized adding `https://` to the existing local Supabase API hostname. The project/database and `KITLY_DB_SCHEMA=public` were kept unchanged. Supabase API and Postgres connections verified.

T00's earlier GitHub push blocker remains resolved.

## T11 live integration dependency

Lane 2 previously reported a URL without an HTTP(S) scheme on its checkout. On this Lane 1 checkout, Huy authorized the HTTPS prefix fix and the API, shared Supabase tests, seed, and deployed catalog now work. No active URL blocker here; another checkout may still need its local env updated. T10 previously passed 39 Vitest and 2 Playwright tests on the T00 memory baseline.

## Verification note outside Lane 1

`npm test` (125 passed), `npm run lint`, and `npm run build` pass after T04. A separate `npx tsc --noEmit` still reports fixture typing errors in `tests/ui/store.test.tsx` from T10: imported JSON attributes infer optional `undefined` entries incompatible with `Record<string, string>`. This is outside the requested Lane 1 tickets; the UI test file was not edited. Its fixtures should be parsed through the existing contract schemas by Lane 2. No blocker remains for the requested runtime/test/build gates.
T11 can be developed and verified in the explicitly supported fixture replay mode (`NEXT_PUBLIC_KITLY_MOCK=1`). Current HEAD has no `/api/kit`, `/api/kit/refine`, `/api/threads`, `/api/kit/adjust`, or `/api/kit/price` routes yet. Live new/refine/history/budget/restore/swap verification awaits Lane 1 T03/T04/T09. The local Supabase URL issue is resolved: the complete integration suite now passes. No env files were changed.

## T11 push authentication

T11 is rebased onto T02 and committed locally. Agent-side `git push` fails because HTTPS GitHub credentials are unavailable in its process (`could not read Username`). Run `git push` in the authenticated user terminal. No force push is required.
