import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeMap – Interactive Codebase Visualizer",
  description:
    "Explore your codebase as an interactive dependency graph with AI-powered architectural queries.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
