import type { ReviewDiff } from "@codemap/shared";

/** One valid replacement hunk, bounded linear work even for large repeated files. */
export function diffLines(before: string, after: string): string[] {
  if (before === after)
    return ["Text unchanged (file metadata may have changed)."];
  const oldLines = before ? before.split("\n") : [];
  const newLines = after ? after.split("\n") : [];
  let start = 0;
  while (
    start < oldLines.length &&
    start < newLines.length &&
    oldLines[start] === newLines[start]
  )
    start++;
  let endOld = oldLines.length;
  let endNew = newLines.length;
  while (
    endOld > start &&
    endNew > start &&
    oldLines[endOld - 1] === newLines[endNew - 1]
  ) {
    endOld--;
    endNew--;
  }
  const from = Math.max(0, start - 3);
  return [
    `@@ baseline line ${from + 1} / current line ${from + 1} @@`,
    ...oldLines.slice(from, start).map((line) => "  " + line),
    ...oldLines.slice(start, endOld).map((line) => "- " + line),
    ...newLines.slice(start, endNew).map((line) => "+ " + line),
    ...oldLines.slice(endOld, endOld + 3).map((line) => "  " + line),
  ];
}
export default function CapturedDiff({ diff }: { diff: ReviewDiff }) {
  return (
    <pre aria-label="Captured text diff">
      {diffLines(diff.before, diff.after).join("\n")}
    </pre>
  );
}
