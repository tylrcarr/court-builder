# Court Builder

A local React and Vite workbench for NBA 2K27 MyPLAYER builds.

## Run locally

Use Node.js 22.12 or later and pnpm.

    pnpm install
    pnpm dev

For a production preview, run these commands in order, then open the address printed by the second command.

    pnpm build
    pnpm exec vite preview

Run the rules checks with `pnpm test`.

## Use the app

- Builder sets position, height, weight and wingspan, uses attribute sliders and a live Overall meter, tracks linked minimums and body ceilings, and previews up to five breakers per attribute.
- Optimizer takes post-breaker rating targets and required badge tiers. It searches for base ratings and a general or specialized breaker allocation. By default it searches the selected frame. The optional frame comparison samples three weight/wingspan pairs per legal height for the selected position and includes the current frame.
- Badges shows the rating predicates and checks qualification from final ratings and body height. Qualification is separate from equipping badges with tokens.
- Opening a search result loads its frame, base ratings and Cap Breakers. It may leave room in the estimated budget for upgrades you did not target.

## Accuracy and provenance

The numeric tuning and measurements come from the [2K HQ research dataset](https://github.com/lightmatmul/nba2k27-builder-dataset) and the [Build Lab reference research](https://github.com/souledxxout/NBA2K27-MyPlayer-Build-Lab). NBA2KLab's signed-in estimates and the CVPalace creator were inspected as references. The app runs locally with bundled numeric data and no account dependency.

- Native OVR math matches all 256 mixed and 75 uniform measurements to 0.0001. This measures pricing math, with mixed/uniform probes at one reference height.
- The model reproduces 21 measured ceilings on the reference frame, two published affordability boundaries, and all 20 visible breaker ladders from one published HQ build.
- The builder uses the measured OVR formula with a 99 cutoff. It matches the published 6′5″ and 6′6″ boundary cases, accepts both recorded 6′3″ HQ spreads, and reproduces the reported 6′10″ PF completion at 81 Interior Defense. Exact legality across every frame and game update remains unverified.
- Cap Breaker gains use decoded weights for the 21 builder attributes. The game may reference a larger weight table, so gains can differ on unverified builds.
- The optimizer uses bounded beam search. It ranks plans found by estimated budget room and includes a low-breaker option when available. A failed search is inconclusive, and the top plan is a candidate rather than proof of global optimality.
- Body changes reset the manual ratings and breaker assignments. The app previews hypothetical plans and does not interact with game saves.

Sources captured from tuning version 993560759169487438, August 2026.

Research snapshots: HQ dataset 18f692eaaa611e6daf9427a3d5a5f97ae0423bba and Build Lab d70060cd635268a789e97b16ffa878b576f4e307.



### Build names

The live name uses position and the 20 naming attributes from the base build. Its lookup data comes from [BASELINE’s public naming catalog](https://baselinesquad.com/archetypes), tuning snapshot 2026-10-08. The local implementation reproduces the CVPalace name for the 6′10″ PF regression. Some tied rating profiles differ from BASELINE, so the app labels the result as a prediction.

The published-name regression covers the five Season 2 templates on [2KMyPLAYER](https://2kmyplayer.com/community-builds), two [NBA2KLab point guards](https://www.nba2klab.com/recommended-pgs), and four [NBA2KLab center and power-forward builds](https://beta.nba2klab.com/recommended-centers). It ignores capitalization. A separate deterministic comparison matched BASELINE's client output on 9,998 of 10,000 synthetic spreads. That comparison checks the reproduction of BASELINE, with retail naming parity unverified on those synthetic spreads.

### Linked minimum audit

The saved CVPalace audit contains 840 attribute probes across 35 frame configurations, covering 5′9″–6′7″ and a separate 6′9″ PF. Weight checks use minimum, middle and maximum settings, with additional heavier PF endpoints where the position ranges differ. This is partial coverage, and does not enumerate every pound. The reference began returning 403 errors before the remaining heights could be tested. Candidate differences in the research notes remain unverified and are not bulk-applied.

One correction is applied to the 6′9″ Post Control / Close Shot link. It uses a seven-point gap confirmed by the user's in-game report and eleven CVPalace measurements from Post Control 80 through 90. Both raising and lowering use the corrected relation.

The confirmed 6′11″ Center final rating spread uses the user-reported name 2-Way Rim-Rocking Dimer. This exact-spread observation is labeled in the interface. It does not establish a general rule for post-breaker naming.
