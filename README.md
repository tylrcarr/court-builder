# Court Builder

A local NBA 2K27 MyPLAYER build lab: hand-tune builds, or let the badge-first optimizer find builds for the
badges and playstyle you want. Everything runs in the browser with bundled data.

## Run

Node 22.12+ (26 recommended) and pnpm.

    pnpm install
    pnpm dev          # http://localhost:5173
    pnpm test         # rules, optimizer and HQ regression tests
    pnpm build        # production bundle in dist/

In IntelliJ IDEA, open the folder and run the `dev` / `test` scripts from package.json. IDE settings (`.idea/`)
are machine-specific and not committed.

## How the optimizer thinks

Most of a good build's Overall budget should sit exactly on badge breakpoints: a rating one point above the last
tier it unlocks buys nothing. The Lab optimizes **badge-first**:

1. **Musts** — badge tiers every result must reach (bodies that can't are skipped).
2. **Badge value** — every other badge has an importance (Don't care → Core) and an optional "up to" tier cap;
   badges left on Auto are weighted by a meta tier list (`src/meta.js`, a documented judgement call).
3. **Feel attributes** — ratings worth raising for their own sake (ball handle, speed, agility by default) get
   whatever budget is left.

Cap Breakers are planned per archetype: breaker gains depend on the build's player type, so the solver can push a
build into a different archetype when that makes breakers elsewhere go further. If the plan from the build's natural
archetype doesn't fit under 99, every archetype is tried, with each breaker chosen by what it takes off the real
Overall (so it can lower a rating the leading archetype weighs heavily and let a better one take over). Every result is
filled to 99 Overall, as the game requires.

## Features

- **Build Lab**
  - Role presets (inside big, stretch big, lockdown, generalist wing, slasher, scorer, playmaker, point guard).
  - Mode (5v5 / 3v3 / both) and meta strength.
  - Positions, a height range and Cap Breakers (have now / expect later) plus a specialization.
  - Per-badge musts, importance and tier caps; animation unlocks (contact dunks, alley-oops) as goals.
  - Per-attribute feel, minimums and maximums.
  - Results show badges, meta score and breakers. Variations (faster, more playmaking, better defense, no
    dunking…) keep results from all being the same build.
  - "What's blocking it" explains searches with no results. Searches can be saved.
- **Builder**
  - Body controls, attribute sliders with linked minimums, body caps and the 99 Overall budget, and Cap Breaker
    ladders.
  - Locks, auto-fill, undo/redo (Ctrl+Z / Ctrl+Y).
  - **Breakpoints** panel with **Trim dead points**: lowers ratings to their last breakpoint and reinvests the
    budget in feel attributes.
  - **Within reach** badges with one-click unlock (trades budget without losing a badge), **Maximize** badges,
    trade-offs and options for this body, and nearby bodies.
  - **Cap Breakers** section laid out like the in-game screen: base → final against the cap, with each ladder.
  - **Badge preview** by discipline with token costs and planned **Synergy** (Fuse / Reaction, +1 / +2 up to
    Legend). You set how many Synergy slots you have, since they're earned over a season.
  - **Takeovers**: which of the 18 attribute-gated abilities this build unlocks, per slot, and how far the rest are.
  - **Animations**: all 2,535 gated animations from HQ's glossary (jumpshots, pull-ups, layup styles, dunk packages,
    dribble moves…) for this height's size family: unlocked counts per group, the closest locked ones, and search.
    "Lab" adds the ratings an animation or takeover needs to the Lab's minimums.
  - Live build name, share links, text export, full-build screenshot, save.
  - **Find exact**: a new Lab search with every rating of the build as a minimum, on its body with its breaker
    count, to check the Lab can find it.
- **Reference** — all 53 badges with official tier requirements, height ranges, token costs and the cheapest share
  of the Overall budget each tier needs on your body; plus a caps heatmap for every height with weight and
  wingspan sweeps.
- **Compare** — up to four builds side by side, best-in-row highlights, badge tier matrix.
- **Saved** — library with rename, share links, JSON export/import.

## Accuracy and provenance

Rules come from NBA 2K HQ (the official companion app) and are checked against HQ's own MyPLAYER builder, which
matches the game.

- **Caps** use 2K's formula `25 + 74 × height × weight × wingspan` multipliers. Every body read from the HQ
  builder so far matches all 21 caps.
- **Overall** uses the native per-archetype weighted formula (matches 256 mixed and 75 uniform HQ vectors).
- **Linked minimums** are decoded directly from the tuning blob in the HQ app (`tools/decode-links.mjs`). The
  named tuning export maps link rows one inch too tall and mislabels some targets; the decoded table fixes both
  and reproduces every clean HQ probe on all 21 ratings (`test/hq-link-probes.json`).
- **Badges** use the official tier requirements and height ranges; spot checks against NBA2KLab match exactly.
  Animation requirements come from NBA2KLab's 2K27 contact dunk / alley-oop table.
- **Cap Breakers** raise a rating toward its body cap but never past it. A specialization grants two specialized
  breakers once its base-rating requirements are met.
- Build names use BASELINE's public naming catalog and are labelled as predictions.
- **Animations** come from HQ's animation glossary. Size families: smalls 5′9″–6′4″, swings 6′5″–6′9″, bigs 6′10″–7′4″
  (from public 2K27 tables; consistent with HQ's tags).
- **Takeovers** use the public 2K27 requirements; HQ's native probe returns the same 18 gated abilities with the same
  thresholds (its attribute enum is unresolved, but every threshold and AND/OR pattern matches).
- **Badge tokens**: HQ's per-tier equip prices and per-discipline token budgets. HQ has no token data for 6′10″+, so
  those heights use 6′9″ values (shown as ≈).

Open question: whether a linked minimum that would exceed a cap is clamped before or after it cascades (no
observation distinguishes them yet).

## Layout

- `src/engine.js` — caps, links, Overall, breaker ladders, badge tiers (game rules only).
- `src/derive.js` — everything the UI shows about one build, computed in one place.
- `src/solver.js`, `src/breakpoints.js`, `src/tune.js` — optimizer, breakpoint logic, local tuning.
- `src/meta.js`, `src/roles.js`, `src/variants.js`, `src/animations.js` — Lab presets and opinionated weights.
- `src/ui/` — React views.
- `tools/hq/` — drives the HQ builder on an Android emulator (adb, Windows OCR, glyph templates) to verify rules.
- `tools/decode-links.mjs` — decodes the link table from the app's tuning asset.
- `tools/ui-check.mjs` — exercises the UI in headless Chrome and saves screenshots.
- `research/` — HQ dataset snapshot and observations. APKs and third-party data are git-ignored.
