import { drawFrame, getNodeRadius } from "./canvasRenderer";
import type { ReviewData } from "@codemap/shared";
describe("canvas renderer", () => {
  it("keeps viewport-crossing edges and batches visible edges with the same style", () => {
    const ctx = Object.fromEntries(
      [
        "setTransform",
        "clearRect",
        "setLineDash",
        "beginPath",
        "moveTo",
        "lineTo",
        "stroke",
        "fillText",
        "arc",
        "fill",
      ].map((name) => [name, jest.fn()]),
    ) as unknown as CanvasRenderingContext2D;
    const link = (sourceX: number, targetX: number) => ({
      source: "a",
      target: "b",
      relation: "static-import" as const,
      sourceX,
      targetX,
      sourceY: 50,
      targetY: 50,
    });
    drawFrame(
      ctx,
      [
        {
          id: "far",
          name: "far",
          type: "ts",
          size: 1,
          lines: 1,
          x: 5000,
          y: 5000,
        },
      ],
      [link(-100, 1000), link(10, 50), link(-100, -50)],
      800,
      600,
      1,
      0,
      0,
      1,
      null,
    );
    expect(ctx.moveTo).toHaveBeenCalledWith(-100, 50);
    expect(ctx.moveTo).toHaveBeenCalledTimes(2);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect(ctx.arc).not.toHaveBeenCalled();
  });
  it("clears device pixels and distinguishes added and removed edges without color alone", () => {
    const ctx = {
      setTransform: jest.fn(),
      clearRect: jest.fn(),
      setLineDash: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
      fillText: jest.fn(),
      arc: jest.fn(),
      fill: jest.fn(),
    } as unknown as CanvasRenderingContext2D;
    const added = {
      source: "a",
      target: "b",
      relation: "static-import" as const,
    };
    const removed = {
      source: "b",
      target: "a",
      relation: "static-import" as const,
    };
    const links = [added, removed].map((l) => ({
      ...l,
      sourceX: 0,
      sourceY: 0,
      targetX: 100,
      targetY: 100,
    }));
    drawFrame(ctx, [], links, 800, 600, 1, 0, 0, 2, null, {
      addedLinks: [added],
      removedLinks: [removed],
    } as ReviewData);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
    expect(ctx.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);
    expect(ctx.setLineDash).toHaveBeenCalledWith([5, 4]);
    expect(ctx.fillText).toHaveBeenCalledWith("+", 50, 50);
    expect(ctx.fillText).toHaveBeenCalledWith("−", 50, 50);
    expect(getNodeRadius(0)).toBe(4);
    expect(getNodeRadius(10000000)).toBe(16);
  });
});
