import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import type { ChangedFile, ReviewData, ReviewDiff } from "@codemap/shared";
import { git } from "./git";
import { baselineSnapshot, currentSnapshot, LIMITS } from "./snapshot";
import { TypeScriptSnapshotExtractor } from "./extractor";
import { compareGraphs } from "./compare";
export { contained, readSafe, LIMITS } from "./snapshot";
export { TypeScriptSnapshotExtractor } from "./extractor";
export type { ImportExtractor } from "./extractor";
export { compareGraphs, cyclicGroups } from "./compare";

export interface ReviewOptions {
  root: string;
  base: string;
  scope?: string[];
  limits?: Partial<typeof LIMITS>;
}
export interface CapturedReview {
  data: ReviewData;
  diffs: Record<string, ReviewDiff>;
}
export function normalizeScope(scope: string[]): string[] {
  return [
    ...new Set(
      scope.map((entry) => {
        const normalized = entry.replace(/\\/g, "/").replace(/^\.\//, "");
        if (
          !normalized ||
          normalized.startsWith("/") ||
          /^[A-Za-z]:/.test(normalized) ||
          normalized.includes("\0") ||
          normalized
            .split("/")
            .some((p) => p === ".." || p === ".git" || p === ".")
        )
          throw new Error(
            "Scope must contain repository-relative files or folders ending in /.",
          );
        return normalized;
      }),
    ),
  ];
}
export async function captureReview(
  options: ReviewOptions,
): Promise<CapturedReview> {
  const root = await fs.realpath(options.root);
  const top = (await git(root, ["rev-parse", "--show-toplevel"]))
    .toString()
    .replace(/\n$/, "");
  if (root !== (await fs.realpath(top)))
    throw new Error("Run codemap review from the Git repository root.");
  if (
    !options.base ||
    options.base.startsWith("-") ||
    options.base.includes("\0") ||
    options.base.length > 256
  )
    throw new Error("Invalid base revision.");
  const revision = async (ref: string) =>
    (
      await git(root, [
        "rev-parse",
        "--verify",
        "--end-of-options",
        ref + "^{commit}",
      ])
    )
      .toString()
      .trim();
  let head: string;
  let base: string;
  try {
    head = await revision("HEAD");
  } catch {
    throw new Error(
      "This repository has no HEAD commit. Create an initial commit first.",
    );
  }
  try {
    base = await revision(options.base);
  } catch {
    throw new Error(
      "Base revision was not found locally. Pass --base with an existing branch or commit.",
    );
  }
  let ancestorOutput: Buffer;
  try {
    ancestorOutput = await git(root, ["merge-base", "--all", head, base]);
  } catch {
    throw new Error(
      "HEAD and the base have no available common ancestor. Use a related local base or provide complete history.",
    );
  }
  const ancestors = ancestorOutput
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean);
  if (ancestors.length !== 1)
    throw new Error(
      "The base must have one unambiguous common ancestor with HEAD.",
    );
  if ((await git(root, ["ls-files", "-u", "-z"])).length)
    throw new Error("Resolve merge conflicts before starting a review.");
  const budget = {
    bytes: 0,
    files: 0,
    started: Date.now(),
    limits: { ...LIMITS, ...options.limits },
  };
  const before = await baselineSnapshot(root, ancestors[0], budget);
  const after = await currentSnapshot(root, budget);
  if ((await revision("HEAD")) !== head)
    throw new Error("HEAD changed during capture. Refresh the review.");
  const extractor = new TypeScriptSnapshotExtractor();
  const baseline = extractor.parse(before, "baseline");
  const current = extractor.parse(after, "current");
  const files: ChangedFile[] = [];
  const diffs: Record<string, ReviewDiff> = Object.create(null) as Record<
    string,
    ReviewDiff
  >;
  const id = randomUUID();
  for (const name of [
    ...new Set([...before.modes.keys(), ...after.modes.keys()]),
  ].sort()) {
    const was = before.modes.has(name);
    const now = after.modes.has(name);
    if (
      was &&
      now &&
      before.hashes.has(name) &&
      before.hashes.get(name) === after.hashes.get(name) &&
      before.modes.get(name) === after.modes.get(name)
    )
      continue;
    // Excluded files remain visible: absence of content is never evidence of no change.
    const inspectable =
      (!was || before.files.has(name)) && (!now || after.files.has(name));
    files.push({
      path: name,
      status: !was
        ? "added"
        : !now
          ? "deleted"
          : !before.hashes.has(name) || !after.hashes.has(name)
            ? "unverified"
            : "modified",
      inspectable,
    });
    if (inspectable)
      diffs[name] = {
        reviewId: id,
        path: name,
        before: before.files.get(name) ?? "",
        after: after.files.get(name) ?? "",
      };
  }
  const nodes = new Map(
    [...baseline.graph.nodes, ...current.graph.nodes].map((node) => [
      node.id,
      node,
    ]),
  );
  const links = new Map(
    [...baseline.graph.links, ...current.graph.links].map((link) => [
      JSON.stringify(link),
      link,
    ]),
  );
  // Include inventory-only files in the map too, without inventing dependency edges.
  for (const file of files)
    if (!nodes.has(file.path))
      nodes.set(file.path, {
        id: file.path,
        name: path.posix.basename(file.path),
        type: path.posix.extname(file.path).slice(1),
        size: 0,
        lines: 0,
      });
  return {
    data: {
      id,
      capturedAt: new Date().toISOString(),
      baseRef: options.base,
      baseCommit: ancestors[0],
      headCommit: head,
      files,
      graph: { nodes: [...nodes.values()], links: [...links.values()] },
      ...compareGraphs(baseline.graph, current.graph),
      issues: [
        ...before.issues,
        ...after.issues,
        ...baseline.issues,
        ...current.issues,
      ],
      initialScope: normalizeScope(options.scope ?? []),
    },
    diffs,
  };
}
