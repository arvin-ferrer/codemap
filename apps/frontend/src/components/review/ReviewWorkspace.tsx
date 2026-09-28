"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isInScope, type ReviewData, type ReviewDiff } from "@codemap/shared";
import GraphVisualizer from "../GraphVisualizer";
import { reviewApi } from "./api";
import CapturedDiff from "./CapturedDiff";
import styles from "./ReviewWorkspace.module.css";

export default function ReviewWorkspace() {
  const [review, setReview] = useState<ReviewData | null>(null);
  const [scope, setScope] = useState<string[] | null>(null);
  const [draftScope, setDraftScope] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState<ReviewDiff | null>(null);
  const [diffError, setDiffError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    reviewApi<ReviewData>("", { signal: controller.signal })
      .then((data) => {
        setReview(data);
        if (data.initialScope.length) {
          setScope(data.initialScope);
          setDraftScope(data.initialScope);
        }
        setBusy(false);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error ? err.message : "Unable to load review.",
          );
          setBusy(false);
        }
      });
    return () => controller.abort();
  }, []);

  const refresh = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await reviewApi<ReviewData>("/refresh", { method: "POST" });
      setReview(data);
      setSelected(null);
      setDiff(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed.");
    } finally {
      setBusy(false);
    }
  };
  const selectFile = useCallback((name: string | null) => {
    setSelected(name);
  }, []);
  useEffect(() => {
    if (!review || !selected) return;
    const controller = new AbortController();
    const file = review.files.find((f) => f.path === selected);
    if (!file?.inspectable) return;
    reviewApi<ReviewDiff>(
      `/diff?id=${encodeURIComponent(review.id)}&path=${encodeURIComponent(selected)}`,
      { signal: controller.signal },
    )
      .then((data) => {
        setDiff(data);
        setDiffError("");
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setDiffError(err instanceof Error ? err.message : "Diff failed.");
      });
    return () => controller.abort();
  }, [review, selected]);

  const graph = useMemo(() => {
    if (!review) return { nodes: [], links: [] };
    const changed = new Set(review.files.map((file) => file.path));
    // A config-only edit can change imports between otherwise unchanged files.
    for (const link of [...review.addedLinks, ...review.removedLinks]) {
      changed.add(link.source);
      changed.add(link.target);
    }
    const visible = new Set(changed);
    for (const link of review.graph.links)
      if (changed.has(link.source) || changed.has(link.target)) {
        visible.add(link.source);
        visible.add(link.target);
      }
    return {
      nodes: review.graph.nodes.filter((n) => visible.has(n.id)),
      links: review.graph.links.filter(
        (l) => visible.has(l.source) && visible.has(l.target),
      ),
    };
  }, [review]);
  const scopeOptions = useMemo(() => {
    const entries = new Set(draftScope);
    for (const file of review?.files ?? []) {
      entries.add(file.path);
      const parts = file.path.split("/");
      parts.pop();
      while (parts.length) {
        entries.add(parts.join("/") + "/");
        parts.pop();
      }
    }
    return [...entries].sort();
  }, [review, draftScope]);
  const outside =
    review?.files.filter(
      (file) => scope !== null && !isInScope(file.path, scope),
    ) ?? [];
  const selectedFile = review?.files.find((f) => f.path === selected);
  const capturedDiff =
    diff?.path === selected && diff.reviewId === review?.id ? diff : null;

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>CODEMAP / CHANGE REVIEW</span>
          <h1>Review the shape of your change.</h1>
          <p>
            Branch changes and local edits. Import relationships show potential
            connections, not proof of runtime behavior.
          </p>
        </div>
        <button disabled={busy} onClick={() => void refresh()}>
          {busy ? "Capturing…" : "Refresh snapshot"}
        </button>
      </header>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {!review && !busy && (
        <p>
          Start <code>codemap review --base main</code> and open its session
          URL.
        </p>
      )}
      {review && (
        <>
          <section className={styles.summary} aria-label="Review summary">
            <span>
              <strong>{review.files.length}</strong> changed / unverified files
            </span>
            <span>
              <strong>
                +{review.addedLinks.length} / −{review.removedLinks.length}
              </strong>{" "}
              import connections
            </span>
            <span>
              <strong>{review.newCycles.length}</strong> new cyclic groups
            </span>
            <span>
              {scope === null
                ? "Scope not set"
                : `${outside.length} outside expected scope`}
            </span>
          </section>
          <p className={styles.meta}>
            Base: {review.baseRef} · common ancestor{" "}
            {review.baseCommit.slice(0, 10)} · captured{" "}
            {new Date(review.capturedAt).toLocaleString()}
          </p>
          <div className={styles.columns}>
            <aside className={styles.sidebar}>
              <details open>
                <summary>Expected scope</summary>
                <p>Select the files or folders the task was meant to change.</p>
                <div className={styles.scopeList}>
                  {scopeOptions.map((entry) => (
                    <label key={entry}>
                      <input
                        type="checkbox"
                        checked={draftScope.includes(entry)}
                        onChange={(event) =>
                          setDraftScope((previous) =>
                            event.target.checked
                              ? [...previous, entry]
                              : previous.filter((item) => item !== entry),
                          )
                        }
                      />
                      {entry}
                    </label>
                  ))}
                </div>
                <button onClick={() => setScope([...draftScope])}>
                  Set expected scope
                </button>
              </details>
              <h2>Changed files</h2>
              {review.files.length === 0 && (
                <p>No net changes against this baseline.</p>
              )}
              <ul className={styles.files}>
                {review.files.map((file) => (
                  <li key={file.path}>
                    <button
                      aria-pressed={selected === file.path}
                      onClick={() => selectFile(file.path)}
                    >
                      <span className={styles.status}>{file.status}</span>
                      <span>{file.path}</span>
                      {scope !== null && !isInScope(file.path, scope) && (
                        <strong className={styles.outside}>
                          Outside scope
                        </strong>
                      )}
                      {!file.inspectable && <small>Content unavailable</small>}
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
            <section className={styles.map} aria-label="Dependency changes">
              <div className={styles.legend}>
                Solid + added · dashed − removed · thin unchanged
              </div>
              <GraphVisualizer
                graph={graph}
                review={review}
                selectedId={selected}
                onSelect={selectFile}
              />
            </section>
          </div>
          <section className={styles.details} aria-label="Change details">
            <h2>{selected ?? "Select a file to inspect its captured diff"}</h2>
            {selected && !selectedFile && (
              <p>
                Unchanged dependency context. Select a changed file to inspect
                its diff.
              </p>
            )}
            {selectedFile && !selectedFile.inspectable && (
              <p>
                Content was excluded or is unsupported. See the analysis
                limitations below.
              </p>
            )}
            {selectedFile?.inspectable && !capturedDiff && (
              <p>{diffError || "Loading captured diff…"}</p>
            )}
            {capturedDiff && (
              <div className={styles.diff}>
                <CapturedDiff diff={capturedDiff} />
              </div>
            )}
            {(review.addedLinks.length > 0 ||
              review.removedLinks.length > 0) && (
              <details>
                <summary>Dependency changes</summary>
                <ul>
                  {[
                    ...review.addedLinks.map((link) => ({
                      ...link,
                      change: "+",
                    })),
                    ...review.removedLinks.map((link) => ({
                      ...link,
                      change: "−",
                    })),
                  ].map((link) => (
                    <li key={JSON.stringify(link)}>
                      {link.change} {link.source} → {link.target} (
                      {link.relation})
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {review.newCycles.length > 0 && (
              <details open>
                <summary>New cyclic groups</summary>
                <p>
                  These runtime-import groups are mutually reachable. Members
                  are listed alphabetically, not in execution order.
                </p>
                <ul>
                  {review.newCycles.map((group) => (
                    <li key={group.join("\0")}>{group.join(", ")}</li>
                  ))}
                </ul>
              </details>
            )}
            {review.issues.length > 0 && (
              <details>
                <summary>Analysis limitations ({review.issues.length})</summary>
                <p>
                  Results may be incomplete. An unresolved connection does not
                  establish that a dependency is absent.
                </p>
                <ul>
                  {review.issues.map((issue, i) => (
                    <li key={i}>
                      [{issue.snapshot}] {issue.path}: {issue.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        </>
      )}
    </main>
  );
}
