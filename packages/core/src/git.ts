import { spawn, type ChildProcess } from "node:child_process";
import { devNull } from "node:os";

const children = new Set<ChildProcess>();
let cancelled = false;
export function cancelGitCommands() {
  cancelled = true;
  for (const child of children) child.kill("SIGKILL");
}

export async function git(
  root: string,
  args: string[],
  maxBytes = 32 * 1024 * 1024,
): Promise<Buffer> {
  if (cancelled) throw new Error("Review cancelled.");
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith("GIT_")) delete env[key];
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: devNull,
    GIT_TERMINAL_PROMPT: "0",
    GIT_NO_LAZY_FETCH: "1",
    GIT_OPTIONAL_LOCKS: "0",
  });
  return new Promise((resolve, reject) => {
    const child = spawn(
      "git",
      [
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.hooksPath=" + devNull,
        "-c",
        "core.excludesFile=" + devNull,
        ...args,
      ],
      {
        cwd: root,
        env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    children.add(child);
    const chunks: Buffer[] = [];
    let size = 0;
    let failure: Error | undefined;
    const timer = setTimeout(() => {
      failure = new Error("Git command timed out.");
      child.kill();
    }, 10000);
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        failure = new Error("Git output exceeded the review budget.");
        child.kill();
      } else chunks.push(chunk);
    });
    // Drain stderr, but never echo repository-controlled output or absolute paths.
    child.stderr.resume();
    child.on("error", () => {
      children.delete(child);
      clearTimeout(timer);
      reject(new Error("Git could not start. Install Git and try again."));
    });
    child.on("close", (code) => {
      children.delete(child);
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (code !== 0)
        reject(new Error("Git could not read this repository or revision."));
      else resolve(Buffer.concat(chunks));
    });
  });
}
