# CodeMap release roadmap

## CLI-001 — Scope and structural review

Approved implementation task: deliver a read-only npm CLI and local browser review for JS/TS repositories. See ADR-0002 for the architecture and initial limitations.

Implemented in the current working tree:

- Snapshot-local AST analysis, merge-base comparison, scope contracts, graph deltas and cyclic groups.
- Authenticated loopback API with worker isolation, refresh and captured-only text access.
- Static browser UI for scope selection, changed files, dependency map and captured diffs.
- CLI argument handling, runtime/static asset assembly and shutdown handling.
- Core, API and frontend fixtures; deterministic 1,000-node/3,000-edge worker regression fixture; backend coverage enforcement in CI.
- Clean packed-CLI installation and API/assets/refresh/SIGINT/SIGTERM smoke test, also integrated into CI.
- Adversarial fixtures for file replacement, pre-allocation budgets, symlinks/FIFOs, conflicting/disconnected histories, malformed configuration, snapshot-specific aliases, package export conditions/exclusions, and unusual paths.
- Updated PRD/SRS and contributor-facing launch instructions to identify the current release scope.
- Production Chromium workflow tests at standard/high pixel density, including scope/diffs/refresh, real worker messages, pointer/keyboard navigation, resize, session reload and a live DPR change. The same tests can run against a clean installed tarball.
- Fixed a reproduced authentication bypass on mixed-case API paths, a DPR-change canvas sizing bug, and high-DPI rendering cost. Dense edges use a CSS-resolution layer while nodes/text retain native pixel density; offscreen work is culled and edge styles are cached.
- An on-disk monorepo fixture covers inherited aliases, snapshot configuration changes, conditional local exports and `.js` to TypeScript substitution.

Remaining release acceptance:

- Observe passing native macOS/Windows package/browser jobs in the new CI matrix; current execution evidence is Linux. Manually check Ctrl+C from a Windows console because the smoke harness can only force termination there.
- Review npm package ownership/version and authorize publication separately.

Chromium's 1,000-node/3,000-edge fixture now passes at both tested pixel densities. Browser regression limits are mean frame interval <34 ms and p95 <60 ms, with worker messages continuing during rendering. These are headless regression budgets, not a hardware-independent 60 FPS guarantee. Local results do not confirm that remote CI has run. No package has been published.

Documented initial limits remain: custom export conditions, external config inheritance, generated package entry points and non-JS/TS dependency extraction are not comprehensively resolved; concurrent repository snapshots are not atomic. Pilot feedback will guide later parser increments.

## Later increments

1. Attach revision-specific test and coverage evidence to reviews.
2. Preserve architectural explanations and flag stale review decisions.
3. Add editor integration using the same core.
4. Explore explicitly opt-in AI explanations after proving the review workflow with users.
