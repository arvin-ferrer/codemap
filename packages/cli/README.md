# CodeMap CLI

Review the scope and dependency consequences of a change locally.

```sh
npx @codemap/cli review --base main
```

Requires Node.js 22+, Git, and invocation from the repository root. The base must exist locally. Nothing is fetched, uploaded, staged, or checked out.

The review compares the common ancestor of HEAD and the base with the current working files, including branch commits and staged, unstaged, and non-ignored untracked changes. Select expected files/folders in the browser or pass repeated `--scope src/auth/` options. Folder scopes end in `/`. `--no-open` prints the session URL without launching a browser.

The session URL contains a temporary credential: do not share it. The server binds to an OS-assigned port on 127.0.0.1 and stops on Ctrl+C. Text diffs use captured content; Refresh captures new content and preserves the selected scope.

JavaScript/TypeScript imports, relative paths, tsconfig aliases, and local package exports are analyzed without executing source/configuration. Unresolved/external imports, unsupported files, symlinks, submodules, and oversized content are disclosed. Renames appear as deletion plus addition. New cyclic groups exclude type-only imports; imports do not prove runtime behavior. Configurations must exist inside the captured repository. Reviews are bounded to 1 MiB per file, 500 MiB/50,000 admitted files across both snapshots, depth 30, and 60 seconds. No AI provider, automatic test execution, or network access is required.

For a local build: run `pnpm install --frozen-lockfile`, `pnpm build`, then `pnpm --filter @codemap/cli pack`. Install the resulting tarball with pnpm in a temporary directory to try it before publishing.

Maintainer verification from the monorepo root:

```sh
pnpm --filter @codemap/cli exec playwright install chromium
pnpm --filter @codemap/cli pack --pack-destination packages/cli
pnpm --filter @codemap/cli test:packed codemap-cli-0.1.0.tgz --browser
```

The optional browser suite exercises the clean installed artifact at standard and high pixel density, including the 1,000-node graph and a live pixel-density change. CI runs this command on Linux, macOS and Windows. Linux has been verified locally; native macOS/Windows CI results and a Windows console Ctrl+C check remain pending. Windows process termination in the smoke harness does not prove graceful console signal handling.
