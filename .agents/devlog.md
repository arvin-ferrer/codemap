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
