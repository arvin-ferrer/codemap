# CodeMap - Developer Handoff & Changelog

This document serves as the live state of the project. All AI agents and developers must log their completed tasks here to maintain perfect synchronization.

### [2026-07-18] Initial Architecture, DevOps Setup, & Security Policies

- **Architecture Migration:** Migrated the frontend from Vite to Next.js (App Router, TypeScript) to better suit project requirements. API proxy rewrites (`/api/*` to the backend) are configured in `next.config.ts`.
- **Security Patches:** Fixed path traversal vulnerabilities in the `ParserController` and `file-scanner.service.ts` by enforcing a static `WORKSPACE_ROOT` with async `lstat` and `realpath` validations. Fixed floating promises in `main.ts`.
- **Parser Core:** Refactored `import-parser.service.ts` and `typescript-ast-extractor.service.ts` from fragile regex scanners to robust `TypeScript Compiler API` AST tokenization. Completely removed synchronous `fs` methods in favor of `fs/promises`.
- **DevOps & CI/CD Pipeline:** Fully configured GitHub Actions (`ci.yml`) to enforce strict linting, type checking, formatting, and unit testing on PRs. Resolved Node v22 compatibility issues.
- **Agent Guidelines:** Created `.agents/AGENTS.md` to establish strict OWASP Top 10 security protocols, issue-driven workflow, and monorepo contract boundaries.
- **Testing Suites:** 
  - Created AST Fixture tests in `apps/backend/src/parser/typescript-ast-extractor.service.spec.ts`. Backend coverage includes security sandbox tests and parser tests (6 test suites passing).
  - Bootstrapped Jest, `@testing-library/react`, and DOM matchers in the `@codemap/frontend` workspace.
  - Implemented the first UI component tests for `SearchBar.tsx`.

### [2026-09-28] Architectural Audit, Security Evaluation & Roadmap Formulation

- **Codebase Audit Completed:** Conducted a comprehensive multi-dimensional audit of CodeMap across security, AST extraction, frontend performance, and RAG readiness.
- **Documentation:** Created `docs/audit.md` establishing the health scorecard, OWASP vulnerability analysis (SEC-01 path prefix matching, SEC-02 sync I/O, SEC-03 0.0.0.0 binding and CORS), AST parser gaps, and a prioritized 4-sprint roadmap.
- **Milestone Re-alignment:** Validated completion of Milestones 1–3 (file traverser, TypeScript AST extractor, worker-decoupled canvas renderer) and structured roadmaps for Milestones 4 & 5.

### 🚀 Upcoming Tasks (Sprint 1: Security & Parser Hardening)
1. **Security Patch (SEC-01):** Replace naive `realPath.startsWith(workspaceRoot)` checks in `file-scanner.service.ts` and `typescript-ast-extractor.service.ts` with `path.relative` containment validation.
2. **Async I/O Migration (SEC-02):** Convert `security.service.ts` from synchronous `fs` to `fs/promises`.
3. **Localhost Binding (SEC-03):** Bind NestJS in `main.ts` strictly to `127.0.0.1` and restrict CORS to localhost.
4. **Path Alias Resolution (AST-02):** Add `tsconfig.json` path mapping resolution to `TypeScriptAstExtractorService`.

### [2026-09-28] CLI-001: Scope and Structural Change Review

- Implemented the approved npm CLI-first direction documented in ADR-0002. Added reusable snapshot/AST core, review contracts, authenticated loopback session APIs, static browser review UI, and assembled CLI packaging.
- Reviews compare the unique merge base to final working-tree content, including branch commits and local edits. Users declare expected scope and inspect exceptions, import deltas, new cyclic groups and captured text diffs. Configuration-only edge changes remain visible in the map.
- Added bounded asynchronous file validation with opened-file rechecks, prospective byte/file budgets, worker timeouts and Git cancellation. No source execution, checkout, staging, fetch, LLM transmission, or arbitrary file-read API is used. Legacy parser code remains in the tree but is not mounted or packaged by the new CLI.
- Added adversarial Git/filesystem/config/package-resolution fixtures, component/canvas tests, backend coverage enforcement, 1,000-node parser/worker regression checks and a clean packed-install smoke test in CI. Local validation: lint, format:check, build and all 59 tests passed; backend line coverage is 88.21%. Packed installation/API/assets/refresh/SIGINT/SIGTERM checks passed on Linux.
- The worker fixture measured approximately 4.27 ms mean physics time, 0.0036 ms p95 hover lookup, 35.85 messages/sec and 7.56 MiB main-process heap delta. These measurements do not establish browser FPS or total worker memory.
- Updated README, PRD/SRS, roadmap and handoff. Browser verification could not run because no browser was connected; real-browser worker/navigation/DPR/performance and macOS/Windows checks remain release gates. Snapshots are not atomic during concurrent repository edits; unsupported resolution is disclosed. No package was published and no commit was made.

### [2026-09-28] CLI-001: Browser Validation and Release Hardening

- With the user's explicit approval, installed Playwright/Chromium and tested the production browser bundle against both the workspace build and a clean installed CLI tarball. All four browser tests pass: scope/diffs/refresh, real physics worker, search, pointer/keyboard navigation, resize, live pixel-density changes, reload and a 1,000-node/3,000-edge canvas at DPR 1 and 2.
- Reproduced and fixed an authentication bypass on mixed-case API routes (`/API/REVIEW`), with unauthenticated GET/POST/diff regressions and a packed-package assertion. Fixed canvas backing-size changes when DPR changes without a logical resize. Improved dense graph rendering with viewport culling, cached edge styles, bounded stroke batches and a CSS-resolution edge layer while retaining native-DPR nodes/text.
- Added an on-disk monorepo parser fixture, clean-installed browser test option, and a Linux/macOS/Windows package/browser CI matrix. Native macOS/Windows CI has not run in this session. Windows forced termination in the harness is explicitly distinguished from a still-required native console Ctrl+C check.
- Final local checks passed: lint, formatting, build, 62 unit/integration tests, 4 browser tests against the installed package, backend coverage 88.21%, worker benchmark and packaged authentication/assets/refresh/SIGINT/SIGTERM checks.
- Latest packed-browser mean/p95 frame intervals: DPR 1 = 16.52/16.8 ms; DPR 2 = 28.91/33.4 ms. These are headless measurements, not a universal 60 FPS guarantee. Browser heap excludes worker memory. Updated README, CLI README, roadmap and handoff with exact verification scope and remaining platform/release gates. No commit or npm publication was made.

### [2026-09-28] Structured Commit History

- At the user's request, organized the historical audit, analysis core, authenticated API, review UI, CLI, CI and current documentation into seven focused commits on `develop`. Preserved the original audit separately from implementation changes.
- Generated intermediate lockfiles with pnpm for the core/backend dependency commits; the final lockfile retains the tested CLI and Playwright dependencies. Excluded generated bundles, archives and browser artifacts.
- Re-ran lint, format:check, build and all 62 unit/integration tests successfully before committing. Previously recorded browser/coverage evidence remains applicable. Nothing was pushed or published; native macOS/Windows CI results remain pending.
