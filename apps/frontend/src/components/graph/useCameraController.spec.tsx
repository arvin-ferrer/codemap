import { renderHook, act } from "@testing-library/react";
import { useCameraController } from "./useCameraController";
import type { Quadtree } from "d3-quadtree";
import type { TickNode } from "./canvasRenderer";
it("sends drag lifecycle coordinates and supports pointer cancellation cleanup", () => {
  const canvas = document.createElement("canvas");
  canvas.setPointerCapture = jest.fn();
  canvas.releasePointerCapture = jest.fn();
  const node = {
    id: "a",
    name: "a",
    type: "ts",
    size: 1,
    lines: 1,
    x: 10,
    y: 20,
  };
  const post = jest.fn();
  const select = jest.fn();
  const props = {
    canvasRef: { current: canvas },
    quadtreeRef: {
      current: { find: () => node } as unknown as Quadtree<TickNode>,
    },
    tickDataRef: { current: { nodes: [node], links: [] } },
    postWorkerMessage: post,
    setSelectedNodeId: select,
  };
  const { result } = renderHook(() => useCameraController(props));
  const event = {
    clientX: 10,
    clientY: 20,
    pointerId: 1,
  } as React.PointerEvent<HTMLCanvasElement>;
  act(() => result.current.handlePointerDown(event));
  expect(select).toHaveBeenCalledWith("a");
  expect(post).toHaveBeenCalledWith({
    type: "DRAG_START",
    nodeId: "a",
    x: 10,
    y: 20,
  });
  act(() => result.current.handlePointerMove(event));
  expect(post).toHaveBeenCalledWith({
    type: "DRAG",
    nodeId: "a",
    x: 10,
    y: 20,
  });
  act(() => result.current.handlePointerUp(event));
  expect(post).toHaveBeenCalledWith({ type: "DRAG_END", nodeId: "a" });
  expect(result.current.draggedNodeIdRef.current).toBeNull();
});
