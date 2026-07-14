# Contributing to CodeMap

Thanks for contributing. CodeMap is a pnpm workspace with a Next.js frontend,
NestJS backend, and shared TypeScript API contracts.

## Before you start

- Use Node.js 22 (`.nvmrc`) and pnpm 10.20.0.
- Create an issue or agree on the scope before beginning a substantial change.
- Keep public graph and query types in `packages/shared`; update both consumers
  and their tests when a contract changes.
- Do not introduce new dependencies or change the lockfile unless the change is
  necessary and explained in the pull request.

## Local checks

Run these from the repository root before opening a pull request:

```bash
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

For focused work, use pnpm filters, for example
`pnpm --filter backend test` or `pnpm --filter @codemap/frontend format`.

## Pull requests

- Keep pull requests focused and describe the user-visible outcome.
- Complete the PR template, including acceptance criteria.
- Add or update tests for behavior changes.
- For parser, filesystem, worker, or graph-rendering changes, document the
  performance and security impact and how you checked it.
- Do not commit credentials, local repositories, build output, or generated
  coverage files.

## Design records

Record consequential decisions in `docs/adr/` using the ADR template. Examples
include changes to the local-agent boundary, graph schema, parser strategy, or
LLM provider and privacy model.
