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

### 🚀 Upcoming Tasks (Next Session)
1. **Frontend Implementation:** Begin implementing the D3 physics engine and 2D canvas visualizer using a Web Worker (to decouple coordinates from the React thread).
2. **Performance Fixture:** Construct a 1,000-node graph test to measure worker frame time and message rates.
3. **RAG Integration:** Begin building the BFS sub-graph context extraction and Gemini API bindings.
