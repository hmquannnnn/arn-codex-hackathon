# 16 — "The marketplace knows me": persona, wallet, cart cards, follow-up, answer turns (D39–D46, seam S10)

**Lane:** 1 · **Target:** after 09 · **Blocked by:** 03, 04, 09 (persona/vouchers/tables already exist from 00/01)

**What to build:** Kitly uses what the marketplace knows about the buyer (persona Lan, DATA.md §7) and keeps the
conversation going: wallet vouchers applied and labelled, 💛 cart cards, a follow-up question after every answer, and
chat turns that only answer without changing the kit. Contract: CONTRACT.md §1 (`Persona`, `Interest`, `SalesContext`,
`FollowUp`, `KitMessage`) and §3 (persona endpoints, `followup` event, refine intent).

## Lean
- [ ] `GET/POST /api/persona` (cookie `kitly_persona`, missing ⇒ `lan`; POST validates `lan|guest`).
- [ ] Pipeline, refine, adjust and price all use the **thread's** persona: `listVouchers(persona)` feeds the Optimizer
      (wallet savings come out labelled by ticket 02's logic), `getPersona` feeds the steps below.
- [ ] `findInterests(plan, option, candidatesByItem, persona, vouchers, today)` (pure, `src/server/kit/interests.ts`):
      CONTRACT `Interest` rules (same category as a plan item, in stock, arrives by deadline, not the chosen product;
      ignores mustHaveTags/maxUnitPrice, reports `missingTags` and `overMaxPriceBy`; best single voucher incl. wallet).
      Attached to every option as `interests`. `/api/kit/price` accepts an interest product in `picks` (ticket 09's 400
      rule extended).
- [ ] `buildSalesContext(plan, option, persona, vouchers, today)` (pure, `src/server/kit/sales-context.ts`): every field
      of CONTRACT `SalesContext`; `hooks` in the fixed priority order; Guest ⇒ no address/interests/wallet/favourite promos.
- [ ] `followUp(...)` (`src/server/kit/follow-up.ts`): fast model (`KITLY_FAST_EFFORT`), structured output
      `{ question, suggestions: { text, interestItemKey: string|null, swapProductId: string|null }[] }`; prompt: plan language, ONE question ending
      with "?", prefer the first hook when relevant, use ONLY facts from the JSON context, 2–3 short suggestions written as
      what the buyer would type. The prompt also gets the kit's line titles and its No-exact-match labels and says: the kit
      is already built — never offer to search for / find products, never repeat the buyer's request; a suggestion with
      `interestItemKey` must read as a switch ("Switch to …"/"Đổi sang …"). The prompt lists every basket line's
      **alternatives** (productId, title, price, and the code-computed kit total after the swap + "over budget by …")
      and says: `swapProductId` = an alternative's productId when the pill switches that line to it; never write a
      switch/upgrade pill without `swapProductId` or `interestItemKey`. When `daysLeft ≤ 2` "delivery is already express:
      do not offer express again". Started **in parallel** with the Explainer stream; sent as the `followup` event after
      the explanation, before `done`; saved on the version. **Guard** (code, CONTRACT §1): unknown number / voucher
      code / date, no "?", or 0 suggestions ⇒ the code template of the first hook (`source: "template"`). Allowed numbers include
      the plan's `budget` and every item's `maxUnitPrice` (the buyer's own numbers); an interest pill over 40 chars is
      shortened at a word boundary, never dropped. LLM error or
      > 8 s ⇒ template too. A suggestion with `interestItemKey` matching an interest, or `swapProductId` matching a line
      alternative, gets `action: { type: "swap", itemKey, productId }` from code. A pill starting with switch/swap/
      upgrade/change/replace/đổi/chuyển sang/thay that has no valid action is **dropped** (31/10: "Đổi hộp cơm sang
      loại xịn hơn" only resent its words to the planner, which cannot name a product, and the kit did not change);
      alternative prices and after-swap totals are allowed numbers, alternative titles are names.
      adjust/restore versions: `followUp: null`.
- [ ] Explainer prompt receives the SalesContext too ("you may mention the wallet saving or the cart product; only these numbers").
- [ ] **Answer turns (D42):** refine with planner `intent: "answer"` ⇒ the CONTRACT §3 answer stream; the answer is
      a fast-model stream (≤ 80 words, plan language) from the latest version's option, the facts (title, description,
      tags, price, rating, ship days) of the products the message names or of the whole basket, **the alternatives of
      the asked-about lines** (title, shop, price, rating, arrival, and the code-computed kit total after the swap +
      "over budget by …"; rule: name them when asked for a better/cheaper/other product, say "none" only when none are
      listed — 31/10 the model said "no fancier lunch box" while the panel listed one), and the SalesContext;
      then `followUp`; `appendMessage` before `done`. No new version, no `recordIntent`, no demand items.
      `GET /api/threads/:id` returns `messages`.
- [ ] S10 tests (InMemoryAdapter + InMemoryKitStore + FakeLLM, hero fixture, `DEMO_TODAY=2026-09-02`):
  - Lan: Balanced option has a `wallet: true` saving from `LAN-BTS10`; Guest on the same plan has none and a higher `grandTotal`.
  - Lan: `interests` has `prod-kidzone-lite-backpack` for the backpack item with `walletVoucherCode "LAN-KZ80"`,
    `priceAfterVoucher 440000`, `overMaxPriceBy 40000`, `missingTags ["anti-hunchback"]`, and it is never in `lines`. Guest: no interests.
  - SalesContext hooks for the hero kit (Lan) start `["deadline_soon","cart_interest","voucher_expiring", …]`, `daysLeft 3`.
  - Guard: FakeLLM follow-up citing "399.000₫" (not in context) ⇒ template, `source "template"`; citing "440.000₫" and
    `LAN-KZ80` ⇒ kept, `source "llm"`; a suggestion with `interestItemKey: "backpack"` gets the swap action.
  - Guard (rehearsal 31/10): "…balo chống gù dưới 400.000₫…" / "dưới 400k" ⇒ kept (`llm`, the buyer's maxUnitPrice), "350k"
    ⇒ template; the pill "Switch to KidZone Lite Backpack Grade 1–3" (41 chars) ⇒ kept, shortened to ≤ 40 with its swap.
  - SalesContext: deadline 2026-09-04 (express) ⇒ `daysLeft 2`, no `deadline_soon` hook; the follow-up prompt says
    "already express"; the prompt contains the kit's line titles and No-exact-match labels.
  - FakeLLM follow-up throws ⇒ stream still ends `followup` (template) → `done`; event order otherwise unchanged.
  - `/api/kit/price` with the interest product as a pick ⇒ 200 and the KidZone voucher applied.
  - Refine with FakeLLM `intent: "answer"` ⇒ events `step, explanation…, followup, done{answered:true}`; thread still
    has 1 version and 1 message; demand rows and intent sessions unchanged.

## Full (in addition)
- [ ] Test: follow-up + explainer run concurrently (FakeLLM with delays: total ≈ max, not sum).
- [ ] Test: the template follow-up is Vietnamese for a `vi` plan and English for `en`, for every hook kind.
- [ ] Timing log includes `followup <s> (llm|template)`.
