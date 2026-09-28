import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import SearchBar from "./SearchBar";
import type { CodeNode } from "@codemap/shared";

describe("SearchBar Component", () => {
  const mockNodes: CodeNode[] = [
    {
      id: "src/index.ts",
      name: "index.ts",
      type: "ts",
      lines: 1,
      size: 100,
    },
    {
      id: "src/components/Button.tsx",
      name: "Button.tsx",
      type: "ts",
      lines: 1,
      size: 200,
    },
  ];

  it("renders the search input", () => {
    render(<SearchBar nodes={mockNodes} onSelectNode={jest.fn()} />);
    expect(screen.getByPlaceholderText("Search files...")).toBeInTheDocument();
  });

  it("filters results based on query", () => {
    render(<SearchBar nodes={mockNodes} onSelectNode={jest.fn()} />);
    const input = screen.getByPlaceholderText("Search files...");

    fireEvent.change(input, { target: { value: "button" } });

    expect(screen.getByText("Button.tsx")).toBeInTheDocument();
    expect(screen.queryByText("index.ts")).not.toBeInTheDocument();
  });

  it("calls onSelectNode when a result is clicked", () => {
    const handleSelect = jest.fn();
    render(<SearchBar nodes={mockNodes} onSelectNode={handleSelect} />);
    const input = screen.getByPlaceholderText("Search files...");

    fireEvent.change(input, { target: { value: "index" } });

    const resultItem = screen.getByText("index.ts");
    fireEvent.click(resultItem);

    expect(handleSelect).toHaveBeenCalledWith("src/index.ts");
  });
});
