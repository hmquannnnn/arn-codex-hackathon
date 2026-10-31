# 01 — Seed: catalog, vouchers, demand history (Supabase)

**Lane:** 1 · **Target:** 10:35–11:30 · **Blocked by:** 00

**What to build:** `npm run seed` fills Supabase with the DATA.md world (25 shops, ~360 products, 8 public + 2 wallet
vouchers, persona Lan, ~1,500 demand sessions) including every planted fact, and the Supabase adapter serves it. Store pages on the
deployed app now show the real catalog.

## Lean
- [ ] All tables live in schema `KITLY_DB_SCHEMA` (default `public`), see AGENTS.md.
- [ ] `npm run db:migrate` applies `supabase/migrations/*.sql` via `pg` + `SUPABASE_DB_URL` (idempotent: `drop table if exists` **only the Kitly tables listed in DATA.md §6**, then create. NEVER drop/reset a schema or touch any other table — the database may be shared).
- [ ] `SupabaseAdapter` implementing every `CommerceAdapter` method (incl. `searchProducts({ categories })` as ONE query, `recentDemandItems` joined to `intent_sessions.source = 'live'`, `getPersona` from `personas`, `listVouchers(persona)` filtering `owner_persona`); `SupabaseKitStore` on `kit_threads`/`kit_versions`/`kit_messages`; `KITLY_ADAPTER=supabase` on Vercel.
- [ ] Catalog generator: fast model, one call per category with a JSON schema (titles, descriptions with concrete specs, tags only from the canonical list; 2 budget / 2 mid / 2 premium products, DATA.md §3); runs categories in parallel (max 8 concurrent); caches raw output to `scripts/.cache/` (gitignored) so re-runs are free.
- [ ] **Depth rule** in code after generation (DATA.md §3, D45: ≥ 5 in-stock products with `shipDaysMax ≤ 3`, price spread ≥ 2.5× among them, one of them in the top third rated ≥ 4.8 or mall); plants code-written fill products (or shortens `shipDaysMax`) when a check fails. **Express rule** (DATA.md §4): the best-rated AND the cheapest in-stock product of every LLM category ship in ≤ 2 days. Test: the rule holds for every LLM category of the seeded catalog (memory run on a small generated sample + Supabase run when configured).
- [ ] Code then **overwrites/inserts planted products** (DATA.md §4, incl. `prod-kidzone-lite-backpack` and the new ship days) and enforces shop assignments (DATA.md §2); inserts persona `lan` + its 2 wallet vouchers exactly as DATA.md §7 (dates relative to `DEMO_TODAY`).
- [ ] Demand history generator in pure code (DATA.md §5) with exact forced counts; `matchedCount` computed by a simple category+tags count (ticket 03's Matcher can replace it later).
- [ ] Seed is idempotent (truncate only Kitly tables + reload) and prints a summary (counts per table, forced-gap counts). `db:migrate` and `seed` print the target schema and `DEMO_TODAY` on their FIRST line (`seed: schema kitly_x, DEMO_TODAY 2026-09-02`) so a wrong database is seen before anything is dropped.
- [ ] Test (memory, no LLM): demand generator produces the forced this-week/last-week counts exactly and the combo share ≥ 60%; the budget-hint p25 and p75 of each forced need equal the DATA.md §5 band EXACTLY (check both array neighbours of the percentile position, also with one extra hint at p75 appended) — no tolerance.

## Full (in addition)
- [ ] Test: SupabaseAdapter contract test suite shared with InMemoryAdapter (same tests run against both when `SUPABASE_URL` is set; skipped otherwise).
- [ ] Test: express rule — in every LLM category the cheapest in-stock product has `shipDaysMax ≤ 2`; the hero sentence with deadline 2026-09-04 (express, D44) gives a Balanced basket ≤ 1.500.000₫ (rehearsal 31/10: 3.555.000₫ before the rule).
- [ ] Test: planted facts present after seed (hero backpack tags, exactly one `anti-hunchback` backpack, zero `backpack-cover`, zero `anti-blue-light`, persona `lan` cart = `prod-kidzone-lite-backpack`, `LAN-BTS10` valid until DEMO_TODAY + 2).
