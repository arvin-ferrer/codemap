import { render, screen, fireEvent } from "@testing-library/react";
import GraphVisualizer from "./GraphVisualizer";
const post = jest.fn();
jest.mock("./graph/useGraphState", () => ({
  useGraphState: () => ({
    metadata: { nodes: [] },
    tickDataRef: { current: { nodes: [], links: [] } },
    quadtreeRef: { current: null },
    isLoading: false,
    error: null,
    postWorkerMessage: post,
  }),
}));
it("sizes the canvas for DPR and cleans up animation and resize observation", () => {
  const disconnect = jest.fn();
  global.ResizeObserver = jest.fn().mockImplementation((callback) => ({
    observe: () => callback([{ contentRect: { width: 400, height: 300 } }]),
    disconnect,
  }));
  const scale = jest.fn();
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({ scale } as unknown as CanvasRenderingContext2D);
  const request = jest
    .spyOn(window, "requestAnimationFrame")
    .mockReturnValue(123);
  const cancel = jest
    .spyOn(window, "cancelAnimationFrame")
    .mockImplementation(() => {});
  Object.defineProperty(window, "devicePixelRatio", {
    value: 2,
    configurable: true,
  });
  const { unmount } = render(<GraphVisualizer />);
  const canvas = screen.getByLabelText(/dependency graph canvas/);
  expect(canvas).toHaveAttribute("width", "800");
  expect(canvas).toHaveAttribute("height", "600");
  expect(post).toHaveBeenCalledWith({
    type: "UPDATE_DIMENSIONS",
    width: 400,
    height: 300,
  });
  fireEvent.keyDown(canvas, { key: "ArrowRight" });
  unmount();
  expect(disconnect).toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledWith(123);
  request.mockRestore();
  cancel.mockRestore();
  jest.restoreAllMocks();
});
