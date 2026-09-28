import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ReviewWorkspace from "./ReviewWorkspace";
import { reviewApi } from "./api";
import type { GraphDataResponse, ReviewData } from "@codemap/shared";
jest.mock("./api", () => ({ reviewApi: jest.fn() }));
jest.mock("../GraphVisualizer", () => ({
  __esModule: true,
  default: ({ graph }: { graph: GraphDataResponse }) => (
    <div data-testid="dependency-map">
      {graph.nodes.map((node) => node.id).join(", ")}
    </div>
  ),
}));
const data: ReviewData = {
  id: "one",
  capturedAt: "2026-09-28T00:00:00Z",
  baseRef: "main",
  baseCommit: "abc",
  headCommit: "def",
  initialScope: [],
  files: [
    { path: "src/a.ts", status: "modified", inspectable: true },
    { path: "src-extra/b.ts", status: "deleted", inspectable: true },
  ],
  graph: { nodes: [], links: [] },
  addedLinks: [],
  removedLinks: [],
  newCycles: [],
  issues: [
    { path: "src/a.ts", message: "Unresolved import.", snapshot: "current" },
  ],
};
describe("ReviewWorkspace", () => {
  beforeEach(() => {
    jest.mocked(reviewApi).mockReset();
    jest.mocked(reviewApi).mockImplementation(async (route) =>
      route.startsWith("/diff")
        ? {
            reviewId: "one",
            path: "src-extra/b.ts",
            before: "old source",
            after: "",
          }
        : data,
    );
  });
  it("starts without inferred scope and applies folder boundaries", async () => {
    render(<ReviewWorkspace />);
    expect(await screen.findByText("Scope not set")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("src/"));
    fireEvent.click(screen.getByRole("button", { name: "Set expected scope" }));
    expect(screen.getByText("1 outside expected scope")).toBeInTheDocument();
    expect(screen.getByText("Analysis limitations (1)")).toBeInTheDocument();
  });
  it("opens a deleted file from captured content and preserves scope across refresh", async () => {
    render(<ReviewWorkspace />);
    await screen.findByText("Scope not set");
    fireEvent.click(screen.getByLabelText("src/"));
    fireEvent.click(screen.getByText("Set expected scope"));
    fireEvent.click(
      screen.getByRole("button", { name: /deleted src-extra\/b.ts/ }),
    );
    expect(
      await screen.findByLabelText("Captured text diff"),
    ).toHaveTextContent("- old source");
    fireEvent.click(screen.getByRole("button", { name: "Refresh snapshot" }));
    await waitFor(() =>
      expect(reviewApi).toHaveBeenCalledWith("/refresh", { method: "POST" }),
    );
    expect(screen.getByText("1 outside expected scope")).toBeInTheDocument();
  });
  it("reports startup failure with an actionable CLI instruction", async () => {
    jest.mocked(reviewApi).mockRejectedValue(new Error("Session expired"));
    render(<ReviewWorkspace />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Session expired",
    );
  });
  it("includes dependency changes caused by configuration-only edits", async () => {
    const addedLink = {
      source: "a.ts",
      target: "new.ts",
      relation: "static-import" as const,
    };
    const removedLink = {
      source: "a.ts",
      target: "old.ts",
      relation: "static-import" as const,
    };
    jest.mocked(reviewApi).mockResolvedValue({
      ...data,
      files: [{ path: "tsconfig.json", status: "modified", inspectable: true }],
      graph: {
        nodes: ["tsconfig.json", "a.ts", "old.ts", "new.ts"].map((id) => ({
          id,
          name: id,
          type: "ts",
          size: 1,
          lines: 1,
        })),
        links: [addedLink, removedLink],
      },
      addedLinks: [addedLink],
      removedLinks: [removedLink],
    });
    render(<ReviewWorkspace />);
    const map = await screen.findByTestId("dependency-map");
    expect(map).toHaveTextContent("tsconfig.json, a.ts, old.ts, new.ts");
  });
});
