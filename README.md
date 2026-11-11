# Court Builder

A local NBA 2K27 MyPLAYER build lab: hand-tune builds, or let the solver find optimized builds for the
badges and playstyle you want. Everything runs in the browser with bundled data.

## Run

Node 22.12+ (26 recommended) and pnpm.

    pnpm install
    pnpm dev          # http://localhost:5173
    pnpm test         # rules + HQ regression tests
    pnpm build        # production bundle in dist/

In IntelliJ IDEA, open the folder and use the `dev` / `test` npm scripts from the package.json gutter.

## Features

- **Builder** — position, height, weight and wingspan; attribute sliders with linked minimums, body caps and the
  99 Overall budget; per-attribute +1 Overall cost; Cap Breaker ladders; locks with **auto-fill** to 99; live
  build name; badges unlocked by tier and **badges within reach**; undo/redo (Ctrl+Z / Ctrl+Y); share links,
  text export and saving.
- **Build Lab** — pick badges (any tier), priorities (0–4 stars) and optional minimums, positions, a height range
  and Cap Breakers. The solver tries every legal body, meets the requirements with the fewest Overall points
  (choosing the cheapest OR-branch of each badge and spending breakers where they save the most), then fills to
  99 toward your priorities. Presets for common archetypes; results sortable and filterable.
- **Vibes** — describe a playstyle in plain words ("shoot, score inside with close shot, rebound, pass, speed,
  agility and perimeter defense") or click vibe chips (nice / good / elite). Typos are tolerated.
- **Find Similar** — keep a build's top strengths within a tolerance and find the closest rating profile on
  other bodies (taller, faster, longer…), with a match score.
- **Badges** — all 53 badges with official tier requirements, height ranges, your current tier, badge token
  costs, and the cheapest share of the Overall budget each tier needs on your body. One click sends a badge to
  the Lab.
- **Compare** — up to four builds side by side with best-in-row highlights and a badge tier matrix.
- **Caps** — heatmap of every cap at every height for a position and frame, plus weight and wingspan sweeps.
- **Saved** — library with rename, share links, JSON export/import.

## Accuracy and provenance

Rules come from NBA 2K HQ (the official companion app, `com.VisualConcepts.MyNBASherpa`) and are checked against
HQ's own MyPLAYER builder, which matches the game.

- **Caps** use 2K's formula `25 + 74 × height × weight × wingspan` multipliers (2K HQ research dataset). Every
  body read from the HQ builder so far matches all 21 caps.
- **Overall** uses the native weighted formula with per-archetype weights and rating scales (matches 256 mixed and
  75 uniform HQ vectors).
- **Linked minimums** are decoded directly from the tuning blob shipped in the HQ app
  (`tools/decode-links.mjs`). The named tuning export maps link rows one inch too tall and mislabels some targets;
  the decoded table fixes both and reproduces every clean HQ probe on all 21 ratings
  (`test/hq-link-probes.json`).
- **Badges** use the official tier requirements and height ranges (HQ native probe). Spot checks against NBA2KLab
  (Arc Cadence, Wall Up, Set and Fire) match exactly; HQ also covers tiers NBA2KLab has not published.
- **Cap Breakers** raise a rating toward its body cap but never past it; gains follow the decoded weights and
  replay all published HQ ladders.
- Build names use BASELINE's public naming catalog and are labelled as predictions.

Open questions: whether a linked minimum that would exceed a cap is clamped before or after it cascades (no
observation distinguishes them yet), and the purpose of the region of the tuning blob that changed since August.

## Research tooling

- `tools/hq/` drives the HQ builder on an Android emulator (adb taps, Windows OCR, glyph templates for the body
  wheels) to read caps and linked values: `run-links.mjs`, `analyze-links.mjs`, `derive-corrections.mjs`.
- `tools/decode-links.mjs` decodes the link table from the app's tuning asset.
- `tools/ui-check.mjs` exercises the UI in headless Chrome and saves screenshots.
- `research/` holds the HQ dataset snapshot and observations. APKs and third-party data are git-ignored.
