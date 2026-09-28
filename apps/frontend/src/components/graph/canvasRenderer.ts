import { CodeNode, CodeLink, ReviewData } from "@codemap/shared";

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
const edgeKey = (link: CodeLink) =>
  `${link.source}\0${link.target}\0${link.relation}`;
const edgeChanges = new WeakMap<
  ReviewData,
  { added: Set<string>; removed: Set<string> }
>();
const edgeLayers = new WeakMap<CanvasRenderingContext2D, HTMLCanvasElement>();

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
  review?: ReviewData,
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

  const left = -offsetX / scale;
  const top = -offsetY / scale;
  const right = (canvasWidth / dpr - offsetX) / scale;
  const bottom = (canvasHeight / dpr - offsetY) / scale;
  // Keep crossing edges and labels near the viewport, skip fully offscreen work.
  const visibleLinks = links.filter(
    (link) =>
      Math.max(link.sourceX, link.targetX) >= left &&
      Math.min(link.sourceX, link.targetX) <= right &&
      Math.max(link.sourceY, link.targetY) >= top &&
      Math.min(link.sourceY, link.targetY) <= bottom,
  );
  const visibleNodes = nodes.filter(
    (node) =>
      node.x >= left - 120 &&
      node.x <= right + 120 &&
      node.y >= top - 32 &&
      node.y <= bottom + 32,
  );
  // Thin graph edges need one sample per CSS pixel. Keep text/nodes at native DPR
  // while avoiding quadratic raster work for thousands of overlapping edges.
  if (dpr > 1 && visibleLinks.length > 500 && ctx.canvas?.ownerDocument) {
    let layer = edgeLayers.get(ctx);
    if (!layer) {
      layer = ctx.canvas.ownerDocument.createElement("canvas");
      edgeLayers.set(ctx, layer);
    }
    const width = Math.ceil(canvasWidth / dpr);
    const height = Math.ceil(canvasHeight / dpr);
    if (layer.width !== width) layer.width = width;
    if (layer.height !== height) layer.height = height;
    const edgeContext = layer.getContext("2d");
    if (edgeContext) {
      edgeContext.setTransform(1, 0, 0, 1, 0, 0);
      edgeContext.clearRect(0, 0, width, height);
      edgeContext.setTransform(scale, 0, 0, scale, offsetX, offsetY);
      drawLinks(edgeContext, visibleLinks, activeNodeId, review);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(layer, 0, 0, canvasWidth, canvasHeight);
      ctx.setTransform(
        scale * dpr,
        0,
        0,
        scale * dpr,
        offsetX * dpr,
        offsetY * dpr,
      );
    } else drawLinks(ctx, visibleLinks, activeNodeId, review);
  } else drawLinks(ctx, visibleLinks, activeNodeId, review);
  drawNodes(ctx, visibleNodes, activeNodeId, connectedNodeIds);
}

function drawLinks(
  ctx: CanvasRenderingContext2D,
  links: TickLink[],
  activeNodeId: string | null,
  review?: ReviewData,
): void {
  let changes = review && edgeChanges.get(review);
  if (review && !changes) {
    changes = {
      added: new Set(review.addedLinks.map(edgeKey)),
      removed: new Set(review.removedLinks.map(edgeKey)),
    };
    edgeChanges.set(review, changes);
  }
  const groups = new Map<
    string,
    {
      links: TickLink[];
      color: string;
      width: number;
      removed: boolean;
      label: string;
    }
  >();
  for (const link of links) {
    const isConnectedToActive =
      activeNodeId &&
      (link.source === activeNodeId || link.target === activeNodeId);
    const opacity = activeNodeId ? (isConnectedToActive ? 0.8 : 0.05) : 0.2;
    const lineWidth = activeNodeId ? (isConnectedToActive ? 2 : 0.8) : 0.8;

    const key = edgeKey(link);
    const isAdded = changes?.added.has(key);
    const isRemoved = changes?.removed.has(key) ?? false;
    const color = isAdded
      ? "#80d0b0"
      : isRemoved
        ? "#f5b76d"
        : `rgba(139, 148, 158, ${opacity})`;
    const groupKey = `${color}:${lineWidth}:${isRemoved}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        links: [],
        color,
        width: lineWidth / 1.5,
        removed: isRemoved,
        label: isAdded ? "+" : isRemoved ? "−" : "",
      };
      groups.set(groupKey, group);
    }
    group.links.push(link);
  }
  // Bound path complexity: very large overlapping paths rasterize poorly at high DPR.
  for (const group of groups.values()) {
    ctx.setLineDash(group.removed ? [5, 4] : []);
    ctx.strokeStyle = group.color;
    ctx.lineWidth = group.width;
    for (let start = 0; start < group.links.length; start += 16) {
      ctx.beginPath();
      for (const link of group.links.slice(start, start + 16)) {
        ctx.moveTo(link.sourceX, link.sourceY);
        ctx.lineTo(link.targetX, link.targetY);
      }
      ctx.stroke();
    }
    if (group.label) {
      ctx.fillStyle = group.color;
      ctx.font = "12px monospace";
      ctx.textAlign = "center";
      for (const link of group.links)
        ctx.fillText(
          group.label,
          (link.sourceX + link.targetX) / 2,
          (link.sourceY + link.targetY) / 2,
        );
    }
  }
  ctx.setLineDash([]);
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
