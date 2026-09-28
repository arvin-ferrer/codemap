# ADR-0002: Scope and Structural Change Review

Date: 2026-09-28

Status: Accepted by the user in the implementation plan; release validation in progress.

## Decision

CodeMap's first release is an npm CLI for reviewing the structural consequences of a change. It compares the unique merge base of a selected local revision and HEAD with the current working tree, including committed branch changes and local edits. Users declare expected files/folders in a local browser UI and inspect scope exceptions, import-edge additions/removals, new cyclic groups, and captured text diffs.

`packages/core` owns reusable snapshot analysis without NestJS or editor dependencies. The backend hosts authenticated review sessions in one loopback-only process, and the frontend is a static Next.js export. `packages/cli` packages those artifacts and runtime dependencies without requiring installation of private workspace packages. The existing legacy parser modules are not mounted by the new server or shipped in the CLI runtime.

Historical blobs and configuration are read from Git objects without checkout, hooks, text conversion, or executing repository source. Current source is read through bounded asynchronous physical-path validation. The shared package owns review contracts. A worker isolates analysis and can be terminated at the 60-second deadline.

Scope folders use a trailing slash and descendant matching. Renames initially appear as deletion plus addition. Review results disclose unsupported or unresolved analysis; unreadable comparisons are marked unverified. Import connections indicate structural relationships, not demonstrated execution or test coverage.

## Consequences

The analysis engine can later support a VS Code extension without an editor dependency in the core. Packaging includes a browser-open convenience but retains `--no-open` for headless users. Session URLs contain credentials and must remain private.

The first release has no LLM integration or external source transmission. Gemini may later be explicitly opt-in with bounded context and a separate privacy decision. Test evidence, saved decisions, live watching, and an editor extension are deferred.

## Acceptance

Git fixtures must prove net comparisons and unchanged repository state; filesystem fixtures must reject escapes; API tests must verify loopback binding, authentication, captured-only diffs and snapshot invalidation. A clean packed-artifact smoke test and real-browser review are required before release.
