"use client";

import type { GraphDataResponse, ReviewData } from "@codemap/shared";
import React, { useEffect, useRef, useState, useCallback } from "react";
import styles from "./GraphVisualizer.module.css";
import SidePanel from "./SidePanel";
import SearchBar from "./SearchBar";

import { useGraphState } from "./graph/useGraphState";
import { useCameraController } from "./graph/useCameraController";
import { drawFrame } from "./graph/canvasRenderer";

interface Props {
  graph?: GraphDataResponse;
  review?: ReviewData;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}
export default function GraphVisualizer({
  graph,
  review,
  selectedId,
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logicalSizeRef = useRef({ width: 0, height: 0 });
  const animFrameRef = useRef<number>(0);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const {
    metadata,
    tickDataRef,
    quadtreeRef,
    isLoading,
    error,
    postWorkerMessage,
  } = useGraphState(graph);
  const select = useCallback(
    (id: string | null) => {
      setSelectedNodeId(id);
      onSelect?.(id);
    },
    [onSelect],
  );

  const {
    offsetXRef,
    offsetYRef,
    scaleRef,
    hoveredNodeIdRef,
    draggedNodeIdRef,
    panToNode,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useCameraController({
    canvasRef,
    quadtreeRef,
    tickDataRef,
    postWorkerMessage,
    setSelectedNodeId: select,
  });

  const renderLoop = useCallback(
    function renderLoop() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      // Moving between monitors or browser zoom can change DPR without a resize.
      const pixelWidth = Math.round(logicalSizeRef.current.width * dpr);
      const pixelHeight = Math.round(logicalSizeRef.current.height * dpr);
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      const { nodes, links } = tickDataRef.current;

      const activeNodeId =
        draggedNodeIdRef.current ||
        hoveredNodeIdRef.current ||
        (selectedId !== undefined ? selectedId : selectedNodeId);
      drawFrame(
        ctx,
        nodes,
        links,
        canvas.width,
        canvas.height,
        scaleRef.current,
        offsetXRef.current,
        offsetYRef.current,
        dpr,
        activeNodeId,
        review,
      );

      animFrameRef.current = requestAnimationFrame(renderLoop);
    },
    [
      tickDataRef,
      selectedId,
      selectedNodeId,
      review,
      scaleRef,
      offsetXRef,
      offsetYRef,
      draggedNodeIdRef,
      hoveredNodeIdRef,
    ],
  );

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [renderLoop]);

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        logicalSizeRef.current = { width, height };
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

        postWorkerMessage({
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
  }, [postWorkerMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const PAN_STEP = 50 / scaleRef.current;
    switch (e.key) {
      case "ArrowUp":
        offsetYRef.current += PAN_STEP;
        break;
      case "ArrowDown":
        offsetYRef.current -= PAN_STEP;
        break;
      case "ArrowLeft":
        offsetXRef.current += PAN_STEP;
        break;
      case "ArrowRight":
        offsetXRef.current -= PAN_STEP;
        break;
      case "+":
      case "=":
        scaleRef.current = Math.min(scaleRef.current * 1.2, 8.0);
        break;
      case "-":
      case "_":
        scaleRef.current = Math.max(scaleRef.current / 1.2, 0.1);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  return (
    <div className={styles.container} ref={containerRef}>
      {isLoading && <div className={styles.overlay}>Loading graph…</div>}
      {error && <div className={styles.overlay}>Error: {error}</div>}
      {!review && (
        <SidePanel
          nodeId={selectedNodeId}
          nodes={tickDataRef.current.nodes}
          links={tickDataRef.current.links}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
      <SearchBar nodes={metadata.nodes} onSelectNode={panToNode} />
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{
          width: dimensions.width,
          height: dimensions.height,
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        aria-label="Codebase dependency graph canvas. Use arrow keys to pan, plus/minus to zoom."
      />
    </div>
  );
}
