# CodeMap - AI Agent Rules & Guidelines

## 1. Strict Agent Handoff Protocol & Issue-Driven Work

**CRITICAL RULE:** All AI agent work must be issue-driven to prevent race conditions and architectural drift. Do not make sweeping, unbounded changes across the monorepo.

*   **Bounded Tasks:** Execute exactly one bounded task per session with clear acceptance criteria and a test plan.
*   **Handoffs:** When concluding a session, summarize the current state, open decisions, and next steps in `handoff.md`. This ensures perfect synchronization for the next agent or human developer.
*   **Workflow Loop:** 
    1. Plan & Identify Risks (Architecture/Security)
    2. Implement (Smallest viable change)
    3. Review (Contracts, Security, Regressions)
    4. Test (Validate fixtures)
    5. Await Human Approval (For product/architecture decisions)

## 2. Architecture & Non-Negotiable Security Rules

CodeMap operates as a local-first NPM CLI tool that parses physical filesystems. 
*   **Sandbox Enforcement:** NEVER allow path traversals outside the configured `WORKSPACE_ROOT`. All candidate file paths MUST be validated using asynchronous `fs/promises` (`lstat` and `realpath`) with strict containment checks.
*   **No Remote Execution:** Do NOT expose the filesystem-scanning API or NestJS daemon to untrusted remote networks.
*   **AST over Regex:** All dependency parsing must use the AST extractors (e.g., TypeScript Compiler API) behind the `ImportExtractor` interface. Do NOT revert to or introduce fragile regex parsing.
*   **Data Privacy:** Repository source code is untrusted. Do NOT send full repository contents to external LLMs. Strictly use the BFS Sub-Graph extraction and AST chunk pruning to send bounded, token-efficient context.

## 3. Package Ownership & Contract Boundaries

CodeMap is a monorepo utilizing `pnpm` workspaces. Respect the boundaries:
*   `apps/frontend`: Next.js application and D3-force Web Worker physics. Exclusively handles visual state, canvas rendering, and user input.
*   `apps/backend`: NestJS local daemon. Exclusively handles file system scanning, AST parsing, and Gemini RAG coordination.
*   `packages/shared`: The single source of truth for TypeScript interfaces (`CodeNode`, `CodeLink`, `WorkerMessageOutbound`, etc.). 
*   **Absolute Isolation:** The backend and frontend must NEVER import directly from each other. They must only bridge data shapes through `packages/shared`.
*   **High-Conflict Zones:** Avoid parallel agents editing the shared contract (`packages/shared/src/index.ts`), the lockfile, or the main canvas visualizer simultaneously.

## 4. Development Environment & Commands

Agents MUST use the following commands to validate their work before concluding a turn:
*   **Linting:** `pnpm lint` (Runs ESLint across all packages).
*   **Formatting:** `pnpm format:check` (Runs Prettier). If it fails, run `pnpm -r run format` to auto-fix.
*   **Testing:** `pnpm test` (Runs all Jest suites).
*   **Building:** `pnpm build` (Builds NestJS and static Next.js exports).
*   *Note: Never commit code that fails `lint`, `format:check`, or `test`.*

## 5. Dependency Installation & Lockfile Policy

*   **Package Manager:** Strictly use `pnpm`. Do NOT use `npm` or `yarn`.
*   **Installation:** Use `pnpm install --frozen-lockfile` to sync dependencies during setup to avoid accidental lockfile mutation.
*   **Adding Packages:** When adding new packages via `pnpm add`, allow the lockfile to update, but explicitly scope the addition: `pnpm add <pkg> --filter <workspace>` to avoid root pollution.
*   **Lockfile:** Do not manually edit `pnpm-lock.yaml`. 
*   **Scrutiny:** Look before you leap. Verify environment compatibility and check if an existing package already solves the problem before adding new dependencies.

## 6. Test Expectations

*   **Coverage:** The backend currently maintains >80% coverage. Do not merge code that lowers this standard.
*   **Requirement:** Any new feature, parser addition, or frontend component MUST be accompanied by a corresponding test.
*   **Performance Tests:** Any changes to the graph layout, worker protocol, or parser must be validated against the 1,000-node performance fixture (measuring frame time, worker-message rate, and heap usage).

## 7. Change Management & ADRs

*   **Architectural Decision Records (ADRs):** Required for any major architectural shifts, structural API changes, or significant dependency swaps. Draft these in `docs/adr/`.
*   **Approval:** Wait for explicit human approval on major product or architecture decisions before proceeding with implementation.

## 8. Security & OWASP Top 10 Compliance

To prevent critical vulnerabilities, data leaks, and codebase corruption, all agents and developers MUST adhere to the following OWASP-aligned security practices:

*   **A01: Broken Access Control (Path Traversal):** Enforce strict sandbox boundaries. Never process paths outside `WORKSPACE_ROOT`. Always use asynchronous `lstat` and `realpath` to mitigate symlink escapes.
*   **A02: Cryptographic Failures (Secret Management):** NEVER hardcode API keys, tokens, or credentials (e.g., Gemini API keys). All secrets must be loaded via `.env` files (which are in `.gitignore`). Scrub all logs and error messages of sensitive variables.
*   **A03: Injection (Command, Prompt, & XSS):** 
    *   *Command:* Never concatenate user input or file names directly into shell commands (`exec`, `spawn`).
    *   *Prompt:* Treat all parsed repository source code as untrusted input. Use strict structural XML delimiters (e.g., `<code_chunk>...</code_chunk>`) in LLM prompts to prevent malicious code comments from overriding system instructions.
    *   *Cross-Site Scripting (XSS):* File names, code snippets, and AST outputs are untrusted. Never use React's `dangerouslySetInnerHTML` in the Next.js frontend without strict HTML sanitization (e.g., `DOMPurify`).
*   **A04: Insecure Design (Resource Exhaustion / DoS):** Ensure the NestJS parser maintains hard limits. Skip files over 1MB, enforce a maximum directory traversal depth, and set timeouts for AST generation to prevent CPU/memory exhaustion from "repo bombs."
*   **A05: Security Misconfiguration:** Ensure local servers (NestJS/Next.js) bind ONLY to `localhost` (`127.0.0.1`), never `0.0.0.0`. Do not expose the scanner to the local network.
*   **A07: Identification & Authentication Failures:** Because multi-user systems share `localhost`, the NestJS API must eventually require a temporary, randomly generated session token (created by the CLI at startup) to authenticate requests from the frontend.
*   **A08: Software and Data Integrity Failures:** Never use `eval()` or `Function()` on parsed codebase strings. Rely strictly on the TypeScript Compiler API (AST) for static analysis.
*   **A10: Server-Side Request Forgery (SSRF):** Do not allow the RAG query pipeline or parser to fetch arbitrary remote URLs discovered within the user's codebase.
