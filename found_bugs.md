# Found bugs — manual demo walk on the deployed URL (31/10, ~13:45)

Walked `kit/DEMO.md` Beats 1–4 + tiny-budget judge check on https://kitly-arn-codex-hackathon.vercel.app
(1440×900, persona Lan). Everything in the demo WORKS end to end; the items below are bugs/polish.
Rules: read AGENTS.md first. Root cause first, failing test first, one commit per fix (`fix: …`),
`npm test` + `npm run build` green, `git pull --rebase && git push`. **Do not run `db:migrate`.** Do not stop to ask.
When a bug is fixed, change its line `Status: open` to `Status: fixed in <commit>`.

## Lane 1 (backend / AI / data)

### B1 — Explanation cut mid-sentence
- Repro: Beat 2, type `School gives the uniform, cut the budget to 1M.` → Version 2 explanation ends "…Saver is 490,700
  lower than Balanced, including changes to notebooks; Premium is " (sentence cut).
- Cause (likely): the ≤70-word cap added in T20a truncates the stream by word count.
- Expected: never cut mid-sentence — end at the last complete sentence within the cap, or have the model write ≤70 words.
- Status: open

### B2 — Listing enrichment preview is weak (Beat 3 step 5)
- Repro: Seller Centre → Minh An Stationery → listing gap "Anti-hunchback backpack" → Preview fix.
- Actual: After title == Before title ("Minh An Kids Backpack New Model 2026", no suffix); Added tags only
  `anti-hunchback`; Kept tags only `kids`; Appended description empty; Added attributes empty.
- Expected (kit/DEMO.md Beat 3.5, ticket 06): title = original title + suffix; added tags include `anti-hunchback` and
  usually `lightweight`, `waterproof`, `grade-1` when supported by the product's description/attributes (never invent
  unsupported tags); a short appended description backed by the evidence quote.
- Status: open

### B3 — "Needed with" shows 100% for every category on every card
- Repro: Seller Centre, any gap card → "Needed with Notebooks · 100%, Pencil case · 100%, Pencils pens · 100%,
  Water bottle · 100%" (same on the raincoat and desk-lamp cards).
- Expected: real co-occurrence share per kit/DATA.md / ticket 05 (share of sessions with this need that also asked for
  the other category). All-100% looks fake to judges. Check the maths and the seed data.
- Status: open

### B4 — Raw plan labels leak into UI text
- Repro: new kit `Grade 1, budget 200k` → Fit suggestion reads "Drop Required — Grade 1 backpack, Required — school
  uniform shirts (rotation): 85.000₫"; "Skipped for budget" lists "Useful extra — pencil case", "Optional — school shoes".
- Expected: plain need labels ("Grade 1 backpack", "Pencil case"). Find where the priority prefix is baked into the label
  (planner output vs formatter) and fix at the source.
- Status: open

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
- Status: open

## Lane 2 (frontend)

### F1 — Chat does not auto-scroll to the newest turn (most visible in the demo)
- Repro: send any message (question or refine) → the new user bubble + Kitly answer appear below the fold; after F5 the
  chat opens at the top, not at the latest turn.
- Expected: keep the conversation pinned to the bottom while streaming and after sending/reload, unless the user has
  scrolled up manually.
- Status: open

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

## Not bugs — notes for the demo (Lane 3)
- **Re-seed before the demo** (`npm run seed` only, no migrate): live counts are polluted by testing — listing gap shows
  76 this week (script expects 38), band 350–400k (script 300–400k), live strip is a wall of duplicate rows.
- Text differs from DEMO.md: "No exact match: no anti-hunchback backpack under 400.000₫" (script says "400k"); seller
  button is "Apply enrichment" (script says "Apply"). Say it as shown.
- The local "⚙ Switched …" line disappears after F5 (swap itself is saved) — don't reload right after a pill swap.
- `KITLY_SERVICE_TIER` must be exactly `fast` (no trailing space) or every AI call fails.
- After any rehearsal: Seller → Undo the listing fix.
