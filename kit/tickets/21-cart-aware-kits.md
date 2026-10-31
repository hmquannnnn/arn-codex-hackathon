# T21 — Cart-aware school kits

Lane: 1 + 2 (explicit user authorization, 2026-10-31). Mode: full.
Sources: CART_FLOW_TASK.md, SCORING.md. Existing scoring/profile objectives remain the baseline.

## Lean

- New kits receive a browser-cart snapshot (IDs and quantities only), with catalog+cart or cart-only sourcing.
- Cart-only candidates, closest choices, swaps, budget fits and refinements never escape that snapshot or its quantities.
- Hard tags, stock, delivery and unit-price constraints precede a small cart preference. No cart bonus in cart-only mode.
- Buyer can keep a cart product; conflicts become explicit missing choices rather than silently relaxing requirements.
- Persist source/snapshot/keeps in plan JSON, surviving reload, refinement and direct edits without process state.
- Recommendations do not mutate the cart. Confirmation merges without duplicate quantities and preserves unrelated products.
- Selected-only checkout leaves unselected products and remaining quantities in the cart; server reprices shipping/vouchers.
- English controls, honest missing/over-budget states, current data from CommerceAdapter only.

## Full

- Test-first matcher/optimizer, pipeline/refine/edit and checkout seams with InMemoryAdapter and FakeLLM only.
- UI tests for cart snapshot controls, merge, selection and remaining quantities; browser flow where practical.
- npm test and production build pass before commits; document validation and limitations.

## Implementation decisions

- Cart preference is +0.02 after eligibility, capped at 1; cart-only quality is unchanged.
- Keep is an explicit UI control by product ID; changing requirements never overrides hard eligibility.
- Scope cannot be widened by the model; start a new kit to use a different source/snapshot.
- Demo checkout creates a receipt only, preserving existing no-payment behavior.

## Verification — completed 2026-10-31

- `npm test -- --maxWorkers=2`: 261 passed, 10 existing opt-in tests skipped (19 new tests).
- `npm run build`: production compilation, lint and TypeScript checks passed.
- `npm run eval`: 13/13 real-model cases passed.
- Production Playwright rehearsal: 3/3 passed against local memory adapter, including a real-model cart-only kit,
  spoken keep, reload, confirmation without duplicate quantities, selected-only checkout and leftovers.
- No schema migration, seed, environment-file edit or external database reset. Test server stopped; port 3211 free.
- Existing scoring objectives retained; same-shop alternatives are available for cart-aware requests.

## Approved follow-up — dedicated cart flow

User approved the diagnostic plan: dedicated `/cart/kit/new` and `/cart/kit/t/:id` screens;
fixed cart-only sourcing, cart-focused introduction/review; `Use selected items` applies purchase quantities
without changing saved cart lines. Catalog search retains `Add kit to cart` and merges missing products.
Legacy cart-only entry and history links resolve to the dedicated flow. Cancel leaves cart/selection unchanged.
Show a confirmation on return, guard against changed/missing saved quantities, and test both flows end to end.

### Follow-up verification — completed

- Dedicated cart routes and fixed-source introduction; purchase rows, alternatives, saved leftovers and missing needs.
- Cart-only confirmation does not write cart contents. It validates current local storage against snapshot quantities,
  including changes from another tab, before saving the purchase selection and returning with a confirmation notice.
- Generic discovery retains add/merge semantics. Legacy entry and wrong-experience thread links redirect by persisted source.
- `npm test -- --maxWorkers=2`: 265 passed, 10 opt-in skipped. Production build passed; real-model eval 13/13.
- Six production Playwright cases passed with memory adapter + real model: desktop entry/cancel, mobile handoff/empty cart,
  catalog add, selected checkout, empty-selection reload, and cart kit creation/swap/budget/history/reload/stale guard/leftovers.
- Live catalog verification now allows the nine valid products explicitly requested in Lan's saved cart; the offline seed
  generator test still verifies the exact initial seed. No reset, seed, schema change or environment-file edit.
