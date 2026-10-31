# Found bugs — manual demo walk on the deployed URL (31/10, ~13:45)

Walked `kit/DEMO.md` Beats 1–4 + tiny-budget judge check on https://kitly-arn-codex-hackathon.vercel.app
(1440×900, persona Lan). The main buyer → seller → buyer loop works; the audit below also found failures in rapid persona switching and combined edits.
Rules: read AGENTS.md first. Root cause first, failing test first, one commit per fix (`fix: …`),
`npm test` + `npm run build` green, `git pull --rebase && git push`. **Do not run `db:migrate`.** Do not stop to ask.
When a bug is fixed, change its line `Status: open` to `Status: fixed in <commit>`.

## Lane 1 (backend / AI / data)

### B1 — Explanation cut mid-sentence
- Repro: Beat 2, type `School gives the uniform, cut the budget to 1M.` → Version 2 explanation ends "…Saver is 490,700
  lower than Balanced, including changes to notebooks; Premium is " (sentence cut).
- Cause (likely): the ≤70-word cap added in T20a truncates the stream by word count.
- Expected: never cut mid-sentence — end at the last complete sentence within the cap, or have the model write ≤70 words.
- Status: fixed in 0fb2926

### B2 — Listing enrichment preview is weak (Beat 3 step 5)
- Repro: Seller Centre → Minh An Stationery → listing gap "Anti-hunchback backpack" → Preview fix.
- Actual: After title == Before title ("Minh An Kids Backpack New Model 2026", no suffix); Added tags only
  `anti-hunchback`; Kept tags only `kids`; Appended description empty; Added attributes empty.
- Expected (kit/DEMO.md Beat 3.5, ticket 06): title = original title + suffix; added tags include `anti-hunchback` and
  usually `lightweight`, `waterproof`, `grade-1` when supported by the product's description/attributes (never invent
  unsupported tags); a short appended description backed by the evidence quote.
- Status: fixed in be5d42c

### B3 — "Needed with" shows 100% for every category on every card
- Repro: Seller Centre, any gap card → "Needed with Notebooks · 100%, Pencil case · 100%, Pencils pens · 100%,
  Water bottle · 100%" (same on the raincoat and desk-lamp cards).
- Expected: real co-occurrence share per kit/DATA.md / ticket 05 (share of sessions with this need that also asked for
  the other category). All-100% looks fake to judges. Check the maths and the seed data.
- Status: fixed in a0cdca5

### B4 — Raw plan labels leak into UI text
- Repro: new kit `Grade 1, budget 200k` → Fit suggestion reads "Drop Required — Grade 1 backpack, Required — school
  uniform shirts (rotation): 85.000₫"; "Skipped for budget" lists "Useful extra — pencil case", "Optional — school shoes".
- Expected: plain need labels ("Grade 1 backpack", "Pencil case"). Find where the priority prefix is baked into the label
  (planner output vs formatter) and fix at the source.
- Status: fixed in c629ea0

### B5 — Balanced weight is fixed → Balanced can sit next to / merge with Premium (low priority, check first)
- Seen: Beat 4 run: Saver 916.900 · Balanced 1.426.000 · Premium 1.476.000 (Balanced ≈ Premium).
- Code: `src/server/optimizer/index.ts:20` uses a fixed λ (0.5 per 1M ₫); the rehearsal app tuned λ between the Saver and
  Premium totals so Balanced lands in between. If two profiles become identical, tabs merge and Beat 1.10
  ("three real trade-offs") breaks.
- Only change if a quick test shows Balanced == Premium/Saver on the hero sentence; otherwise leave it.
- Status: open

### B6 — After-swap totals in answers can drop a line (low priority)
- Code: `src/server/kit/alternatives.ts:17-25` — a line whose product is not in `related` is skipped in the recount, so the
  "after swap" total comes out too low. Recompute from the full selection.
- Status: fixed in e8f7130

### B7 — First budget supplied through chat never records demand (P2, confirmed)
- Repro: start a need without a budget; when Kitly asks for it, type `My budget is 1.5M` in the composer instead of
  clicking a budget choice. The thread becomes ready and shows options, but Seller Intelligence receives no demand.
- Root cause: `src/server/refine.ts:125` always passes `recordDemand: false`, including the first ready run after
  `awaiting_budget`. Later adjust calls cannot recover it because a ready version already exists.
- Evidence: public `runKit` → `runRefine` with InMemoryAdapter/InMemoryKitStore/FakeLLM produced
  `statuses: [awaiting_budget, ready]`, 10 plan items, and `demandAdded: 0`.
- Expected: record demand exactly once on the first ready run, regardless of whether the buyer supplies the budget
  through a quick choice or the composer (CONTRACT §3 once-per-thread invariant). Subsequent refines add no demand.
- Regression seam: S2/S6 pipeline or HTTP handlers; cover both budget-entry paths and later edits without double counting.
- Status: fixed in 4b851a6

### B8 — Adjust/restore discards saved swaps, Add anyway and Fit selections (P2, confirmed live)
- Repro on Vercel: run the hero query → Add anyway on the closest Minh An backpack → remove the water bottle.
  Version 2 loses the backpack and shows Add anyway again, although the buyer only removed the bottle.
- Root cause: `src/server/kit/edits.ts:99–109` optimizes from the plan without `latest.selection`, then appends
  `selection: null` at line 163. `restore_version` also ignores the historical selection.
- Related history path: `src/components/kit/use-kit-controller.ts:215–220` rehydrates only the latest version's selection;
  after reload, an older selected version shows its original option snapshot instead of its saved swaps/drops.
