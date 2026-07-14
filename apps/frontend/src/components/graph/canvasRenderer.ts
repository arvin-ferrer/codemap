import { CodeNode, CodeLink } from "@codemap/shared";

export interface TickNode extends CodeNode {
  x: number;
  y: number;
}

export interface TickLink extends CodeLink {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

const EXTENSION_COLORS: Record<string, string> = {
  ts: "#3178c6",
  tsx: "#61dafb",
  js: "#f7df1e",
  jsx: "#f7df1e",
  py: "#3776ab",
  go: "#00add8",
  rs: "#dea584",
  json: "#6d8086",
  css: "#264de4",
  html: "#e34c26",
};

const DEFAULT_NODE_COLOR = "#8b949e";

function getNodeColor(fileType: string): string {
  return EXTENSION_COLORS[fileType] ?? DEFAULT_NODE_COLOR;
}

export function getNodeRadius(size: number): number {
  const MIN_RADIUS = 4;
  const MAX_RADIUS = 16;
  const scaleFactor = Math.log2(Math.max(size, 1)) / 15;
  return Math.min(
    MAX_RADIUS,
    Math.max(MIN_RADIUS, MIN_RADIUS + scaleFactor * (MAX_RADIUS - MIN_RADIUS)),
  );
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  nodes: TickNode[],
  links: TickLink[],
  canvasWidth: number,
  canvasHeight: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  dpr: number,
  activeNodeId: string | null,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.setTransform(
    scale * dpr,
    0,
    0,
    scale * dpr,
    offsetX * dpr,
    offsetY * dpr,
  );

  const connectedNodeIds = new Set<string>();
  if (activeNodeId) {
    connectedNodeIds.add(activeNodeId);
    for (const link of links) {
      if (link.source === activeNodeId) connectedNodeIds.add(link.target);
      if (link.target === activeNodeId) connectedNodeIds.add(link.source);
    }
  }

  drawLinks(ctx, links, activeNodeId);
  drawNodes(ctx, nodes, activeNodeId, connectedNodeIds);
}

function drawLinks(
  ctx: CanvasRenderingContext2D,
  links: TickLink[],
  activeNodeId: string | null,
): void {
  for (const link of links) {
    const isConnectedToActive =
      activeNodeId &&
      (link.source === activeNodeId || link.target === activeNodeId);
    const opacity = activeNodeId ? (isConnectedToActive ? 0.8 : 0.05) : 0.2;
    const lineWidth = activeNodeId ? (isConnectedToActive ? 2 : 0.8) : 0.8;

    ctx.strokeStyle = `rgba(139, 148, 158, ${opacity})`;
    ctx.lineWidth = lineWidth / 1.5;

    ctx.beginPath();
    ctx.moveTo(link.sourceX, link.sourceY);
    ctx.lineTo(link.targetX, link.targetY);
    ctx.stroke();
  }
}

function drawNodes(
  ctx: CanvasRenderingContext2D,
  nodes: TickNode[],
  activeNodeId: string | null,
  connectedNodeIds: Set<string>,
): void {
  for (const node of nodes) {
    const radius = getNodeRadius(node.size);
    const color = getNodeColor(node.type);

    const isConnected = activeNodeId ? connectedNodeIds.has(node.id) : true;
    ctx.globalAlpha = isConnected ? 1.0 : 0.2;

    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    if (node.id === activeNodeId) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    }
  }

  ctx.fillStyle = "#c9d1d9";
  ctx.font = "10px var(--font-geist-mono, monospace)";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  for (const node of nodes) {
    const radius = getNodeRadius(node.size);
    const isConnected = activeNodeId ? connectedNodeIds.has(node.id) : true;
    ctx.globalAlpha = isConnected ? 1.0 : 0.2;
    ctx.fillText(node.name, node.x, node.y + radius + 3);
  }

  ctx.globalAlpha = 1.0;
}
