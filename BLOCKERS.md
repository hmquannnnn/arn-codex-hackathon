# Blockers

## T01 — Supabase URL configuration (2026-10-31)

Lane 1, mode full. T01 is blocked; T02, T03 and T04 have not started.

- The existing `SUPABASE_URL` loaded from `.env.local` is a bare hostname, without an HTTP/HTTPS scheme. No credential value is reproduced here.
- Reproduction: load the existing environment with `@next/env`, then call `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { db: { schema: KITLY_DB_SCHEMA } })`.
- Actual SDK error: `Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.` This happens before any network request, so the SupabaseAdapter contract suite and real-catalog verification cannot run.
- Independent read-only check: `SUPABASE_DB_URL` connects successfully; the configured `public` schema currently has no tables. No migration or seed was executed.
- Required action: the environment owner must supply the project's complete HTTP(S) Supabase API URL, including its scheme. Keep the same project/database and `KITLY_DB_SCHEMA=public`.
- Per AGENTS.md, `.env` / `.env.local` were not edited; no URL fallback or schema/database substitution was added. Incomplete implementation changes were removed to leave the verified T00 baseline.
- Verification after cleanup: `npm test` — 34/34 passed (6 files); `npm run build` — exit 0.
- Resume at T01, then T02 → T03 → T04, with test-first implementation at the ticket's pre-approved seams.

T00's earlier GitHub push blocker remains resolved.
