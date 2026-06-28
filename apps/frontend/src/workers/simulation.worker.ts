/**
 * Web Worker: D3 Force-Directed Graph Simulation
 *
 * Runs all physics calculations off the main thread.
 * Communicates with the main thread via a typed postMessage protocol.
 *
 * Inbound messages:  INIT, UPDATE_DIMENSIONS, DRAG_START, DRAG, DRAG_END
 * Outbound messages: TICK (node/link positions each frame)
 */

import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";


/** Extends the shared CodeNode with D3's mutable simulation fields. */
interface SimNode extends SimulationNodeDatum {
  id: string;
  name: string;
  type: string;
  size: number;
  lines: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

/** Link after D3 resolves source/target from string IDs to object refs. */
interface SimLink extends SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
  relation: string;
}

/** Messages the main thread can send to this worker. */
type InboundMessage =
  | { type: "INIT"; nodes: SimNode[]; links: SimLink[] }
  | { type: "UPDATE_DIMENSIONS"; width: number; height: number }
  | { type: "DRAG_START"; nodeId: string; x: number; y: number }
  | { type: "DRAG"; nodeId: string; x: number; y: number }
  | { type: "DRAG_END"; nodeId: string };

let simulation: Simulation<SimNode, SimLink> | null = null;
let nodes: SimNode[] = [];
let links: SimLink[] = [];
let width = 0;
let height = 0;

const CHARGE_STRENGTH = -200;
const LINK_DISTANCE = 80;
const COLLISION_RADIUS = 15;
const ALPHA_DECAY = 0.02;
const VELOCITY_DECAY = 0.4;

/** Creates and starts the D3 force simulation with all configured forces. */
function createSimulation(): Simulation<SimNode, SimLink> {
  const sim = forceSimulation<SimNode>(nodes)
    .alphaDecay(ALPHA_DECAY)
    .velocityDecay(VELOCITY_DECAY)
    .force("charge", forceManyBody<SimNode>().strength(CHARGE_STRENGTH))
    .force(
      "link",
      forceLink<SimNode, SimLink>(links)
        .id((d) => d.id)
        .distance(LINK_DISTANCE),
    )
    .force("center", forceCenter<SimNode>(width / 2, height / 2))
    .force("collide", forceCollide<SimNode>(COLLISION_RADIUS))
    .on("tick", broadcastTick);

  return sim;
}


/**
 * Sends a lightweight snapshot of positions back to the main thread.
 * Only serialises the fields the canvas renderer actually needs.
 */
function broadcastTick(): void {
  const tickNodes = nodes.map((n) => ({
    id: n.id,
    name: n.name,
    type: n.type,
    size: n.size,
    x: n.x ?? 0,
    y: n.y ?? 0,
  }));

  const tickLinks = links.map((l) => ({
    sourceX: (l.source as SimNode).x ?? 0,
    sourceY: (l.source as SimNode).y ?? 0,
    targetX: (l.target as SimNode).x ?? 0,
    targetY: (l.target as SimNode).y ?? 0,
    relation: l.relation,
  }));

  self.postMessage({ type: "TICK", nodes: tickNodes, links: tickLinks });
}

/* ------------------------------------------------------------------ */
/*  Drag Helpers                                                       */
/* ------------------------------------------------------------------ */

const DRAG_ALPHA_TARGET = 0.3;

function findNodeById(nodeId: string): SimNode | undefined {
  return nodes.find((n) => n.id === nodeId);
}

function handleDragStart(nodeId: string, x: number, y: number): void {
  if (!simulation) return;
  simulation.alphaTarget(DRAG_ALPHA_TARGET).restart();

  const node = findNodeById(nodeId);
  if (node) {
    node.fx = x;
    node.fy = y;
  }
}

function handleDrag(nodeId: string, x: number, y: number): void {
  const node = findNodeById(nodeId);
  if (node) {
    node.fx = x;
    node.fy = y;
  }
}

function handleDragEnd(nodeId: string): void {
  if (!simulation) return;
  simulation.alphaTarget(0);

  const node = findNodeById(nodeId);
  if (node) {
    node.fx = null;
    node.fy = null;
  }
}

/* ------------------------------------------------------------------ */
/*  Message Handler                                                    */
/* ------------------------------------------------------------------ */

self.onmessage = (event: MessageEvent<InboundMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case "INIT":
      nodes = msg.nodes;
      links = msg.links;

      if (simulation) {
        simulation.stop();
      }
      simulation = createSimulation();
      break;

    case "UPDATE_DIMENSIONS":
      width = msg.width;
      height = msg.height;

      if (simulation) {
        simulation
          .force("center", forceCenter<SimNode>(width / 2, height / 2))
          .alpha(0.3)
          .restart();
      }
      break;

    case "DRAG_START":
      handleDragStart(msg.nodeId, msg.x, msg.y);
      break;

    case "DRAG":
      handleDrag(msg.nodeId, msg.x, msg.y);
      break;

    case "DRAG_END":
      handleDragEnd(msg.nodeId);
      break;
  }
};
