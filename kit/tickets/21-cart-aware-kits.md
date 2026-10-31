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
