import { useEffect, useRef, useState, useCallback } from "react";
import { quadtree, Quadtree } from "d3-quadtree";
import { CodeNode, CodeLink, WorkerMessageInbound, WorkerMessageOutbound } from "@codemap/shared";
import { TickNode, TickLink } from "./canvasRenderer";

export function useGraphState() {
  const workerRef = useRef<Worker | null>(null);
  
  const baseNodesRef = useRef<CodeNode[]>([]);
  const baseLinksRef = useRef<CodeLink[]>([]);

  const tickDataRef = useRef<{ nodes: TickNode[]; links: TickLink[] }>({
    nodes: [],
    links: [],
  });
  
  const quadtreeRef = useRef<Quadtree<TickNode> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const worker = new Worker(
      new URL("../../workers/simulation.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerMessageOutbound>) => {
      const msg = event.data;
      if (msg.type === "INIT_DONE") {
        setIsLoading(false);
      } else if (msg.type === "TICK") {
        const positions = msg.positions;
        const currentNodes = baseNodesRef.current;
        const currentLinks = baseLinksRef.current;
        
        const nextNodes: TickNode[] = new Array(currentNodes.length);
        for (let i = 0; i < currentNodes.length; i++) {
          nextNodes[i] = {
            ...currentNodes[i],
            x: positions[i * 2],
            y: positions[i * 2 + 1],
          };
        }

        const nodesById = new Map(nextNodes.map(n => [n.id, n]));
        const nextLinks: TickLink[] = currentLinks.map(l => {
          const source = nodesById.get(l.source);
          const target = nodesById.get(l.target);
          return {
            ...l,
            sourceX: source?.x ?? 0,
            sourceY: source?.y ?? 0,
            targetX: target?.x ?? 0,
            targetY: target?.y ?? 0,
          };
        });

        tickDataRef.current = { nodes: nextNodes, links: nextLinks };
        
        quadtreeRef.current = quadtree<TickNode>()
          .x((d) => d.x)
          .y((d) => d.y)
          .addAll(nextNodes);
      }
    };

    fetch("/api/graph")
      .then((res) => {
        if (!res.ok) throw new Error(`API responded with ${res.status}`);
        return res.json();
      })
      .then((data: { nodes: CodeNode[]; links: CodeLink[] }) => {
        baseNodesRef.current = data.nodes;
        baseLinksRef.current = data.links;
        worker.postMessage({ type: "INIT", nodes: data.nodes, links: data.links } as WorkerMessageInbound);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to fetch graph data");
        setIsLoading(false);
      });

    return () => {
      worker.terminate();
    };
  }, []);

  const postWorkerMessage = useCallback((msg: WorkerMessageInbound) => {
    workerRef.current?.postMessage(msg);
  }, []);

  return { tickDataRef, quadtreeRef, isLoading, error, postWorkerMessage };
}
