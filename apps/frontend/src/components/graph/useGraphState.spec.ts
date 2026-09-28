import { renderHook, waitFor, act } from "@testing-library/react";
import { useGraphState } from "./useGraphState";

describe("useGraphState Hook", () => {
  let mockWorker: Worker;
  let postMessageMock: jest.Mock;
  let terminateMock: jest.Mock;

  beforeEach(() => {
    postMessageMock = jest.fn();
    terminateMock = jest.fn();

    // @ts-expect-error - Mocking the Web Worker globally
    global.Worker = class {
      onmessage: ((this: Worker, ev: MessageEvent) => unknown) | null = null;
      postMessage = postMessageMock;
      terminate = terminateMock;

      constructor() {
        mockWorker = this as unknown as Worker;
      }
    };

    // Mock fetch API
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ nodes: [{ id: "1" }], links: [] }),
      }),
    ) as jest.Mock;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("fetches graph data and initializes the worker", async () => {
    const { result } = renderHook(() => useGraphState());

    expect(result.current.isLoading).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/graph",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await waitFor(() => {
      expect(postMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: "INIT" }),
      );
    });

    // Simulate worker INIT_DONE
    act(() => {
      mockWorker.onmessage?.({ data: { type: "INIT_DONE" } } as MessageEvent);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it("handles TICK messages and updates state", async () => {
    const { result } = renderHook(() => useGraphState());

    // Wait for fetch to complete
    await waitFor(() => {
      expect(postMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: "INIT" }),
      );
    });

    // Send a TICK message from the mocked worker
    // Using Float32Array to mimic the real worker (1 node = 2 floats: x, y)
    const positions = new Float32Array([100, 200]);
    act(() => {
      mockWorker.onmessage?.({
        data: { type: "TICK", positions },
      } as MessageEvent);
    });

    await waitFor(() => {
      expect(result.current.tickDataRef.current.nodes).toHaveLength(1);
      expect(result.current.tickDataRef.current.nodes[0].x).toBe(100);
      expect(result.current.tickDataRef.current.nodes[0].y).toBe(200);
    });
  });

  it("publishes metadata before ticks and avoids React renders on coordinate updates", () => {
    const graph = {
      nodes: [{ id: "a.ts", name: "a.ts", type: "ts", size: 1, lines: 1 }],
      links: [],
    };
    let renders = 0;
    const { result, unmount } = renderHook(() => {
      renders++;
      return useGraphState(graph);
    });
    expect(result.current.metadata.nodes).toEqual(graph.nodes);
    expect(global.fetch).not.toHaveBeenCalled();
    const before = renders;
    act(() => {
      mockWorker.onmessage?.({
        data: { type: "TICK", positions: new Float32Array([4, 5]) },
      } as MessageEvent);
    });
    expect(renders).toBe(before);
    expect(result.current.tickDataRef.current.nodes[0].x).toBe(4);
    unmount();
    expect(terminateMock).toHaveBeenCalled();
  });

  it("reports worker failure instead of loading forever", () => {
    const graph = { nodes: [], links: [] };
    const { result } = renderHook(() => useGraphState(graph));
    act(() => {
      mockWorker.onerror?.({} as ErrorEvent);
    });
    expect(result.current.error).toContain("layout failed");
    expect(result.current.isLoading).toBe(false);
  });
});
