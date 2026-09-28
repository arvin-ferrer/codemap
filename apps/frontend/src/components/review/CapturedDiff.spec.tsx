import { render, screen } from "@testing-library/react";
import CapturedDiff, { diffLines } from "./CapturedDiff";
it("renders additions, deletions and literal untrusted text", () => {
  expect(diffLines("first\nold\nlast", "first\nnew\nlast")).toEqual([
    "@@ baseline line 1 / current line 1 @@",
    "  first",
    "- old",
    "+ new",
    "  last",
  ]);
  render(
    <CapturedDiff
      diff={{
        reviewId: "one",
        path: "a.ts",
        before: "<script>old</script>",
        after: "",
      }}
    />,
  );
  expect(screen.getByLabelText("Captured text diff")).toHaveTextContent(
    "- <script>old</script>",
  );
  expect(document.querySelector("script")).toBeNull();
});
