import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  transpilePackages: ["d3-quadtree", "d3-force"],
};

export default nextConfig;
