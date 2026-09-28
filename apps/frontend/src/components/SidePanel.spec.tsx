import { render, screen, fireEvent } from "@testing-library/react";
import SidePanel from "./SidePanel";
it("shows directed imports and closes the inspector", () => {
  const nodes = ["a", "b"].map((id) => ({
    id,
    name: id + ".ts",
    type: "ts",
    size: 1024,
    lines: 1,
    x: 0,
    y: 0,
  }));
  const links = [
    {
      source: "a",
      target: "b",
      relation: "static-import" as const,
      sourceX: 0,
      sourceY: 0,
      targetX: 0,
      targetY: 0,
    },
  ];
  const close = jest.fn();
  render(<SidePanel nodeId="a" nodes={nodes} links={links} onClose={close} />);
  expect(screen.getByText("Imports (1)")).toBeInTheDocument();
  expect(screen.getByText("Imported By (0)")).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Close inspector panel" }),
  );
  expect(close).toHaveBeenCalled();
});
