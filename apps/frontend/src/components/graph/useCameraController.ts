import { useEffect, useRef, useCallback } from "react";
import { WorkerMessageInbound } from "@codemap/shared";
import { TickNode, TickLink } from "./canvasRenderer";
import { Quadtree } from "d3-quadtree";

interface UseCameraControllerProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  quadtreeRef: React.MutableRefObject<Quadtree<TickNode> | null>;
  tickDataRef: React.MutableRefObject<{ nodes: TickNode[]; links: TickLink[] }>;
  postWorkerMessage: (msg: WorkerMessageInbound) => void;
  setSelectedNodeId: (id: string | null) => void;
}

export function useCameraController({
  canvasRef,
  quadtreeRef,
  tickDataRef,
  postWorkerMessage,
  setSelectedNodeId,
}: UseCameraControllerProps) {
  const offsetXRef = useRef(0);
  const offsetYRef = useRef(0);
  const scaleRef = useRef(1);
  const isPanningRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const hoveredNodeIdRef = useRef<string | null>(null);
  const draggedNodeIdRef = useRef<string | null>(null);

  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const mouseX = screenX - rect.left;
    const mouseY = screenY - rect.top;
    
    return {
      x: (mouseX - offsetXRef.current) / scaleRef.current,
      y: (mouseY - offsetYRef.current) / scaleRef.current
    };
  }, [canvasRef]);

  const panToNode = useCallback((nodeId: string) => {
    const node = tickDataRef.current.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    setSelectedNodeId(node.id);
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const targetScale = 2.0;
    scaleRef.current = targetScale;
    
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.width / dpr;
    const ch = canvas.height / dpr;
    
    offsetXRef.current = (cw / 2) - (node.x * targetScale);
    offsetYRef.current = (ch / 2) - (node.y * targetScale);
  }, [canvasRef, tickDataRef, setSelectedNodeId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault(); 
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const worldX = (mouseX - offsetXRef.current) / scaleRef.current;
      const worldY = (mouseY - offsetYRef.current) / scaleRef.current;

      const zoomFactor = 1.08;
      let newScale = scaleRef.current;
      if (e.deltaY < 0) {
        newScale = Math.min(newScale * zoomFactor, 8.0);
      } else {
        newScale = Math.max(newScale / zoomFactor, 0.1);
      }

      scaleRef.current = newScale;
      offsetXRef.current = mouseX - worldX * newScale;
      offsetYRef.current = mouseY - worldY * newScale;
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [canvasRef]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.setPointerCapture(e.pointerId);
    }

    const { x, y } = screenToWorld(e.clientX, e.clientY);
    const SEARCH_RADIUS = 15 / scaleRef.current; 
    const clickedNode = quadtreeRef.current?.find(x, y, SEARCH_RADIUS);

    if (clickedNode) {
      draggedNodeIdRef.current = clickedNode.id;
      setSelectedNodeId(clickedNode.id);
      postWorkerMessage({
        type: "DRAG_START",
        nodeId: clickedNode.id,
        x,
        y,
      });
    } else {
      setSelectedNodeId(null);
      isPanningRef.current = true;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = screenToWorld(e.clientX, e.clientY);

    if (draggedNodeIdRef.current) {
      postWorkerMessage({
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
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      offsetXRef.current += dx;
      offsetYRef.current += dy;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.releasePointerCapture(e.pointerId);
    }

    if (draggedNodeIdRef.current) {
      postWorkerMessage({
        type: "DRAG_END",
        nodeId: draggedNodeIdRef.current,
      });
      draggedNodeIdRef.current = null;
    }
    isPanningRef.current = false;
  };

  return {
    offsetXRef,
    offsetYRef,
    scaleRef,
    hoveredNodeIdRef,
    draggedNodeIdRef,
    panToNode,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
