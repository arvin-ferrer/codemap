"use client";

import React, { useEffect, useRef, useCallback, useState } from "react";
import styles from "./GraphVisualizer.module.css";
import {quadtree, Quadtree} from 'd3-quadtree';
/* ------------------------------------------------------------------ */
/*  Types for data coming back from the simulation worker              */
/* ------------------------------------------------------------------ */

interface TickNode {
  id: string;
  name: string;
  type: string;
  size: number;
  x: number;
  y: number;
}

interface TickLink {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  relation: string;
}

interface TickPayload {
  type: "TICK";
  nodes: TickNode[];
  links: TickLink[];
}

/* ------------------------------------------------------------------ */
/*  Color mapping by file extension                                    */
/* ------------------------------------------------------------------ */

const EXTENSION_COLORS: Record<string, string> = {
  ts:   "#3178c6",
  tsx:  "#61dafb",
  js:   "#f7df1e",
  jsx:  "#f7df1e",
  py:   "#3776ab",
  go:   "#00add8",
  rs:   "#dea584",
  json: "#6d8086",
  css:  "#264de4",
  html: "#e34c26",
};

const DEFAULT_NODE_COLOR = "#8b949e";

function getNodeColor(fileType: string): string {
  return EXTENSION_COLORS[fileType] ?? DEFAULT_NODE_COLOR;
}

/** Scales node radius based on file size (clamped between 4–16px). */
function getNodeRadius(size: number): number {
  const MIN_RADIUS = 4;
  const MAX_RADIUS = 16;
  const scaleFactor = Math.log2(Math.max(size, 1)) / 15;
  return Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, MIN_RADIUS + scaleFactor * (MAX_RADIUS - MIN_RADIUS)));
}

/* ------------------------------------------------------------------ */
/*  Canvas Drawing                                                     */
/* ------------------------------------------------------------------ */

function drawFrame(
  ctx: CanvasRenderingContext2D,
  nodes: TickNode[],
  links: TickLink[],
  canvasWidth: number,
  canvasHeight: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  dpr: number
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);       // reset to identity (physical pixels)
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);         // clear the FULL physical canvas
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, offsetX * dpr, offsetY * dpr);  // now apply camera + DPR scale

  drawLinks(ctx, links);
  drawNodes(ctx, nodes);
}

function drawLinks(ctx: CanvasRenderingContext2D, links: TickLink[]): void {
  ctx.strokeStyle = "rgba(139, 148, 158, 0.2)";
  ctx.lineWidth = 0.8;

  ctx.beginPath();
  for (const link of links) {
    ctx.moveTo(link.sourceX, link.sourceY);
    ctx.lineTo(link.targetX, link.targetY);
  }
  ctx.stroke();
}

