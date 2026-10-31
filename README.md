# Kitly

Tell Kitly your need, get the whole kit. Built during the hackathon with Codex.
The prepared product brief, contract, data specification and tickets are in [kit/](kit/).

## T00 scaffold

Next.js App Router, strict TypeScript, Tailwind, lucide-react, Zod contracts, fixtures,
in-memory CommerceAdapter/KitStore, one OpenAI Responses wrapper, store APIs and an unapplied SQL migration.
This is an API-ready skeleton; the buyer/seller screens and AI pipeline belong to later tickets.

Production: [Kitly on Vercel](https://kitly-arn-codex-hackathon.vercel.app) — memory adapter,
team `hmquannnnns-projects`, functions in Singapore (`sin1`).

Verified T00: `npm test` **34/34**, `npm run lint` clean, `npm run build` succeeds,
production HTTP smoke **12/12** locally and public deployed smoke **4/4**.

## Local setup

```sh
npm ci
# On a fresh checkout only: copy .env.example to .env.local and provide credentials if needed.
# Keep any existing .env/.env.local unchanged.
KITLY_ADAPTER=memory npm run dev
```

The existing env files are deliberately ignored by Git and Vercel uploads. The memory adapter needs no
API or database credentials. In-memory state is for local tests/demo only: it is not durable or shared
between Vercel instances. `KITLY_ADAPTER=supabase` intentionally throws until ticket 01.

```sh
npm test
npm run lint
npm run build
BASE_URL=http://localhost:3000 npm run e2e
```

Vitest runs server tests in Node and `tests/ui/**/*.test.{ts,tsx}` in jsdom with JSX support.
Playwright is configured for `e2e/` and `BASE_URL`; the demo e2e suite is a later ticket.
Install browsers with `npx playwright install chromium` when that suite is added.
`KITLY_BASIC_AUTH=user:pass` enables Basic Auth in middleware; Playwright uses the same credentials.

## Public seams for the next lanes

- Import types, Zod schemas, taxonomy and adapter/store interfaces from `@/contract`.
- `src/contract/fixtures/kit.sample.json`: hero SSE event array, three real trade-offs, closest backpack,
  Lan wallet saving, cart interest and follow-up. Clarify, answer, over-budget and thread fixtures sit beside it.
- `getAdapter()` from `@/server/commerce`; `getKitStore()` from `@/server/kits`.
- `structured`, `stream`, `getModels` and `FakeLLM` from `@/server/llm`. Zod schemas are passed to
  `structured`; model names and efforts come from `getModels()`. Streams yield raw text deltas and abort
  after 20 seconds without a delta. No real LLM calls are made by T00 routes or tests.
- `ownerFrom(request)` / `personaFrom(request)` from `@/server/identity`; middleware forwards a newly
  created owner cookie into the initial request as well as setting the response cookie.
- `today()` from `@/server/today` reads `DEMO_TODAY` (default `2026-09-02`).
- Routes: products list/detail, shops, categories, checkout and persona GET/POST.
  Checkout is a fake receipt: catalog prices + one shipping fee per shop, stock checked, no payment or
  stock mutation. Voucher optimization belongs to the optimizer ticket.

The contract is frozen after T00. Further changes must be Lane 1 commits titled `contract: …`.

## Database migration

`supabase/migrations/0001_init.sql` is a **psql variable template**, copied from DATA §6 and qualified
throughout with `:"KITLY_DB_SCHEMA"`. The future ticket 01 migration runner must pass the exact configured
schema as an identifier (`psql -v KITLY_DB_SCHEMA="$KITLY_DB_SCHEMA" ...`). This ticket does not execute SQL,
seed data, or change the supplied schema/database. Grants name only Kitly tables and their sequences;
no other application's tables are modified. RLS remains disabled per the demo specification.

## Verification record

See [CODEX_LOG.md](CODEX_LOG.md) for verified runs and [BLOCKERS.md](BLOCKERS.md) for unresolved dependencies.
