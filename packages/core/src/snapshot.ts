import * as fs from "node:fs/promises";
import { constants } from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import type { ReviewIssue } from "@codemap/shared";
import { git } from "./git";

export const LIMITS = {
  fileBytes: 1024 * 1024,
  totalBytes: 500 * 1024 * 1024,
  files: 50000,
  depth: 30,
  timeMs: 60000,
};
export interface Budget {
  bytes: number;
  files: number;
  started: number;
  limits: typeof LIMITS;
}
export interface Snapshot {
  files: Map<string, string>;
  hashes: Map<string, string>;
  modes: Map<string, string>;
  issues: ReviewIssue[];
}
const TEXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".css",
  ".html",
  ".py",
  ".go",
  ".rs",
  ".yaml",
  ".yml",
  ".txt",
]);
export const isCode = (name: string) => /\.[cm]?[jt]sx?$/.test(name);
export function contained(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative !== ".." &&
    !relative.startsWith(".." + path.sep) &&
    !path.isAbsolute(relative)
  );
}
function safeName(name: string): boolean {
  return (
    !!name &&
    !name.includes("\\") &&
    !name.includes("\0") &&
    !path.posix.isAbsolute(name) &&
    !name.split("/").some((p) => p === ".." || p === "." || p === ".git")
  );
}
export function checkBudget(budget: Budget) {
  if (Date.now() - budget.started > budget.limits.timeMs)
    throw new BudgetError("Review timed out; narrow the repository and retry.");
}
class BudgetError extends Error {}
function admit(name: string, size: number, budget: Budget): string | undefined {
  checkBudget(budget);
  if (!safeName(name)) return "Unsupported or unsafe path.";
  if (name.split("/").length - 1 > budget.limits.depth)
    return "Directory depth exceeds 30.";
  if (size > budget.limits.fileBytes)
    return "File exceeds the 1 MiB content limit.";
  if (budget.bytes + size > budget.limits.totalBytes)
    throw new BudgetError("Review exceeds its total byte budget.");
  if (budget.files >= budget.limits.files)
    throw new BudgetError("Review exceeds its file-count budget.");
  budget.bytes += size;
  budget.files++;
}
/** Recheck the opened inode and physical path; do not follow final symlinks or block on FIFOs. */
export async function readSafe(
  root: string,
  name: string,
  maxBytes: number,
  beforeRead?: (size: number) => void,
): Promise<{ content: Buffer; mode: string }> {
  if (!safeName(name)) throw new Error("Unsafe path.");
  const candidate = path.resolve(root, name);
  if (!contained(root, candidate))
    throw new Error("Path escapes the workspace.");
  const stat = await fs.lstat(candidate);
  const real = await fs.realpath(candidate);
  if (!contained(root, real) || !stat.isFile() || stat.isSymbolicLink())
    throw new Error("Symlink, special file, or external path excluded.");
  if (stat.size > maxBytes)
    throw new Error("File exceeds the 1 MiB content limit.");
  const handle = await fs.open(
    real,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW ?? 0) |
      (constants.O_NONBLOCK ?? 0),
  );
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.ino !== stat.ino || opened.dev !== stat.dev)
      throw new Error("File changed during capture. Refresh the review.");
    if (opened.size > maxBytes)
      throw new Error("File exceeds the content limit.");
    beforeRead?.(opened.size);
    const buffer = Buffer.alloc(Math.min(opened.size + 1, maxBytes + 1));
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        length,
        buffer.length - length,
        null,
      );
      if (!bytesRead) break;
      length += bytesRead;
    }
    const after = await handle.stat();
    const finalStat = await fs.lstat(candidate);
    if (
      length !== opened.size ||
      after.mtimeMs !== opened.mtimeMs ||
      after.size !== opened.size ||
      finalStat.ino !== opened.ino ||
      finalStat.dev !== opened.dev ||
      finalStat.isSymbolicLink() ||
      (await fs.realpath(candidate)) !== real
    )
      throw new Error("File changed during capture. Refresh the review.");
    return {
      content: buffer.subarray(0, length),
      mode: opened.mode & 0o111 ? "100755" : "100644",
    };
  } finally {
    await handle.close();
  }
}
function empty(): Snapshot {
  return { files: new Map(), hashes: new Map(), modes: new Map(), issues: [] };
}
function save(
  snapshot: Snapshot,
  name: string,
  data: Buffer,
  side: "baseline" | "current",
) {
  snapshot.hashes.set(name, createHash("sha256").update(data).digest("hex"));
  if (!TEXT.has(path.posix.extname(name)) || data.includes(0)) {
    snapshot.issues.push({
      path: name,
      snapshot: side,
      message:
        "Content inspection and dependency analysis are unsupported for this file.",
    });
    return;
  }
  snapshot.files.set(name, data.toString("utf8"));
  if (!isCode(name) && path.posix.extname(name) !== ".json")
    snapshot.issues.push({
      path: name,
      snapshot: side,
      message:
        "Text diff available; dependency extraction supports JavaScript and TypeScript only.",
    });
}
export async function baselineSnapshot(
  root: string,
  commit: string,
  budget: Budget,
): Promise<Snapshot> {
  const snapshot = empty();
  const entries = (await git(root, ["ls-tree", "-rlz", commit]))
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  if (entries.length > budget.limits.files)
    throw new Error("Baseline exceeds the file-count budget.");
  for (const entry of entries) {
    const tab = entry.indexOf("\t");
    const [mode, type, oid, sizeText] = entry.slice(0, tab).trim().split(/\s+/);
    const name = entry.slice(tab + 1);
    snapshot.modes.set(name, mode);
    const problem =
      type !== "blob" || !["100644", "100755"].includes(mode)
        ? "Symlinks and submodules are not analyzed."
        : admit(name, Number(sizeText), budget);
    if (problem) {
      snapshot.issues.push({
        path: name,
        snapshot: "baseline",
        message: problem,
      });
      continue;
    }
    save(
      snapshot,
      name,
      await git(root, ["cat-file", "blob", oid], budget.limits.fileBytes),
      "baseline",
    );
  }
  return snapshot;
}
export async function currentSnapshot(
  root: string,
  budget: Budget,
): Promise<Snapshot> {
  const snapshot = empty();
  const names = [
    ...new Set(
      (
        await git(root, [
          "ls-files",
          "-z",
          "--cached",
          "--others",
          "--exclude-standard",
        ])
      )
        .toString("utf8")
        .split("\0")
        .filter(Boolean),
    ),
  ].sort();
  if (names.length > budget.limits.files)
    throw new Error("Workspace exceeds the file-count budget.");
  for (const name of names) {
    checkBudget(budget);
    let data: Awaited<ReturnType<typeof readSafe>>;
    try {
      data = await readSafe(root, name, budget.limits.fileBytes, (size) => {
        const problem = admit(name, size, budget);
        if (problem) throw new Error(problem);
      });
    } catch (error) {
      if (error instanceof BudgetError) throw error;
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      snapshot.modes.set(name, "excluded");
      snapshot.issues.push({
        path: name,
        snapshot: "current",
        message:
          error instanceof Error && !(error as NodeJS.ErrnoException).code
            ? error.message
            : "File could not be safely read.",
      });
      continue;
    }
    snapshot.modes.set(name, data.mode);
    save(snapshot, name, data.content, "current");
  }
  return snapshot;
}
