# ADR-0001: Deployment Model - Local NPM Package

Date: 2026-07-18

Status: Accepted

## Context

CodeMap acts as a local-first codebase explorer that relies on heavy filesystem parsing to build its dependency graph. We need to decide how to package and distribute the application (the NestJS backend and Next.js frontend) to users. 

Since the application requires scanning arbitrary local source code and analyzing it, hosting it as a centralized web service poses significant security risks. Exposing a filesystem-scanning API to remote users or transferring users' private repository code to a central server would require complex, expensive sandboxing, violate privacy expectations, and add huge network latency for large repositories.

## Decision

We will deploy CodeMap as a local NPM package. Users will install CodeMap locally via `npm install -g @codemap/cli` or run it dynamically using `npx @codemap/cli`. 

The package will bundle the backend parser and the frontend application into a CLI command. When run inside a user's repository:
1. It will spawn the local backend on an open port.
2. It will bind the `WORKSPACE_ROOT` strictly to the current working directory.
3. It will serve the Next.js static production bundle.
4. It will automatically open the user's default browser to access the local web UI.

## Consequences

**Benefits:**
- Security & Privacy: No code leaves the user's machine. The workspace bounds are naturally restricted to where the command is run.
- Zero Latency: File scanning and graph data delivery happen entirely over localhost.
- Easy Integration: Fits directly into a developer's existing toolchain (Node/npm).

**Costs & Risks:**
- Environment Dependency: The user must have a compatible Node.js version installed locally.
- Bundle Size: Both frontend and backend assets must be downloaded during the initial `npx` or global install.
- Process Management: The CLI must gracefully start/stop both backend and frontend servers, handling port conflicts safely.

**Follow-up work:**
- Implement the CLI wrapper package (e.g., `packages/cli`).
- Refactor the Next.js frontend to be exported as a static build (`next export`) that can be served directly by the NestJS backend, or bundle the Next server with the NestJS backend so only one Node process is required.

## Alternatives considered

- **Hosted Web Service:** Users would ZIP and upload their codebase or grant a GitHub app permission to clone it. Rejected due to the extreme security risks of remote execution/parsing, GDPR/privacy concerns, and the infrastructural cost of storing and processing large external repositories.
- **Desktop Electron App:** Bundling CodeMap as an Electron app. Rejected for now because it introduces massive bloat and complex build chains for multiple OS targets. We may revisit this if an NPM-based CLI proves difficult for non-JS developers, but since the target audience is developers, NPM is a reasonable prerequisite.