function drawNodes(ctx: CanvasRenderingContext2D, nodes: TickNode[]): void {
  for (const node of nodes) {
    const radius = getNodeRadius(node.size);
    const color = getNodeColor(node.type);

    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Draw labels in a second pass so they render on top of all circles
  ctx.fillStyle = "#c9d1d9";
  ctx.font = "10px var(--font-geist-mono, monospace)";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  for (const node of nodes) {
    const radius = getNodeRadius(node.size);
    ctx.fillText(node.name, node.x, node.y + radius + 3);
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function GraphVisualizer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const animFrameRef = useRef<number>(0);

  const quadtreeRef = useRef<Quadtree<TickNode> | null>(null);
  const hoveredNodeIdRef = useRef<string | null>(null);
  const draggedNodeIdRef = useRef<string | null>(null);

  // Store latest tick data in a ref so the rAF loop can read it without re-renders
  const tickDataRef = useRef<{ nodes: TickNode[]; links: TickLink[] }>({
    nodes: [],
    links: [],
  });
  const offsetXRef = useRef(0);
  const offsetYRef = useRef(0);
  const scaleRef = useRef(1);
  const isPanningRef = useRef(false);
  const lastMouseRef = useRef({x:0, y:0});

  
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ---- requestAnimationFrame render loop ---- */
  const renderLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { nodes, links } = tickDataRef.current;
    
    drawFrame(
      ctx,
      nodes,
      links,
      canvas.width,
      canvas.height,
      scaleRef.current,
      offsetXRef.current,
      offsetYRef.current,
      dpr
    );

    animFrameRef.current = requestAnimationFrame(renderLoop);
  }, []);



  /* ---- Set up Worker + fetch graph data ---- */
  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/simulation.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<TickPayload>) => {
      if (event.data.type === "TICK") {
        tickDataRef.current = {
          nodes: event.data.nodes,
          links: event.data.links,
        };
        
        quadtreeRef.current = quadtree<TickNode>()
          .x((d) => d.x)
          .y((d) => d.y)
          .addAll(event.data.nodes);
      }
    };

    // Fetch graph data from the backend and send it to the worker
    fetch("/api/graph")
      .then((res) => {
        if (!res.ok) throw new Error(`API responded with ${res.status}`);
        return res.json();
      })
      .then((data: { nodes: any[]; links: any[] }) => {
        worker.postMessage({ type: "INIT", nodes: data.nodes, links: data.links });
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to fetch graph data");
        setIsLoading(false);
      });

    // Start the rAF render loop
    animFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      worker.terminate();
    };
  }, [renderLoop]);

  /* ---- Handle Canvas Resizing (DPI Scaling) ---- */
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });

        const dpr = window.devicePixelRatio || 1;
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = width * dpr;
          canvas.height = height * dpr;

          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.scale(dpr, dpr);
          }
        }

        workerRef.current?.postMessage({
          type: "UPDATE_DIMENSIONS",
          width,
          height,
        });
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Add scroll-to-zoom (zooming relative to cursor position)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault(); // Stop entire page from scrolling

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // 1. Convert screen coordinates to world coordinates (pre-zoom)
      const worldX = (mouseX - offsetXRef.current) / scaleRef.current;
      const worldY = (mouseY - offsetYRef.current) / scaleRef.current;

      // 2. Compute new scale (clamped between 0.1x and 8x)
      const zoomFactor = 1.08;
      let newScale = scaleRef.current;
      if (e.deltaY < 0) {
        newScale = Math.min(newScale * zoomFactor, 8.0);
      } else {
        newScale = Math.max(newScale / zoomFactor, 0.1);
      }

      scaleRef.current = newScale;1

      // 3. Adjust offsets so the world coordinate point stays directly under the mouse cursor
      offsetXRef.current = mouseX - worldX * newScale;
      offsetYRef.current = mouseY - worldY * newScale;
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, []);

  const screenToWorld = (screenX: number, screenY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const mouseX = screenX - rect.left;
    const mouseY = screenY - rect.top;
    
    return {
      x: (mouseX - offsetXRef.current) / scaleRef.current,
      y: (mouseY - offsetYRef.current) / scaleRef.current
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = screenToWorld(e.clientX, e.clientY);
    
    const SEARCH_RADIUS = 15 / scaleRef.current; 
    const clickedNode = quadtreeRef.current?.find(x, y, SEARCH_RADIUS);

    if (clickedNode) {
      draggedNodeIdRef.current = clickedNode.id;
      workerRef.current?.postMessage({
        type: "DRAG_START",
        nodeId: clickedNode.id,
        x,
        y,
      });
    } else {
      isPanningRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = screenToWorld(e.clientX, e.clientY);

    if (draggedNodeIdRef.current) {
      workerRef.current?.postMessage({
        type: "DRAG",
        nodeId: draggedNodeIdRef.current,
        x,
        y,
      });
      return;
    }

    const SEARCH_RADIUS = 15 / scaleRef.current;
    const hoveredNode = quadtreeRef.current?.find(x, y, SEARCH_RADIUS);
    hoveredNodeIdRef.current = hoveredNode ? hoveredNode.id : null;
    
    if (canvasRef.current) {
      canvasRef.current.style.cursor = hoveredNode ? "pointer" : (isPanningRef.current ? "grabbing" : "default");
    }

    if (isPanningRef.current) {
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      offsetXRef.current += dx;
      offsetYRef.current += dy;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseUp = () => {
    if (draggedNodeIdRef.current) {
      workerRef.current?.postMessage({
        type: "DRAG_END",
        nodeId: draggedNodeIdRef.current,
      });
      draggedNodeIdRef.current = null;
    }
    isPanningRef.current = false;
  };
  
  return (
    <div className={styles.container} ref={containerRef}>
      {isLoading && <div className={styles.overlay}>Loading graph…</div>}
      {error && <div className={styles.overlay}>Error: {error}</div>}
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ width: dimensions.width, height: dimensions.height }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    </div>
  );
}
