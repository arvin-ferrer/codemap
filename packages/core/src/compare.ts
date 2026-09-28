import type { CodeLink, GraphDataResponse } from "@codemap/shared";

const edgeKey = (edge: CodeLink) =>
  JSON.stringify([edge.source, edge.target, edge.relation]);
/** Iterative Kosaraju avoids recursion overflow on long import chains. */
export function cyclicGroups(graph: GraphDataResponse): string[][] {
  const forward = new Map(graph.nodes.map((n) => [n.id, [] as string[]]));
  const reverse = new Map(graph.nodes.map((n) => [n.id, [] as string[]]));
  const self = new Set<string>();
  for (const edge of graph.links) {
    if (edge.relation === "type-import") continue;
    forward.get(edge.source)?.push(edge.target);
    reverse.get(edge.target)?.push(edge.source);
    if (edge.source === edge.target) self.add(edge.source);
  }
  const seen = new Set<string>();
  const order: string[] = [];
  for (const id of forward.keys()) {
    if (seen.has(id)) continue;
    const stack: [string, boolean][] = [[id, false]];
    while (stack.length) {
      const [node, exiting] = stack.pop()!;
      if (exiting) {
        order.push(node);
        continue;
      }
      if (seen.has(node)) continue;
      seen.add(node);
      stack.push([node, true]);
      for (const next of forward.get(node) ?? [])
        if (!seen.has(next)) stack.push([next, false]);
    }
  }
  seen.clear();
  const groups: string[][] = [];
  for (const id of order.reverse()) {
    if (seen.has(id)) continue;
    const group: string[] = [];
    const stack = [id];
    seen.add(id);
    while (stack.length) {
      const node = stack.pop()!;
      group.push(node);
      for (const next of reverse.get(node) ?? [])
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
    }
    if (group.length > 1 || self.has(id)) groups.push(group.sort());
  }
  return groups.sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );
}
export function compareGraphs(
  before: GraphDataResponse,
  after: GraphDataResponse,
) {
  const previous = new Set(before.links.map(edgeKey));
  const current = new Set(after.links.map(edgeKey));
  const oldGroups = new Map<string, number>();
  cyclicGroups(before).forEach((group, index) =>
    group.forEach((id) => oldGroups.set(id, index)),
  );
  const oldSelfEdges = new Set(
    before.links
      .filter((e) => e.source === e.target && e.relation !== "type-import")
      .map((e) => e.source),
  );
  return {
    addedLinks: after.links.filter((e) => !previous.has(edgeKey(e))),
    removedLinks: before.links.filter((e) => !current.has(edgeKey(e))),
    newCycles: cyclicGroups(after).filter((group) =>
      group.length === 1
        ? !oldSelfEdges.has(group[0])
        : !oldGroups.has(group[0]) ||
          group.some((id) => oldGroups.get(id) !== oldGroups.get(group[0])),
    ),
  };
}