- Expected: unrelated edits retain still-valid buyer choices; viewing/restoring a version reproduces its saved basket
  (PRD version/history promises and ticket 15 edit persistence). Explicitly handle choices invalidated by a changed constraint.
- Regression seams: S6/S9 handlers plus the history UI. Cover Add anyway/swap/Fit → unrelated remove or budget edit,
  and reload → view/restore an older version containing a selection.
- Status: fixed in c740238

### B9 — Over-budget swap labels the current total as "Minimum cost" (P2, confirmed)
- Repro with the public pricing seam and fixtures: budget 1,000,000₫, expensive selection totals 1,210,000₫; the same
  response offers Fit for 910,000₫, but the warning labels 1,210,000₫ as the minimum.
- Root cause: `src/server/optimizer/selection.ts:65–67` adds `overBy`/`fit` without `minimumCost` or `costDrivers`;
  `src/components/kit/budget-warning.tsx:25` falls back to `grandTotal` and calls it "Minimum cost".
- Expected: show a correctly computed minimum and meaningful drivers, or avoid calling the selected total a minimum.
  Ticket 11 requires the over-budget warning's minimum cost and drivers.
- Regression seams: S9 pricing plus BudgetWarning UI; assert the meaning of the minimum, not just total/Fit arithmetic.
- Status: fixed in 8440bbe

## Lane 2 (frontend)

### F1 — Chat does not auto-scroll to the newest turn (most visible in the demo)
- Repro: send any message (question or refine) → the new user bubble + Kitly answer appear below the fold; after F5 the
  chat opens at the top, not at the latest turn.
- Expected: keep the conversation pinned to the bottom while streaming and after sending/reload, unless the user has
  scrolled up manually.
- Status: fixed in e5038b9

### F2 — Empty sections in the seller preview drawer
- Repro: Preview fix drawer shows "Added attributes" with nothing under it and "Appended description" as an empty green bar.
- Expected: hide a section when it is empty.
- Status: open

### F3 — Swap pill on a non-saved profile tab changes Balanced (low priority)
- Code: `use-kit-controller.ts:384-387` — a follow-up swap applies to the saved profile, else Balanced. If the user is on
  the Premium tab with no saved selection, the pill swaps Balanced instead of the visible tab. Apply to the visible tab.
- Status: open

### F4 — History sidebar version count lags (cosmetic)
- Repro: after a refine the sidebar still says "Today · 1 versions" until reload; also "1 versions" → "1 version".
- Status: open

### F5 — Switching to Guest and immediately sending can create a Lan kit (P2, confirmed live)
- Repro: on `/kit/new`, switch Lan → Guest and immediately send the hero query. The header becomes Guest, but the
  new kit can still show Lan's cart interest, wallet saving and Cau Giay delivery address.
- Root cause: `src/components/persona-chip.tsx:64–75` keeps the pending persona request local to the chip;
  `src/components/kit/screen.tsx` leaves the composer enabled. `/api/kit` can start with the old Lan cookie before
  `/api/persona` returns its new cookie, and the thread permanently stores Lan as its persona.
- Evidence: live `e2e/demo-loop.spec.ts:339–347` failed on the Guest cart-card assertion; screenshot also showed
  the Guest header with Lan address/wallet. The retry passed, confirming timing-sensitive behavior.
- Expected: a new kit submitted after choosing Guest uses Guest consistently. Coordinate persona changes with kit
  submission; merely adding a wait to the E2E test would hide the user-facing race (tickets 16/17, D43).
- Regression seam: persona switch + new-kit submission with a deliberately held persona response, then live E2E.
- Status: open

## Not bugs — notes for the demo (Lane 3)
- **Re-seed before the demo** (`npm run seed` only, no migrate): live counts are polluted by testing — listing gap shows
  76 this week (script expects 38), band 350–400k (script 300–400k), live strip is a wall of duplicate rows.
- Text differs from DEMO.md: "No exact match: no anti-hunchback backpack under 400.000₫" (script says "400k"); seller
  button is "Apply enrichment" (script says "Apply"). Say it as shown.
- The local "⚙ Switched …" line disappears after F5 (swap itself is saved) — don't reload right after a pill swap.
- `KITLY_SERVICE_TIER` must be exactly `fast` (no trailing space) or every AI call fails.
- After any rehearsal: Seller → Undo the listing fix.

## Audit handoff — 31/10, ~13:49
- Added confirmed P2 findings B7–B9 and F5; no production code was changed in the audit. Suggested first fixes: F5 and B8.
- Main code review baseline: `ea37733`; concurrent catalog/docs commits advanced HEAD to `879ea9b` during the audit.
- Verification on `879ea9b`: `npm test` 218 passed / 10 skipped; `npm run build` passed. Earlier lint and standalone
  type-check passed; real-model `npm run eval` passed 13/13.
- Live run: `BASE_URL=https://kitly-arn-codex-hackathon.vercel.app KITLY_E2E_LIVE=1 npm run e2e -- --workers=1`
  → 5 passed / 1 flaky (Guest race; passed retry) / 5 fixture-only skipped. First hero basket: 6,224 ms.
- Additional mobile puppy check: missing-budget clarification → quick budget choice → 9 uncovered needs, no profile
  tabs, no horizontal overflow at 390 px. B8 was reproduced separately through the deployed UI.
- An initial seed-invariant test failed while the shared listing was enriched; the later clean-state suite passed.
  Serialize live Apply/Undo checks and seed-invariant reads to avoid testing transient shared data as the baseline.
- Cleanup verified: Minh An listing restored (original title, tags `["kids"]`, no update badge), persona Lan, browser
  closed, no dev servers started, repository clean. Live rehearsals added real demand; no reseed/migrate/env edits.
